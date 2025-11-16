import os
import requests
import pdfplumber
import pytesseract
from pdf2image import convert_from_bytes
import io
import google.generativeai as genai
from dotenv import load_dotenv
load_dotenv()   # <-- THIS loads .env automatically


genai.configure(api_key=os.getenv("GEMINI_API_KEY"))


def extract_text(file_bytes):
    text = ""

    # Try text-based PDF first
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"
    except:
        pass

    # OCR fallback
    # if len(text.strip()) < 10:
    #     try:
    #         images = convert_from_bytes(file_bytes)
    #         for img in images:
    #             text += pytesseract.image_to_string(img)
    #     except:
    #         text += pytesseract.image_to_string(io.BytesIO(file_bytes))

    return text.strip()

def generate_questions(chunk):
    prompt = f"""
    Generate exactly 5 high-quality MCQs from the following content.

    IMPORTANT INSTRUCTIONS:
    - If any code snippet, formula, or specific reference from the content is used in a question, include that code/formula/reference directly in the question text.
    - For code-based questions, embed the relevant code snippet within the question.
    - Ensure options and explanations also use the the specific content when applicable in the question itself.

    Return as a JSON array of objects with this structure:
    [
    {{
        "question": "...",
        "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
        "correct_answer": "A",
        "explanation": "..."
    }}
    ]

    Content:
    {chunk}
    """


    # response = openai.chat.completions.create(
    #     model="gpt-4o-mini",
    #     messages=[{"role": "user", "content": prompt}]
    # )

    # return response.choices[0].message.content

    model = genai.GenerativeModel("models/gemini-2.0-flash")  # fast + cheap
    response = model.generate_content(prompt)

    return response.text

    # return "Sample questions for chunk."

def chunk_text(text, max_words=1200):
    """
    Splits large text into chunks of ~1200 words (good for LLM processing).
    Keeps paragraph boundaries where possible.
    """
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks = []
    current = []

    current_len = 0
    for para in paragraphs:
        para_len = len(para.split())

        if current_len + para_len > max_words:
            chunks.append("\n".join(current))
            current = [para]
            current_len = para_len
        else:
            current.append(para)
            current_len += para_len

    if current:
        chunks.append("\n".join(current))

    return chunks


def create_questions_from_pdf_text(text):
    # Step 1: Chunk the text
    chunks = chunk_text(text)

    print(f"Total chunks created: {len(chunks)}")

    all_questions = []

    # Step 2: Generate questions per chunk
    for i, chunk in enumerate(chunks):
        print(f"Generating questions for chunk {i+1}/{len(chunks)}...")
        q = generate_questions(chunk)
        all_questions.append(q)

    # Step 3: Combine all text
    final = "\n\n".join(all_questions)

    return final

def main(data):
    fileId = data.get("fileId")
    if not fileId:
        return {"error": "fileId missing"}

    APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
    APPWRITE_PROJECT = os.getenv("APPWRITE_PROJECT")
    APPWRITE_API_KEY = os.getenv("APPWRITE_API_KEY")
    APPWRITE_BUCKET_ID = os.getenv("APPWRITE_BUCKET_ID")
    # Download from Appwrite
    url = (
        f"{APPWRITE_ENDPOINT}/storage/"
        f"buckets/{APPWRITE_BUCKET_ID}/files/{fileId}/download"
    )

    headers = {
        "X-Appwrite-Project": APPWRITE_PROJECT,
        "X-Appwrite-Key": APPWRITE_API_KEY,
    }

    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        return {"error": "Failed to download file"}

    file_bytes = resp.content

    text = extract_text(file_bytes)
    questions = create_questions_from_pdf_text(text)

    print("Questions generated.")
    print(questions)

    return {
        "fileId": fileId,
        "text": text
    }
