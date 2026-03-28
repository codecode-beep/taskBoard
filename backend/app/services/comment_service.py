from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import not_found
from app.models.activity import ActivityAction
from app.models.comment import CommentCreate, CommentOut
from app.services import activity_service, board_service, task_service
from app.utils.mongo import oid_str


def comment_to_out(doc: dict) -> CommentOut:
    return CommentOut(
        id=oid_str(doc["_id"]),
        task_id=oid_str(doc["task_id"]),
        user_id=oid_str(doc["user_id"]),
        body=doc["body"],
        created_at=doc["created_at"],
    )


async def list_comments(db: AsyncIOMotorDatabase, task_id: str, user_id: str) -> list[CommentOut]:
    await task_service.get_task(db, task_id, user_id)
    cursor = db["comments"].find({"task_id": ObjectId(task_id)}).sort("created_at", 1)
    return [comment_to_out(c) async for c in cursor]


async def add_comment(db: AsyncIOMotorDatabase, task_id: str, user_id: str, data: CommentCreate) -> CommentOut:
    t = await task_service.get_task(db, task_id, user_id)
    now = datetime.now(timezone.utc)
    doc = {
        "task_id": ObjectId(task_id),
        "user_id": ObjectId(user_id),
        "body": data.body.strip(),
        "created_at": now,
    }
    res = await db["comments"].insert_one(doc)
    inserted = await db["comments"].find_one({"_id": res.inserted_id})
    await activity_service.log_activity(
        db,
        board_id=t.board_id,
        task_id=task_id,
        user_id=user_id,
        action=ActivityAction.comment_added,
        details={"preview": data.body[:120]},
    )
    return comment_to_out(inserted)
