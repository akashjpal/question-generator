from helpers.supabase_client import supabase, BUCKET_NAME

def download_file(file_path: str) -> bytes:
    """Download file bytes from Supabase Storage into memory."""
    file_bytes = supabase.storage.from_(BUCKET_NAME).download(file_path)
    if not file_bytes:
        raise FileNotFoundError(f"File not found in storage: {file_path}")
    return file_bytes
