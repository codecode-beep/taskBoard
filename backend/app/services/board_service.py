from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import bad_request, forbidden, not_found
from app.models.activity import ActivityAction
from app.models.board import BoardCreate, BoardMember, BoardOut, BoardRole, InviteMember, MemberRoleUpdate
from app.services import activity_service, notification_service, user_service
from app.utils.mongo import oid_str

DEFAULT_COLUMNS = ["Backlog", "In Progress", "Review", "Done"]


def board_to_out(doc: dict) -> BoardOut:
    members = [
        BoardMember(user_id=oid_str(m["user_id"]), role=BoardRole(m["role"]))
        for m in doc.get("members", [])
    ]
    return BoardOut(
        id=oid_str(doc["_id"]),
        name=doc["name"],
        owner_id=oid_str(doc["owner_id"]),
        members=members,
        pending_invites=doc.get("pending_invites", []),
        created_at=doc["created_at"],
        updated_at=doc.get("updated_at"),
    )


def user_role_on_board(doc: dict, user_id: str) -> BoardRole | None:
    oid = ObjectId(user_id)
    if doc["owner_id"] == oid:
        return BoardRole.admin
    for m in doc.get("members", []):
        if m["user_id"] == oid:
            return BoardRole(m["role"])
    return None


def require_board_member(doc: dict, user_id: str) -> BoardRole:
    role = user_role_on_board(doc, user_id)
    if role is None:
        raise forbidden("You are not a member of this board")
    return role


def require_board_admin(doc: dict, user_id: str) -> None:
    role = require_board_member(doc, user_id)
    if role != BoardRole.admin:
        raise forbidden("Admin role required")


async def get_board_doc(db: AsyncIOMotorDatabase, board_id: str) -> dict | None:
    try:
        return await db["boards"].find_one({"_id": ObjectId(board_id)})
    except Exception:
        return None


async def create_board(db: AsyncIOMotorDatabase, owner_id: str, data: BoardCreate) -> BoardOut:
    now = datetime.now(timezone.utc)
    owner_oid = ObjectId(owner_id)
    board_doc = {
        "name": data.name.strip(),
        "owner_id": owner_oid,
        "members": [{"user_id": owner_oid, "role": BoardRole.admin.value}],
        "pending_invites": [],
        "created_at": now,
        "updated_at": now,
    }
    res = await db["boards"].insert_one(board_doc)
    bid = res.inserted_id
    for order, name in enumerate(DEFAULT_COLUMNS):
        await db["columns"].insert_one(
            {
                "board_id": bid,
                "name": name,
                "order": order,
                "created_at": now,
            }
        )
    full = await db["boards"].find_one({"_id": bid})
    assert full
    return board_to_out(full)


async def list_boards_for_user(db: AsyncIOMotorDatabase, user_id: str) -> list[BoardOut]:
    uid = ObjectId(user_id)
    cursor = db["boards"].find(
        {"$or": [{"owner_id": uid}, {"members.user_id": uid}]}
    ).sort("updated_at", -1)
    return [board_to_out(d) async for d in cursor]


