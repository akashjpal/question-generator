import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from auth.supabase_auth import CurrentUser, AuthedUser
from agent.tools.qgen_api_client import QGenApiClient, QGenApiError
from models.schemas import UploadResponse
from persistence import chat_store

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # matches the TS API's express.raw limit


@router.post("/sessions/{session_id}/upload", response_model=UploadResponse)
async def upload_pdf(session_id: str, file: UploadFile = File(...), user: AuthedUser = CurrentUser):
    session = await chat_store.get_session(session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds the 10MB upload limit.")

    client = QGenApiClient(user.token)
    try:
        result = await client.upload_file(contents, file.filename or "upload.pdf")
    except QGenApiError as exc:
        logger.error("Upload forwarding failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}")

    file_id = result["fileId"]
    file_name = result.get("filename", file.filename or "upload.pdf")
    await chat_store.set_pending_file(session_id, file_id, file_name)

    return UploadResponse(fileId=file_id, fileName=file_name)
