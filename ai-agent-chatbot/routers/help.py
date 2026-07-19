from fastapi import APIRouter

from agent.prompts import load_knowledge_doc

router = APIRouter()


@router.get("/help/basics")
async def help_basics():
    return {"markdown": load_knowledge_doc()}
