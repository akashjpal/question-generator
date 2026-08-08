# MiniStack (LocalStack) Setup — S3 + Lambda AV Scan Pipeline

> **MiniStack, StackPort, and provisioning are now managed by `docker-compose.yml`.**
> Running `docker compose up` starts `ministack`, `stackport`, and
> `ministack-init` — a persistent sidecar (not a one-shot job, and not
> MiniStack's own `docker-entrypoint-initaws.d` hook, which turned out to
> deadlock against MiniStack's own startup — see `ministack/init/init-lambda.sh`
> for why). `ministack-init` runs `ministack/init/init-lambda.sh` in a loop:
> it watches the gateway and, whenever it finds the Lambda function missing
> (on first boot, or right after `ministack` restarts and wipes its
> unpersisted state), re-creates the S3 buckets (if missing), IAM role,
> Lambda function, invoke permission, and notification config. This MiniStack
> build has no persistence mechanism at all for Lambda/IAM/notification
> config, so there's no way for them to survive a restart other than
> recreating them. S3 bucket *contents* now persist for real, via the
> `ministack-data` volume (`S3_PERSIST=1`).
>
> Steps 1–3, 5, and 7 below are now automatic — they're kept only as reference
> for what the init script does and how to run the equivalent commands by
> hand if you need to. Steps 4, 6, 8, and 9 (packaging the Lambda, updating
> its code, manual invoke, reading logs) are still manual dev workflow steps.

## 1. Start ministack + configure AWS CLI

*(Automatic via `docker compose up` — see the note above.)*

```bash
aws configure --profile local
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

StackPort (resource browser UI for LocalStack/ministack, runs on :8080) is now
the `stackport` service in `docker-compose.yml`. The manual `docker run` below
is kept only for reference:

```bash
docker run -p 8080:8080 `
  -e AWS_ENDPOINT_URL=http://host.docker.internal:4566 `
  -e AWS_ACCESS_KEY_ID=test `
  -e AWS_SECRET_ACCESS_KEY=test `
  -e AWS_REGION=us-east-1 `
  davireis/stackport
```

## 2. Create the S3 buckets

*(Automatic via `ministack/init/init-lambda.sh` — idempotent, safe to re-run.)*

Three buckets: uploads land in `all-files`, and the Lambda routes them to `correct-files` (clean) or `infected-files` (quarantine) after scanning.

```bash
aws --profile local --endpoint-url=http://localhost:4566 s3 mb s3://all-files
aws --profile local --endpoint-url=http://localhost:4566 s3 mb s3://correct-files
aws --profile local --endpoint-url=http://localhost:4566 s3 mb s3://infected-files
```

## 3. Create the IAM execution role for the Lambda

