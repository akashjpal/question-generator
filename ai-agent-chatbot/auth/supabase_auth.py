"""
Supabase bearer-token verification.

Mirrors question-generator-api-ts/helpers/requireAuth.ts: reads the
Authorization header, calls supabase.auth.get_user(token), and attaches the
verified user to the request. Every session/upload/chat endpoint depends on
verify_supabase_token.
"""
import logging

from fastapi import Depends, Header, HTTPException
from supabase import create_client, Client

import config

logger = logging.getLogger(__name__)

_supabase_admin: Client | None = None


def get_supabase_admin() -> Client:
    """Service-role client, used for DB/storage access from this service."""
    global _supabase_admin
    if _supabase_admin is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured")
        _supabase_admin = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_admin


class AuthedUser:
    def __init__(self, id: str, email: str | None, token: str):
        self.id = id
        self.email = email
        self.token = token


async def verify_supabase_token(
    authorization: str | None = Header(default=None),
) -> AuthedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: No token provided")

    token = authorization[len("Bearer "):]
    client = get_supabase_admin()

    try:
        result = client.auth.get_user(token)
    except Exception as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or expired token")

    user = getattr(result, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or expired token")

    return AuthedUser(id=user.id, email=user.email, token=token)


CurrentUser = Depends(verify_supabase_token)
