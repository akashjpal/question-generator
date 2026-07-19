import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from routers import chat, health, help as help_router, upload

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


app = FastAPI(title="AI Question Generator — Agentic Chatbot")

# CORS_ORIGIN is a comma-separated list (see .env.example / question-generator-worker's
# main.py for the same convention) — previously this wrapped the raw string in a
# single-element list instead of splitting it, so a multi-origin value never matched
# any real browser Origin header and every preflight request got a blanket 400.
#
# CORS_ORIGIN is shared across services and, in this repo's root .env, is written
# generically (e.g. "http://localhost" with no port) for services that sit behind a
# reverse proxy. This service is also configured with FRONTEND_ORIGIN specifically —
# the exact origin the Angular app runs on, already required for building attempt
# links — so it's included here too rather than relying solely on the shared value.
_cors_origins = sorted({
    *(origin.strip() for origin in config.CORS_ORIGIN.split(",") if origin.strip()),
    config.FRONTEND_ORIGIN,
})
logger.info(
    "CORS allow_origins resolved to: %r (raw CORS_ORIGIN=%r, FRONTEND_ORIGIN=%r)",
    _cors_origins, config.CORS_ORIGIN, config.FRONTEND_ORIGIN,
)
app.include_router(health.router)
app.include_router(help_router.router)
app.include_router(upload.router)
app.include_router(chat.router)

# Wrap the complete ASGI application so CORS headers are also present on
# unhandled 500 responses. FastAPI's add_middleware() placement can leave
# error responses generated outside the middleware stack without the header,
# which makes a backend exception look like a browser CORS failure.
app = CORSMiddleware(
    app=app,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
