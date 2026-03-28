from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import bad_request
from app.core.security import hash_password, verify_password
from app.models.user import UserCreate, UserOut
from app.utils.mongo import oid_str


async def create_user(db: AsyncIOMotorDatabase, data: UserCreate) -> UserOut:
    users = db["users"]
    if await users.find_one({"$or": [{"email": data.email}, {"username": data.username}]}):
        raise bad_request("Email or username already registered")
    now = datetime.now(timezone.utc)
    doc = {
        "email": data.email.lower(),
        "username": data.username.strip(),
        "password_hash": hash_password(data.password),
        "created_at": now,
    }
    res = await users.insert_one(doc)
    return user_to_out({**doc, "_id": res.inserted_id})


async def authenticate(db: AsyncIOMotorDatabase, username: str, password: str) -> UserOut | None:
    users = db["users"]
    doc = await users.find_one({"username": username.strip()})
    if not doc or not verify_password(password, doc["password_hash"]):
        return None
    return user_to_out(doc)


async def get_user_by_id(db: AsyncIOMotorDatabase, user_id: str) -> UserOut | None:
    try:
        oid = ObjectId(user_id)
    except Exception:
        return None
    doc = await db["users"].find_one({"_id": oid})
    return user_to_out(doc) if doc else None


async def get_user_by_email(db: AsyncIOMotorDatabase, email: str) -> UserOut | None:
    doc = await db["users"].find_one({"email": email.lower()})
    return user_to_out(doc) if doc else None


async def get_user_by_username(db: AsyncIOMotorDatabase, username: str) -> UserOut | None:
    doc = await db["users"].find_one({"username": username.strip()})
    return user_to_out(doc) if doc else None


async def list_users_by_ids(db: AsyncIOMotorDatabase, ids: list[str]) -> dict[str, UserOut]:
    if not ids:
        return {}
    oids = []
    for i in ids:
        try:
            oids.append(ObjectId(i))
        except Exception:
            continue
    cursor = db["users"].find({"_id": {"$in": oids}})
    out: dict[str, UserOut] = {}
    async for doc in cursor:
        u = user_to_out(doc)
        out[u.id] = u
    return out


def user_to_out(doc: dict) -> UserOut:
    return UserOut(
        id=oid_str(doc["_id"]),
        email=doc["email"],
        username=doc["username"],
        created_at=doc["created_at"],
    )


async def search_users(db: AsyncIOMotorDatabase, q: str, limit: int = 20) -> list[UserOut]:
    if not q or len(q) < 2:
        return []
    rx = {"$regex": q, "$options": "i"}
    cursor = (
        db["users"]
        .find({"$or": [{"username": rx}, {"email": rx}]})
        .limit(limit)
    )
    return [user_to_out(d) async for d in cursor]
