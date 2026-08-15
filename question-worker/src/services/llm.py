from langchain_openai import ChatOpenAI

from src.config import Settings


def build_generator_llm(settings: Settings) -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        temperature=0.7,
        max_tokens=2400,
    )


def build_judge_llm(settings: Settings) -> ChatOpenAI:
    """Deliberately a separate client/model slot from the generator (plan
    section 7: 'separate — can be cheaper — model') even though both default
    to the same OPENROUTER model today; JUDGE_MODEL can be tuned or swapped
    independently once a cheaper judge model is validated against this
    prompt shape."""
    return ChatOpenAI(
        model=settings.judge_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        temperature=0.0,
        max_tokens=2400,
    )
