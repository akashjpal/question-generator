from dataclasses import dataclass

from langchain_openai import ChatOpenAI

from src.config import Settings
from src.services.db import DBService
from src.services.embeddings import EmbeddingsService
from src.services.llm import build_generator_llm, build_judge_llm
from src.services.storage import StorageService


@dataclass
class Services:
    """Dependency bundle injected into every graph node factory — avoids
    threading five separate constructor params through each node module."""

    settings: Settings
    db: DBService
    storage: StorageService
    embeddings: EmbeddingsService
    generator_llm: ChatOpenAI
    judge_llm: ChatOpenAI


def build_services(settings: Settings) -> Services:
    return Services(
        settings=settings,
        db=DBService(settings),
        storage=StorageService(settings),
        embeddings=EmbeddingsService(settings),
        generator_llm=build_generator_llm(settings),
        judge_llm=build_judge_llm(settings),
    )
