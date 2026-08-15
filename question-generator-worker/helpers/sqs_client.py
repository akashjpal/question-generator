import os

import boto3
from botocore.config import Config
from dotenv import load_dotenv

# Self-contained: currently this module's clients are only ever built lazily
# at call-time, after consumer.py's own load_dotenv() has run — but that's an
# accident of call order, not something this module can rely on (see the
# identical bug this fixed in s3_client.py, where an eagerly-built client
# read AWS_* env vars before load_dotenv() had run).
load_dotenv()


def get_sqs_client():
    """boto3 SQS client. AWS_ENDPOINT targets ministack locally; unset/None
    for real AWS in production, where boto3's default endpoint resolution applies."""
    return boto3.client(
        "sqs",
        endpoint_url=os.getenv("AWS_ENDPOINT") or None,
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


def get_queue_url() -> str:
    """Always read the queue URL from config, never from an SQS API response —
    ministack returns QueueUrl with 'localhost:4566', which is unreachable
    from inside another container."""
    queue_url = os.getenv("SQS_QUEUE_URL")
    if not queue_url:
        raise RuntimeError("SQS_QUEUE_URL environment variable is not set.")
    return queue_url
