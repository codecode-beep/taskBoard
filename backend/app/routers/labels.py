from fastapi import APIRouter

from app.dependencies import CurrentUser, Db
from app.models.label import LabelCreate, LabelOut
from app.services import label_service
from app.websocket_manager import ws_manager

router = APIRouter(prefix="/boards/{board_id}/labels", tags=["labels"])


@router.get("", response_model=list[LabelOut])
async def list_labels(db: Db, user: CurrentUser, board_id: str) -> list[LabelOut]:
    return await label_service.list_labels(db, board_id, user.id)


@router.post("", response_model=LabelOut)
async def create_label(
    db: Db, user: CurrentUser, board_id: str, body: LabelCreate
) -> LabelOut:
    lab = await label_service.create_label(db, board_id, user.id, body)
    await ws_manager.broadcast_board(board_id, {"type": "labels_changed"})
    return lab


@router.delete("/{label_id}", status_code=204)
async def delete_label(
    db: Db, user: CurrentUser, board_id: str, label_id: str
) -> None:
    await label_service.delete_label(db, board_id, label_id, user.id)
    await ws_manager.broadcast_board(board_id, {"type": "labels_changed"})
