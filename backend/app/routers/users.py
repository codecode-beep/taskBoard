from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, Db
from app.models.user import UserOut
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return user


@router.get("/search", response_model=list[UserOut])
async def search_users(
    db: Db,
    user: CurrentUser,
    q: str = Query("", min_length=0),
) -> list[UserOut]:
    _ = user
    return await user_service.search_users(db, q)


@router.get("/by-ids", response_model=list[UserOut])
async def users_by_ids(
    db: Db,
    user: CurrentUser,
    ids: str = Query("", description="Comma-separated user ids"),
) -> list[UserOut]:
    _ = user
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if len(id_list) > 50:
        id_list = id_list[:50]
    m = await user_service.list_users_by_ids(db, id_list)
    return list(m.values())
