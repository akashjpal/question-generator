from fastapi import FastAPI, HTTPException
from helpers.file_downloader import download_file
from helpers.text_extractor import extract_text_from_pdf
from helpers.question_generator import generate_questions_with_llm, save_questions_to_db
from models.schemas import GenerateQuestionsRequest, GenerateQuestionsResponse

app = FastAPI()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/generate-questions", response_model=GenerateQuestionsResponse)
def generate_questions(request: GenerateQuestionsRequest):
    """
    Main orchestrator:
    1. Download file from Supabase Storage
    2. Extract text from PDF
    3. Generate questions using LLM
    4. Save questions to DB
    """
    # Step 1: Download file from Supabase Storage
    file_bytes = download_file(request.file_path)

    # Step 2: Extract text from PDF
    result = extract_text_from_pdf(file_bytes)

    # Step 3: Generate questions using LLM
    questions = generate_questions_with_llm(
        text=result["text"],
        topic=request.topic,
        difficulty=request.difficulty,
        num_questions=request.num_questions,
    )

    # Step 4: Save to Supabase DB
    saved = save_questions_to_db(questions, request.job_id)

    return GenerateQuestionsResponse(
        job_id=request.job_id,
        file_path=request.file_path,
        page_count=result["page_count"],
        questions=saved,
        total_generated=len(saved),
    )