*(Automatic via the `ministack-init` watcher — this and the Lambda/IAM/notification
config below get re-created whenever `ministack-init` notices the Lambda is
missing (first boot, or after a `ministack` restart), since this MiniStack
build can't persist them.)*

Uses `lambda/trust-policy.json` (allows the Lambda service to assume this role):

```bash
aws --endpoint-url=http://localhost:4566 iam create-role \
  --role-name lambda-role \
  --assume-role-policy-document file://trust-policy.json
```

## 4. Package the Lambda

`node_modules` must be zipped in — Lambda doesn't run `npm install` for you. `.env` is deliberately **not** zipped in; Lambda gets its config from `--environment` (see step 6), not a bundled dotenv file.

```bash
cd lambda
zip -r function.zip index.js node_modules
```

## 5. Create the Lambda function (first-time only)

*(Automatic via the `ministack-init` watcher — this MiniStack build can't
persist the function, so it's recreated fresh whenever it's found missing,
not only "first-time." Kept here for reference.)*

```bash
aws lambda create-function \
  --function-name my-first-lambda \
  --runtime nodejs20.x \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::000000000000:role/lambda-role \
  --environment "Variables={AWS_ENDPOINT_URL=http://ministack:4566,CLAMAV_HOST=clamav,CLAMAV_PORT=3310}" \
  --endpoint-url=http://localhost:4566
```

## 6. Update the Lambda after any code/config change

`update-function-code` and `update-function-configuration` are separate calls — `--environment` on `update-function-configuration` **replaces the whole variable map**, it does not merge, so always pass the full set.

```bash
# after editing index.js
cd lambda
zip -r function.zip index.js node_modules

aws lambda update-function-code \
  --function-name my-first-lambda \
  --zip-file fileb://function.zip \
  --endpoint-url=http://localhost:4566

aws lambda update-function-configuration \
  --function-name my-first-lambda \
  --environment "Variables={AWS_ENDPOINT_URL=http://ministack:4566,CLAMAV_HOST=clamav,CLAMAV_PORT=3310,AWS_BUCKET_ALL=all-files,AWS_BUCKET_CORRECT=correct-files,AWS_BUCKET_INFECTED=infected-files,AWS_ACCESS_KEY_ID=test,AWS_SECRET_ACCESS_KEY=test,AWS_REGION=us-east-1}" \
  --endpoint-url=http://localhost:4566
```

Note: `AWS_ENDPOINT_URL`/`CLAMAV_HOST` use the Docker Compose service names (`ministack`, `clamav`), not `localhost` — inside the Lambda's own execution container, `localhost` refers to that container itself, and since ministack now runs on the Compose network alongside `clamav`, the service name resolves correctly there (this replaces the old standalone-container setup, which needed `host.docker.internal` instead).

If you change these values, also update them in `ministack/init/init-lambda.sh` so they stay correct on the next container start (the init script's version is what actually applies after any restart).

## 7. Wire the S3 → Lambda trigger

*(Automatic via the `ministack-init` watcher — kept here for reference.)*

Two steps, both required on real AWS — LocalStack sometimes lets you skip the first one, but don't rely on that.

**7a. Grant S3 permission to invoke the Lambda.** `put-bucket-notification-configuration` alone only tells S3 *which* function to call — it doesn't authorize the call. Without this resource-based permission, S3 gets `AccessDenied` invoking the function (this is easy to miss locally since ministack may not enforce it, then breaks the moment this runs against real AWS):

```bash
aws lambda add-permission \
  --function-name my-first-lambda \
  --statement-id AllowS3InvokeAllFiles \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::all-files \
  --endpoint-url=http://localhost:4566
```

**7b. Attach the notification config.** `lambda/notification.json` to `all-files` so any upload there invokes the Lambda automatically:

```bash
aws s3api put-bucket-notification-configuration \
  --bucket all-files \
  --notification-configuration file://notification.json \
  --endpoint-url=http://localhost:4566
```

Verify it's actually attached:

```bash
aws s3api get-bucket-notification-configuration \
  --bucket all-files \
  --endpoint-url=http://localhost:4566
```

## 8. Invoke manually (without a real S3 upload)

```bash
aws lambda invoke \
  --function-name my-first-lambda \
  --payload file://test-event.json \
  --endpoint-url=http://localhost:4566 \
  out.json && cat out.json
```

`test-event.json` must contain a real `Records` array shaped like an S3 event, e.g.:

```json
{
  "Records": [
    { "s3": { "bucket": { "name": "all-files" }, "object": { "key": "<uuid>-filename.pdf" } } }
  ]
}
```

## 9. Read logs

`aws logs tail` is broken against ministack (`KeyError: 'eventId'` — LocalStack's log events omit a field the newer `tail` command requires). Use one of these instead:

```bash
# CLI, via CloudWatch Logs API
aws logs filter-log-events \
  --log-group-name /aws/lambda/my-first-lambda \
  --endpoint-url=http://localhost:4566

# Or read the LocalStack container's own stdout directly (most reliable)
docker ps
docker logs -f <localstack-container-name>
```
