import os

import boto3
from botocore.config import Config
from dotenv import load_dotenv

# Self-contained, like supabase_client.py: file_downloader.py builds this
# client at import time, which can happen before consumer.py's own
# load_dotenv() call runs (import statements execute before later lines in
# the importing module) — without this, AWS_* env vars read as None and
# boto3 falls through to NoCredentialsError.
load_dotenv()


def get_s3_client():
    """boto3 S3 client. AWS_ENDPOINT targets ministack locally; unset/None
    for real AWS in production, where boto3's default endpoint resolution
    applies. Path-style addressing matches the other S3 clients in this repo
    (lambda/index.js, s3Client.ts both set forcePathStyle: true) — ministack,
    like MinIO/LocalStack, doesn't support virtual-hosted-style bucket URLs."""
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("AWS_ENDPOINT") or None,
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        config=Config(
            retries={"max_attempts": 3, "mode": "standard"},
            s3={"addressing_style": "path"},
        ),
    )


def get_correct_bucket() -> str:
    """Bucket the AV-scan Lambda moves clean uploads into (see lambda/index.js
    moveToCleanFolder) — this is where the worker reads files from, never the
    intake bucket (AWS_BUCKET_ALL), since unscanned files may still be infected."""
    return os.getenv("AWS_BUCKET_CORRECT", "correct-files")
