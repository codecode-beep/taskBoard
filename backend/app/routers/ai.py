from fastapi import APIRouter

from app.dependencies import CurrentUser
from app.models.ai import AiAssistResponse, AiBoardBriefRequest, AiChatRequest, AiPolishRequest, AiTitleIdeasRequest
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/polish", response_model=AiAssistResponse)
async def polish_text(_: CurrentUser, body: AiPolishRequest) -> AiAssistResponse:
    result, mode = await ai_service.polish_description(body.text, body.task_title)
    return AiAssistResponse(result=result, mode=mode)


@router.post("/title-ideas", response_model=AiAssistResponse)
async def titles(_: CurrentUser, body: AiTitleIdeasRequest) -> AiAssistResponse:
    result, mode = await ai_service.title_ideas(body.seed, body.context)
    return AiAssistResponse(result=result, mode=mode)


@router.post("/board-brief", response_model=AiAssistResponse)
async def board_brief(_: CurrentUser, body: AiBoardBriefRequest) -> AiAssistResponse:
    result, mode = await ai_service.board_brief(body.board_name, body.tasks)
    return AiAssistResponse(result=result, mode=mode)


@router.post("/chat", response_model=AiAssistResponse)
async def chat(_: CurrentUser, body: AiChatRequest) -> AiAssistResponse:
    result, mode = await ai_service.copilot_chat(body.message, body.board_name, body.task_title)
    return AiAssistResponse(result=result, mode=mode)
