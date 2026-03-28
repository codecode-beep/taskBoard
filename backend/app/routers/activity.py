from fastapi import APIRouter

from app.dependencies import CurrentUser, Db
from app.models.activity import ActivityOut
from app.services import activity_service, board_service, task_service

router = APIRouter(tags=["activity"])


@router.get("/boards/{board_id}/activity", response_model=list[ActivityOut])
async def board_activity(db: Db, user: CurrentUser, board_id: str) -> list[ActivityOut]:
    doc = await board_service.get_board_doc(db, board_id)
    if not doc:
        from app.core.exceptions import not_found

        raise not_found("Board")
    board_service.require_board_member(doc, user.id)
    return await activity_service.list_for_board(db, board_id)


@router.get("/boards/{board_id}/tasks/{task_id}/activity", response_model=list[ActivityOut])
async def task_activity(
    db: Db, user: CurrentUser, board_id: str, task_id: str
) -> list[ActivityOut]:
    t = await task_service.get_task(db, task_id, user.id)
    if t.board_id != board_id:
        from app.core.exceptions import not_found

        raise not_found("Task")
    return await activity_service.list_for_task(db, task_id)
