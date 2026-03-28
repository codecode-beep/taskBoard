from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import bad_request, not_found
from app.models.activity import ActivityAction
from app.models.column import ColumnCreate, ColumnOut, ColumnReorder, ColumnUpdate
from app.services import activity_service, board_service
from app.utils.mongo import oid_str


def column_to_out(doc: dict) -> ColumnOut:
    return ColumnOut(
        id=oid_str(doc["_id"]),
        board_id=oid_str(doc["board_id"]),
        name=doc["name"],
        order=doc["order"],
        created_at=doc["created_at"],
    )


async def list_columns(db: AsyncIOMotorDatabase, board_id: str, user_id: str) -> list[ColumnOut]:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_member(b, user_id)
    cursor = db["columns"].find({"board_id": ObjectId(board_id)}).sort("order", 1)
    return [column_to_out(c) async for c in cursor]


async def create_column(
    db: AsyncIOMotorDatabase, board_id: str, user_id: str, data: ColumnCreate
) -> ColumnOut:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_admin(b, user_id)

    last = await db["columns"].find({"board_id": ObjectId(board_id)}).sort("order", -1).limit(1).to_list(1)
    next_order = (last[0]["order"] + 1) if last else 0
    now = datetime.now(timezone.utc)
    doc = {"board_id": ObjectId(board_id), "name": data.name.strip(), "order": next_order, "created_at": now}
    res = await db["columns"].insert_one(doc)
    inserted = await db["columns"].find_one({"_id": res.inserted_id})
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=None,
        user_id=user_id,
        action=ActivityAction.column_created,
        details={"column_id": str(res.inserted_id), "name": data.name},
    )
    return column_to_out(inserted)


async def update_column(
    db: AsyncIOMotorDatabase, board_id: str, column_id: str, user_id: str, data: ColumnUpdate
) -> ColumnOut:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_admin(b, user_id)
    try:
        cid = ObjectId(column_id)
    except Exception:
        raise not_found("Column")
    col = await db["columns"].find_one({"_id": cid, "board_id": ObjectId(board_id)})
    if not col:
        raise not_found("Column")
    patch: dict = {"updated_at": datetime.now(timezone.utc)}
    if data.name is not None:
        patch["name"] = data.name.strip()
    await db["columns"].update_one({"_id": cid}, {"$set": patch})
    updated = await db["columns"].find_one({"_id": cid})
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=None,
        user_id=user_id,
        action=ActivityAction.column_updated,
        details={"column_id": column_id, "changes": data.model_dump(exclude_unset=True)},
    )
    return column_to_out(updated)


async def delete_column(db: AsyncIOMotorDatabase, board_id: str, column_id: str, user_id: str) -> None:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_admin(b, user_id)
    try:
        cid = ObjectId(column_id)
        bid = ObjectId(board_id)
    except Exception:
        raise not_found("Column")
    col = await db["columns"].find_one({"_id": cid, "board_id": bid})
    if not col:
        raise not_found("Column")
    count = await db["tasks"].count_documents({"board_id": bid, "column_id": cid})
    if count > 0:
        raise bad_request("Move or delete tasks in this column first")
    await db["columns"].delete_one({"_id": cid})
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=None,
        user_id=user_id,
        action=ActivityAction.column_deleted,
        details={"column_id": column_id, "name": col.get("name")},
    )


async def reorder_columns(db: AsyncIOMotorDatabase, board_id: str, user_id: str, body: ColumnReorder) -> list[ColumnOut]:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_admin(b, user_id)
    bid = ObjectId(board_id)
    existing = await db["columns"].find({"board_id": bid}).to_list(200)
    id_set = {oid_str(c["_id"]) for c in existing}
    if set(body.ordered_column_ids) != id_set:
        raise bad_request("Column id list must match all columns on the board")
    now = datetime.now(timezone.utc)
    for order, col_id in enumerate(body.ordered_column_ids):
        await db["columns"].update_one(
            {"_id": ObjectId(col_id), "board_id": bid},
            {"$set": {"order": order, "updated_at": now}},
        )
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=None,
        user_id=user_id,
        action=ActivityAction.column_reordered,
        details={"order": body.ordered_column_ids},
    )
    return await list_columns(db, board_id, user_id)
