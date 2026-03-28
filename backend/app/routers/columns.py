from fastapi import APIRouter

from app.dependencies import CurrentUser, Db
from app.models.column import ColumnCreate, ColumnOut, ColumnReorder, ColumnUpdate
from app.services import column_service

router = APIRouter(prefix="/boards/{board_id}/columns", tags=["columns"])


@router.get("", response_model=list[ColumnOut])
async def list_columns(db: Db, user: CurrentUser, board_id: str) -> list[ColumnOut]:
    return await column_service.list_columns(db, board_id, user.id)


@router.post("/reorder", response_model=list[ColumnOut])
async def reorder_columns(
    db: Db, user: CurrentUser, board_id: str, body: ColumnReorder
) -> list[ColumnOut]:
    cols = await column_service.reorder_columns(db, board_id, user.id, body)
    from app.websocket_manager import ws_manager

    await ws_manager.broadcast_board(board_id, {"type": "columns_changed"})
    return cols


@router.post("", response_model=ColumnOut)
async def create_column(
    db: Db, user: CurrentUser, board_id: str, body: ColumnCreate
) -> ColumnOut:
    from app.websocket_manager import ws_manager

    c = await column_service.create_column(db, board_id, user.id, body)
    await ws_manager.broadcast_board(board_id, {"type": "columns_changed"})
    return c


@router.patch("/{column_id}", response_model=ColumnOut)
async def update_column(
    db: Db, user: CurrentUser, board_id: str, column_id: str, body: ColumnUpdate
) -> ColumnOut:
    from app.websocket_manager import ws_manager

    c = await column_service.update_column(db, board_id, column_id, user.id, body)
    await ws_manager.broadcast_board(board_id, {"type": "columns_changed"})
    return c


@router.delete("/{column_id}", status_code=204)
async def delete_column(db: Db, user: CurrentUser, board_id: str, column_id: str) -> None:
    from app.websocket_manager import ws_manager

    await column_service.delete_column(db, board_id, column_id, user.id)
    await ws_manager.broadcast_board(board_id, {"type": "columns_changed"})
