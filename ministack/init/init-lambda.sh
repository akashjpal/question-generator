#!/bin/sh

# Runs as the persistent `ministack-init` Compose service (restart: unless-stopped).
# This is NOT a one-shot job: MiniStack's Lambda function, IAM role, and S3
# notification config cannot survive a `ministack` container restart (no
# persistence mechanism exists for them in this build — see
# RCA_Bug_MinistackDataLoss.md), so this loop keeps watching and re-provisions
# them every time it notices ministack came back up without the Lambda
# function already present. It does NOT run as MiniStack's own
# docker-entrypoint-initaws.d hook because that hook runs as a *blocking*
# part of MiniStack's own ASGI startup, before the gateway can answer HTTP
# requests — calling the gateway from there deadlocks against its own
# startup (observed directly: hypercorn LifespanTimeoutError).

ENDPOINT="--endpoint-url=http://ministack:4566 --cli-connect-timeout 3 --cli-read-timeout 15"
QUEUE_BASE="http://ministack:4566/000000000000"

# SQS: main + DLQ for question generation jobs. Called on every loop tick
# (not gated behind the Lambda-missing check below) since create-queue and
# set-queue-attributes are both idempotent, and this way the queues self-heal
# regardless of whether ministack's general PERSIST_STATE actually survives
# a restart for SQS specifically — same "assume nothing persists, keep
# re-asserting desired state" approach as the Lambda/IAM provisioning below.
provision_sqs() {
  aws $ENDPOINT sqs create-queue --queue-name question-generator-dlq >/dev/null 2>&1 || true
  aws $ENDPOINT sqs create-queue --queue-name question-generator >/dev/null 2>&1 || true

  DLQ_ARN=$(aws $ENDPOINT sqs get-queue-attributes \
    --queue-url "$QUEUE_BASE/question-generator-dlq" \
    --attribute-names QueueArn --query "Attributes.QueueArn" --output text 2>/dev/null)

  if [ -n "$DLQ_ARN" ]; then
    aws $ENDPOINT sqs set-queue-attributes \
      --queue-url "$QUEUE_BASE/question-generator" \
      --attributes "{\"VisibilityTimeout\":\"900\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" \
      >/dev/null 2>&1
  fi
}

provision() {
  # Buckets: idempotent, since S3_PERSIST=1 means these may already exist after a restart
  aws $ENDPOINT s3 mb s3://all-files 2>/dev/null || true
  aws $ENDPOINT s3 mb s3://correct-files 2>/dev/null || true
  aws $ENDPOINT s3 mb s3://infected-files 2>/dev/null || true

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

  echo "ministack-init: provisioning complete ($(date -u +%Y-%m-%dT%H:%M:%SZ))."
}

while true; do
  # Wait until the gateway genuinely answers (not just accepts TCP).
  until aws $ENDPOINT s3 ls >/dev/null 2>&1; do
    sleep 2
  done

  provision_sqs

  # Only (re)provision if the Lambda isn't there — i.e. first boot, or
  # ministack just restarted and wiped its unpersisted Lambda/IAM state.
  if ! aws $ENDPOINT lambda get-function --function-name my-first-lambda >/dev/null 2>&1; then
    provision
  fi

  sleep 5
done
