from botocore.exceptions import ClientError

from helpers.s3_client import get_correct_bucket, get_s3_client

s3 = get_s3_client()


def download_file(file_path: str) -> bytes:
    """Download file bytes from S3 (ministack) into memory. Reads from the
    'correct' bucket the AV-scan Lambda moves clean uploads into — never the
    intake bucket, since a file only lands there once it's been scanned."""
    try:
        response = s3.get_object(Bucket=get_correct_bucket(), Key=file_path)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in ("NoSuchKey", "404"):
            raise FileNotFoundError(f"File not found in storage: {file_path}") from exc
        raise
    return response["Body"].read()
