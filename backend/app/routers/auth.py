from fastapi import APIRouter

from app.core.exceptions import unauthorized
from app.core.security import create_access_token
from app.dependencies import Db
from app.models.user import Token, UserCreate, UserLogin, UserOut
from app.services import user_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
async def register(db: Db, body: UserCreate) -> UserOut:
    return await user_service.create_user(db, body)


@router.post("/login", response_model=Token)
async def login(db: Db, body: UserLogin) -> Token:
    user = await user_service.authenticate(db, body.username, body.password)
    if not user:
        raise unauthorized("Invalid username or password")
    token = create_access_token(user.id)
    return Token(access_token=token)
