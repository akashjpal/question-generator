import fitz  # PyMuPDF


def extract_text_from_pdf(file_bytes: bytes) -> dict:
    """Extract text from PDF bytes in memory. Returns text and page count."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    page_count = doc.page_count
    doc.close()
    return {"text": text, "page_count": page_count}
