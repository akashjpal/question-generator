import os

from dotenv import find_dotenv, load_dotenv

# load_dotenv() with no explicit path searches UPWARD from this file's directory
# through parent directories until it finds a .env — so if ai-agent-chatbot/.env
# doesn't exist, it silently falls back to the repo-root .env instead (which has
# different defaults, e.g. CORS_ORIGIN=http://localhost with no port). Printed
# (not logged) because this module is imported before main.py's logging.basicConfig()
# runs, so a logger.info() here would be silently dropped by the default WARNING level.
_dotenv_path = find_dotenv(usecwd=False)
print(f"[config] Loading environment from: {_dotenv_path or '(no .env found on search path)'}", flush=True)
load_dotenv(_dotenv_path or None)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

QUESTION_GENERATOR_API_URL = os.getenv("QUESTION_GENERATOR_API_URL", "http://localhost:3000")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
AGENT_OPENROUTER_MODEL = os.getenv("AGENT_OPENROUTER_MODEL", "moonshotai/kimi-k2")

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:4200")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:4200")

PORT = int(os.getenv("PORT", "8010"))

# Job status enum shared across the whole platform (0=Queued,1=Processing,2=Completed,3=Failed)
STATUS_QUEUED = 0
STATUS_PROCESSING = 1
STATUS_COMPLETED = 2
STATUS_FAILED = 3
