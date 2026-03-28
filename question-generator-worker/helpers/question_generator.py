# TODO: Implement LLM integration (OpenAI / Gemini / Claude)
# This is the placeholder — we'll fill this in next step


def generate_questions_with_llm(text: str, topic: str, difficulty: str, num_questions: int) -> list[dict]:
    """Send extracted text + prompt to LLM and return generated MCQs."""
    # Placeholder — will be replaced with actual LLM call
    return []


def save_questions_to_db(questions: list[dict], job_id: str) -> list[dict]:
    """Save generated questions to Supabase 'ai-generated-questions' table."""
    # Placeholder — will be replaced with actual Supabase insert
    return questions
