from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import not_found
from app.models.label import LabelCreate, LabelOut
from app.services import board_service
from app.utils.mongo import oid_str


def label_to_out(doc: dict) -> LabelOut:
    return LabelOut(
        id=oid_str(doc["_id"]),
        board_id=oid_str(doc["board_id"]),
        name=doc["name"],
        color=doc["color"],
    )


async def list_labels(db: AsyncIOMotorDatabase, board_id: str, user_id: str) -> list[LabelOut]:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_member(b, user_id)
    cursor = db["labels"].find({"board_id": ObjectId(board_id)}).sort("name", 1)
    return [label_to_out(x) async for x in cursor]


async def create_label(db: AsyncIOMotorDatabase, board_id: str, user_id: str, data: LabelCreate) -> LabelOut:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_member(b, user_id)
    doc = {"board_id": ObjectId(board_id), "name": data.name.strip(), "color": data.color}
    res = await db["labels"].insert_one(doc)
    inserted = await db["labels"].find_one({"_id": res.inserted_id})
    return label_to_out(inserted)


async def delete_label(db: AsyncIOMotorDatabase, board_id: str, label_id: str, user_id: str) -> None:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_member(b, user_id)
    try:
        lid = ObjectId(label_id)
        bid = ObjectId(board_id)
    except Exception:
        raise not_found("Label")
    lab = await db["labels"].find_one({"_id": lid, "board_id": bid})
    if not lab:
        raise not_found("Label")
    await db["tasks"].update_many({"board_id": bid}, {"$pull": {"label_ids": lid}})
    await db["labels"].delete_one({"_id": lid})
