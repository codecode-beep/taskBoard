from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.notification import NotificationOut
from app.utils.mongo import oid_str


async def create_notification(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    type_: str,
    message: str,
    board_id: str | None = None,
    task_id: str | None = None,
) -> None:
    await db["notifications"].insert_one(
        {
            "user_id": ObjectId(user_id),
            "type": type_,
            "message": message,
            "board_id": ObjectId(board_id) if board_id else None,
            "task_id": ObjectId(task_id) if task_id else None,
            "read": False,
            "created_at": datetime.now(timezone.utc),
        }
    )


def notif_to_out(doc: dict) -> NotificationOut:
    return NotificationOut(
        id=oid_str(doc["_id"]),
        user_id=oid_str(doc["user_id"]),
        type=doc["type"],
        message=doc["message"],
        board_id=oid_str(doc["board_id"]) if doc.get("board_id") else None,
        task_id=oid_str(doc["task_id"]) if doc.get("task_id") else None,
        read=doc.get("read", False),
        created_at=doc["created_at"],
    )


async def list_for_user(db: AsyncIOMotorDatabase, user_id: str, unread_only: bool = False) -> list[NotificationOut]:
    q: dict = {"user_id": ObjectId(user_id)}
    if unread_only:
        q["read"] = False
    cursor = db["notifications"].find(q).sort("created_at", -1).limit(100)
    return [notif_to_out(d) async for d in cursor]


async def mark_read(db: AsyncIOMotorDatabase, user_id: str, notification_id: str) -> bool:
    try:
        nid = ObjectId(notification_id)
        uid = ObjectId(user_id)
    except Exception:
        return False
    res = await db["notifications"].update_one(
        {"_id": nid, "user_id": uid},
        {"$set": {"read": True}},
    )
    return res.modified_count > 0


async def mark_all_read(db: AsyncIOMotorDatabase, user_id: str) -> None:
    await db["notifications"].update_many(
        {"user_id": ObjectId(user_id), "read": False},
        {"$set": {"read": True}},
    )
