from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, Db
from app.models.task import TaskBatchReorder, TaskCreate, TaskOut, TaskUpdate
from app.services import task_service
from app.websocket_manager import ws_manager

router = APIRouter(prefix="/boards/{board_id}/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    db: Db,
    user: CurrentUser,
    board_id: str,
    q: str | None = Query(None),
    priority: str | None = Query(None),
    column_id: str | None = Query(None),
    assignee_id: str | None = Query(None),
    label_id: str | None = Query(None),
    sort: str | None = Query(None),
) -> list[TaskOut]:
    return await task_service.list_tasks(
        db,
        board_id,
        user.id,
        q=q,
        priority=priority,
        column_id=column_id,
        assignee_id=assignee_id,
        label_id=label_id,
        sort=sort,
    )


@router.post("", response_model=TaskOut)
async def create_task(
    db: Db, user: CurrentUser, board_id: str, body: TaskCreate
) -> TaskOut:
    t = await task_service.create_task(db, board_id, user.id, body)
    await ws_manager.broadcast_board(board_id, {"type": "tasks_changed"})
    return t


@router.post("/reorder", response_model=list[TaskOut])
async def reorder_tasks(
    db: Db, user: CurrentUser, board_id: str, body: TaskBatchReorder
) -> list[TaskOut]:
    tasks = await task_service.batch_reorder(db, board_id, user.id, body)
    await ws_manager.broadcast_board(board_id, {"type": "tasks_changed"})
    return tasks


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(db: Db, user: CurrentUser, board_id: str, task_id: str) -> TaskOut:
    t = await task_service.get_task(db, task_id, user.id)
    if t.board_id != board_id:
        from app.core.exceptions import not_found

        raise not_found("Task")
    return t


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    db: Db, user: CurrentUser, board_id: str, task_id: str, body: TaskUpdate
) -> TaskOut:
    t = await task_service.update_task(db, task_id, user.id, body)
    if t.board_id != board_id:
        from app.core.exceptions import not_found

        raise not_found("Task")
    await ws_manager.broadcast_board(board_id, {"type": "tasks_changed"})
    return t


@router.delete("/{task_id}", status_code=204)
async def delete_task(db: Db, user: CurrentUser, board_id: str, task_id: str) -> None:
    t = await task_service.get_task(db, task_id, user.id)
    if t.board_id != board_id:
        from app.core.exceptions import not_found

        raise not_found("Task")
    await task_service.delete_task(db, task_id, user.id)
    await ws_manager.broadcast_board(board_id, {"type": "tasks_changed"})