async def invite_member(
    db: AsyncIOMotorDatabase,
    board_id: str,
    actor_id: str,
    invite: InviteMember,
) -> BoardOut:
    doc = await get_board_doc(db, board_id)
    if not doc:
        raise not_found("Board")
    require_board_admin(doc, actor_id)

    target: user_service.UserOut | None = None
    if invite.email:
        target = await user_service.get_user_by_email(db, invite.email)
    elif invite.username:
        target = await user_service.get_user_by_username(db, invite.username)
    else:
        raise bad_request("Provide email or username")

    if not target:
        pending = doc.get("pending_invites", [])
        entry = {
            "email": invite.email.lower() if invite.email else None,
            "username": invite.username.strip() if invite.username else None,
            "role": invite.role.value,
        }
        if entry not in pending:
            pending = pending + [entry]
        await db["boards"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"pending_invites": pending, "updated_at": datetime.now(timezone.utc)}},
        )
        refreshed = await db["boards"].find_one({"_id": doc["_id"]})
        return board_to_out(refreshed)

    uid = target.id
    members = doc.get("members", [])
    if any(oid_str(m["user_id"]) == uid for m in members):
        raise bad_request("User is already a member")
    if oid_str(doc["owner_id"]) == uid:
        raise bad_request("Owner is already on the board")

    members.append({"user_id": ObjectId(uid), "role": invite.role.value})
    now = datetime.now(timezone.utc)
    await db["boards"].update_one(
        {"_id": doc["_id"]},
        {"$set": {"members": members, "updated_at": now}},
    )
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=None,
        user_id=actor_id,
        action=ActivityAction.member_added,
        details={"added_user_id": uid, "role": invite.role.value},
    )
    await notification_service.create_notification(
        db,
        user_id=uid,
        type_="board_invite",
        message=f"You were added to board: {doc['name']}",
        board_id=board_id,
    )
    refreshed = await db["boards"].find_one({"_id": doc["_id"]})
    return board_to_out(refreshed)


async def update_member_role(
    db: AsyncIOMotorDatabase,
    board_id: str,
    actor_id: str,
    body: MemberRoleUpdate,
) -> BoardOut:
    doc = await get_board_doc(db, board_id)
    if not doc:
        raise not_found("Board")
    require_board_admin(doc, actor_id)
    if oid_str(doc["owner_id"]) == body.user_id:
        raise bad_request("Cannot change owner role here")

    members = doc.get("members", [])
    new_members = []
    found = False
    for m in members:
        if oid_str(m["user_id"]) == body.user_id:
            new_members.append({"user_id": m["user_id"], "role": body.role.value})
            found = True
        else:
            new_members.append(m)
    if not found:
        raise not_found("Member")

    await db["boards"].update_one(
        {"_id": doc["_id"]},
        {"$set": {"members": new_members, "updated_at": datetime.now(timezone.utc)}},
    )
    refreshed = await db["boards"].find_one({"_id": doc["_id"]})
    return board_to_out(refreshed)


async def remove_member(db: AsyncIOMotorDatabase, board_id: str, actor_id: str, user_id: str) -> BoardOut:
    doc = await get_board_doc(db, board_id)
    if not doc:
        raise not_found("Board")
    require_board_admin(doc, actor_id)
    if oid_str(doc["owner_id"]) == user_id:
        raise bad_request("Cannot remove board owner")

    members = [m for m in doc.get("members", []) if oid_str(m["user_id"]) != user_id]
    await db["boards"].update_one(
        {"_id": doc["_id"]},
        {"$set": {"members": members, "updated_at": datetime.now(timezone.utc)}},
    )
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=None,
        user_id=actor_id,
        action=ActivityAction.member_removed,
        details={"removed_user_id": user_id},
    )
    refreshed = await db["boards"].find_one({"_id": doc["_id"]})
    return board_to_out(refreshed)


async def export_board_json(db: AsyncIOMotorDatabase, board_id: str, user_id: str) -> dict:
    doc = await get_board_doc(db, board_id)
    if not doc:
        raise not_found("Board")
    require_board_member(doc, user_id)

    bid = doc["_id"]
    columns = await db["columns"].find({"board_id": bid}).sort("order", 1).to_list(500)
    tasks = await db["tasks"].find({"board_id": bid}).sort("order", 1).to_list(5000)
    labels = await db["labels"].find({"board_id": bid}).to_list(500)

    def ser(o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, list):
            return [ser(x) for x in o]
        if isinstance(o, dict):
            return {k: ser(v) for k, v in o.items()}
        return o

    return {
        "board": ser(doc),
        "columns": [ser(c) for c in columns],
        "tasks": [ser(t) for t in tasks],
        "labels": [ser(l) for l in labels],
    }
