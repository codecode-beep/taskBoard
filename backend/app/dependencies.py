from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import unauthorized
from app.core.security import decode_token
from app.db.connection import get_database
from app.models.user import UserOut
from app.services import user_service

security = HTTPBearer(auto_error=False)


async def get_db() -> AsyncIOMotorDatabase:
    return get_database()


async def get_current_user(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> UserOut:
    if not creds or creds.scheme.lower() != "bearer":
        raise unauthorized()
    sub = decode_token(creds.credentials)
    if not sub:
        raise unauthorized()
    user = await user_service.get_user_by_id(db, sub)
    if not user:
        raise unauthorized()
    return user


CurrentUser = Annotated[UserOut, Depends(get_current_user)]
Db = Annotated[AsyncIOMotorDatabase, Depends(get_db)]
