from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All worker configuration. Values mirror the live SQS/S3/Supabase/OpenRouter
    contracts already established by question-generator-worker and
    question-generator-api-ts — see question_worker_implementation_plan.md's
    'Reused contracts' table before changing any default here."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # OpenRouter (OpenAI-compatible)
    openrouter_api_key: str
    llm_model: str = "moonshotai/kimi-k2"
    judge_model: str = "moonshotai/kimi-k2"
    embedding_model: str = "openai/text-embedding-3-small"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # AWS / ministack
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "us-east-1"
    aws_endpoint: str | None = None
    aws_bucket_correct: str = "correct-files"

    # SQS
    sqs_queue_url: str
    sqs_dlq_url: str | None = None
    sqs_max_messages: int = 5
    sqs_wait_time: int = 20
    sqs_visibility_timeout: int = 120
    sqs_max_receive_count: int = 3
    visibility_heartbeat_interval: int = 60
    worker_concurrency: int = 3

    # Pipeline tuning
    max_regeneration_rounds: int = 3
    duplicate_similarity_threshold: float = 0.90
    min_extracted_chars: int = 200
    min_chars_per_question: int = 400


@lru_cache
def get_settings() -> Settings:
    return Settings()
