import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

from src.config import Settings
from src.graph.errors import PermanentJobError, TransientJobError
from src.utils.retry import async_retry_transient

MAX_PDF_BYTES = 10 * 1024 * 1024  # defensive cap; upload path already enforces this


def _session_kwargs(settings: Settings) -> dict:
    """Mirrors question-generator-worker/helpers/s3_client.py exactly: unset
    AWS_ENDPOINT falls through to real AWS endpoint resolution, path-style
    addressing because ministack (like LocalStack/MinIO) doesn't support
    virtual-hosted-style bucket URLs."""
    return dict(
        endpoint_url=settings.aws_endpoint or None,
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        config=Config(retries={"max_attempts": 3, "mode": "standard"}, s3={"addressing_style": "path"}),
    )


class StorageService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._session = aioboto3.Session()

    @async_retry_transient
    async def download_pdf(self, key: str) -> bytes:
        """Download an object from the 'correct' bucket (AV-scanned) into
        memory. NoSuchKey is permanent (retrying won't summon a file into
        existence); everything else is treated as transient and retried."""
        async with self._session.client("s3", **_session_kwargs(self._settings)) as s3:
            try:
                response = await s3.get_object(Bucket=self._settings.aws_bucket_correct, Key=key)
            except ClientError as exc:
                error_code = exc.response.get("Error", {}).get("Code")
                if error_code in ("NoSuchKey", "404"):
                    raise PermanentJobError(f"File not found in storage: {key}", stage="fetch_pdf") from exc
                raise TransientJobError(f"S3 get_object failed for {key}: {exc}") from exc

            content_length = response.get("ContentLength")
            if content_length is not None and content_length > MAX_PDF_BYTES:
                raise PermanentJobError(
                    f"File {key} is {content_length} bytes, exceeds {MAX_PDF_BYTES}-byte cap",
                    stage="fetch_pdf",
                )

            body = await response["Body"].read()
            if len(body) > MAX_PDF_BYTES:
                raise PermanentJobError(
                    f"File {key} body is {len(body)} bytes, exceeds {MAX_PDF_BYTES}-byte cap",
                    stage="fetch_pdf",
                )
            return body
