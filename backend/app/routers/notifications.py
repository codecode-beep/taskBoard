from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, Db
from app.models.notification import NotificationOut
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: Db,
    user: CurrentUser,
    unread_only: bool = Query(False),
) -> list[NotificationOut]:
    return await notification_service.list_for_user(db, user.id, unread_only=unread_only)


@router.post("/{notification_id}/read", response_model=dict)
async def mark_read(
    db: Db, user: CurrentUser, notification_id: str
) -> dict:
    ok = await notification_service.mark_read(db, user.id, notification_id)
    return {"ok": ok}


@router.post("/read-all", response_model=dict)
async def mark_all_read(db: Db, user: CurrentUser) -> dict:
    await notification_service.mark_all_read(db, user.id)
    return {"ok": True}
