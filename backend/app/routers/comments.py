from fastapi import APIRouter

from app.dependencies import CurrentUser, Db
from app.models.comment import CommentCreate, CommentOut
from app.services import comment_service
from app.websocket_manager import ws_manager

router = APIRouter(
    prefix="/boards/{board_id}/tasks/{task_id}/comments",
    tags=["comments"],
)


@router.get("", response_model=list[CommentOut])
async def list_comments(
    db: Db, user: CurrentUser, board_id: str, task_id: str
) -> list[CommentOut]:
    from app.services import task_service

    t = await task_service.get_task(db, task_id, user.id)
    if t.board_id != board_id:
        from app.core.exceptions import not_found

        raise not_found("Task")
    return await comment_service.list_comments(db, task_id, user.id)


@router.post("", response_model=CommentOut)
async def add_comment(
    db: Db, user: CurrentUser, board_id: str, task_id: str, body: CommentCreate
) -> CommentOut:
    from app.services import task_service

    t = await task_service.get_task(db, task_id, user.id)
    if t.board_id != board_id:
        from app.core.exceptions import not_found

        raise not_found("Task")
    c = await comment_service.add_comment(db, task_id, user.id, body)
    await ws_manager.broadcast_board(board_id, {"type": "comments_changed", "task_id": task_id})
    return c
