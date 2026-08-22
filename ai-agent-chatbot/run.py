"""Docker entrypoint: `python run.py`, equivalent to
`uvicorn main:app --host 0.0.0.0 --port <PORT>` but fetches secrets from
ministack Secrets Manager first.

uvicorn's dynamic "main:app" string import happens *inside* its own already-
running event loop, so `main.py` can't call asyncio.run() itself. Instead
this script does the secrets fetch (its own asyncio.run(), which fully
completes and closes before anything else starts), then imports `main`
(so config.py's os.getenv() reads see the now-populated os.environ) and
hands uvicorn the already-built app object instead of a string, so it never
re-imports "main" from inside its loop.
"""
import asyncio
import os

from secrets_bootstrap import load_secrets_into_env

asyncio.run(load_secrets_into_env())

import uvicorn

from main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8010")))
