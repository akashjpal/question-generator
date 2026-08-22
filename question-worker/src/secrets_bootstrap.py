import os

import aioboto3
from dotenv import load_dotenv


async def load_secrets_into_env() -> None:
    """Fetches secrets from ministack Secrets Manager into os.environ before Settings() is built."""
    # Settings() loads .env internally via pydantic-settings, but that hasn't run yet at this
    # point — outside Docker (where docker-compose's `environment:` block supplies these), local
    # runs need .env loaded explicitly so AWS_ENDPOINT/etc. are actually in os.environ below.
    load_dotenv()
    session = aioboto3.Session()
    async with session.client(
        "secretsmanager",
        endpoint_url=os.environ["AWS_ENDPOINT"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ["AWS_REGION"],
    ) as client:
        for env_name, secret_name in (
            ("SUPABASE_SERVICE_ROLE_KEY", "supabase-service-role-key"),
            ("OPENROUTER_API_KEY", "openrouter-api-key"),
        ):
            response = await client.get_secret_value(SecretId=f"question-generator/{secret_name}")
            os.environ[env_name] = response["SecretString"]
