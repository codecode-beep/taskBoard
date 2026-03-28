from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.activity import ActivityAction, ActivityOut
from app.utils.mongo import oid_str


async def log_activity(
    db: AsyncIOMotorDatabase,
    *,
    board_id: str,
    task_id: str | None,
    user_id: str | None,
    action: ActivityAction,
    details: dict,
) -> None:
    await db["activity_logs"].insert_one(
        {
            "board_id": ObjectId(board_id),
            "task_id": ObjectId(task_id) if task_id else None,
            "user_id": ObjectId(user_id) if user_id else None,
            "action": action.value,
            "details": details,
            "created_at": datetime.now(timezone.utc),
        }
    )


def activity_to_out(doc: dict) -> ActivityOut:
    return ActivityOut(
        id=oid_str(doc["_id"]),
        board_id=oid_str(doc["board_id"]),
        task_id=oid_str(doc["task_id"]) if doc.get("task_id") else None,
        user_id=oid_str(doc["user_id"]) if doc.get("user_id") else None,
        action=ActivityAction(doc["action"]),
        details=doc.get("details") or {},
        created_at=doc["created_at"],
    )


async def list_for_task(db: AsyncIOMotorDatabase, task_id: str, limit: int = 100) -> list[ActivityOut]:
    try:
        tid = ObjectId(task_id)
    except Exception:
        return []
    cursor = db["activity_logs"].find({"task_id": tid}).sort("created_at", -1).limit(limit)
    return [activity_to_out(d) async for d in cursor]


async def list_for_board(db: AsyncIOMotorDatabase, board_id: str, limit: int = 200) -> list[ActivityOut]:
    try:
        bid = ObjectId(board_id)
    except Exception:
        return []
    cursor = db["activity_logs"].find({"board_id": bid}).sort("created_at", -1).limit(limit)
    return [activity_to_out(d) async for d in cursor]
