# MiniStack Persistence & Compose Integration — Design

**Date:** 2026-08-08
**Status:** Approved
**Related:** `RCA_Bug_MinistackDataLoss.md`

## Problem

MiniStack (the LocalStack-compatible AWS emulator used for the S3 upload + ClamAV Lambda scan pipeline) is run as an undocumented, standalone `docker run` container, outside `docker-compose.yml`. It runs with `S3_PERSIST=0` and no persistence flag at all for Lambda/IAM/notification config. When the container process restarted on 2026-08-08 (six days after setup), every S3 bucket, the Lambda function, its IAM role, and the S3→Lambda notification wiring were wiped, because none of it was ever written to durable storage. Full details and log evidence are in `RCA_Bug_MinistackDataLoss.md`.

## Goal

MiniStack's data (buckets and their objects) must survive both container restarts and full container recreation. Resources that this MiniStack build has no persistence mechanism for at all (Lambda function, IAM role, S3 notification config) must be automatically and reliably re-established on every container start, so the pipeline is always in a working state without manual `aws` CLI replay.

MiniStack and its resource-browser UI (StackPort) become part of `docker compose up`, matching how the rest of the stack (redis, clamav, etc.) is already managed.

**Non-goal:** wiring the application services (`question-generator-api`, `file-scanner-worker`) to use MiniStack instead of Supabase. That belongs to the broader `task/supabase-to-ministack` migration and is out of scope here — this design only makes the local MiniStack dev infrastructure reliable.

## Design

### 1. `ministack` service in `docker-compose.yml`

```yaml
ministack:
  image: ministackorg/ministack
  environment:
    - S3_PERSIST=1
    - S3_DATA_DIR=/var/lib/ministack/s3
    - GATEWAY_PORT=4566
  ports:
    - "4566:4566"
  volumes:
    - ministack-data:/var/lib/ministack
    - ./ministack/init:/docker-entrypoint-initaws.d
    - ./lambda:/lambda-src:ro
  healthcheck:
    test: ["CMD", "curl", "-sf", "http://localhost:4566/_localstack/health"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 30s
  restart: unless-stopped

stackport:
  image: davireis/stackport
  environment:
    - AWS_ENDPOINT_URL=http://ministack:4566
    - AWS_ACCESS_KEY_ID=test
    - AWS_SECRET_ACCESS_KEY=test
    - AWS_REGION=us-east-1
  ports:
    - "8080:8080"
  depends_on:
    - ministack
  restart: unless-stopped

volumes:
  ministack-data:
```

Notes:
- `S3_DATA_DIR` moves off `/tmp` to the persisted volume root, so S3 objects survive both a `docker restart` and a full `docker compose down && docker compose up` (new container, same named volume).
- `stackport` talks to `ministack` over the Docker Compose network by service name, replacing its current `host.docker.internal` dependency on the standalone container.
- The healthcheck endpoint (`/_localstack/health`) is LocalStack's convention; MiniStack is presumed compatible since it mirrors LocalStack's env-var and init-hook conventions elsewhere (`docker-entrypoint-initaws.d`, `S3_PERSIST`). If the endpoint differs, this gets corrected during implementation by inspecting the container's actual HTTP surface — it does not change the design.

### 2. Init script for resources that can't persist

`docker exec` on the current container confirms only `S3_PERSIST` and `RDS_PERSIST` exist — there is no persistence flag for Lambda, IAM, or notification config in this MiniStack build. Rather than accept the recurring manual setup, `ministack/init/init-lambda.sh` is mounted into `docker-entrypoint-initaws.d/` and runs automatically on every container start (LocalStack/MiniStack's standard init-hook convention):

```bash
#!/bin/bash
set -e

ENDPOINT="--endpoint-url=http://localhost:4566"

# Buckets: idempotent, since S3_PERSIST=1 means these may already exist after a restart
aws $ENDPOINT s3 mb s3://all-files 2>/dev/null || true
aws $ENDPOINT s3 mb s3://correct-files 2>/dev/null || true
aws $ENDPOINT s3 mb s3://infected-files 2>/dev/null || true

# IAM role, Lambda, permissions, notification config: cannot persist in this
# MiniStack build, so these run unconditionally on every start (~2-3s).
aws $ENDPOINT iam create-role \
  --role-name lambda-role \
  --assume-role-policy-document file:///lambda-src/trust-policy.json

aws $ENDPOINT lambda create-function \
  --function-name my-first-lambda \
  --runtime nodejs20.x \
  --handler index.handler \
  --zip-file fileb:///lambda-src/function.zip \
  --role arn:aws:iam::000000000000:role/lambda-role \
  --environment "Variables={AWS_ENDPOINT_URL=http://ministack:4566,CLAMAV_HOST=clamav,CLAMAV_PORT=3310,AWS_BUCKET_ALL=all-files,AWS_BUCKET_CORRECT=correct-files,AWS_BUCKET_INFECTED=infected-files,AWS_ACCESS_KEY_ID=test,AWS_SECRET_ACCESS_KEY=test,AWS_REGION=us-east-1}"

aws $ENDPOINT lambda add-permission \
  --function-name my-first-lambda \
  --statement-id AllowS3InvokeAllFiles \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::all-files

aws $ENDPOINT s3api put-bucket-notification-configuration \
  --bucket all-files \
  --notification-configuration file:///lambda-src/notification.json
```

- `lambda/function.zip`, `lambda/trust-policy.json`, and `lambda/notification.json` are bind-mounted read-only at `/lambda-src`, so the init script always deploys whatever was last built via `zip -r function.zip index.js node_modules` (per existing `MINISTACK_SHELL_RUN.md` step 4) — no rebuild logic needed here, that stays a manual dev step.
- `CLAMAV_HOST`/`AWS_ENDPOINT_URL` switch from `host.docker.internal` to Compose service names (`clamav`, `ministack`), since the Lambda's execution container and ClamAV both now live on the same Compose network.
- Fixes the `infected-file` (singular) vs `infected-files` naming inconsistency found in the RCA — the init script and all docs consistently use `infected-files`.

### 3. `MINISTACK_SHELL_RUN.md` updates

- Steps 1–2 (start container, create buckets) replaced with: `docker compose up ministack stackport` (or just let the full `docker compose up` bring them up with everything else).
- Steps 3, 5, 7 (IAM role, Lambda creation, permissions/notification) get a note that these now run automatically via `ministack/init/init-lambda.sh` on every container start; the original manual commands are kept as reference documentation only.
- Step 6 (`update-function-code` / `update-function-configuration`) remains manual — it's for iterating on Lambda code during active development, not startup provisioning, and doesn't fit the init-script model since it's an update, not idempotent creation.
- Steps 8–9 (manual invoke, reading logs) unchanged.

## Testing Plan

1. `docker compose down -v` on ministack's volume (clean slate), then `docker compose up ministack stackport`.
2. Verify via `aws --endpoint-url=http://localhost:4566 s3 ls`, `aws lambda get-function --function-name my-first-lambda`, and `aws s3api get-bucket-notification-configuration --bucket all-files` that all three buckets, the Lambda function, and the notification config exist.
3. Upload a test object to `all-files`, confirm the Lambda fires (via StackPort or `aws logs filter-log-events`).
4. `docker compose restart ministack` (simulates the exact failure from the RCA — a container process restart).
5. Re-run the same verification from step 2: buckets **and the object uploaded in step 3** must still be present (proves `S3_PERSIST=1` + the volume actually persist data); Lambda/IAM/notification config must also be present (proves the init script re-ran and re-created them).
