from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class BoardRole(str, Enum):
    admin = "admin"
    member = "member"


class BoardMember(BaseModel):
    user_id: str
    role: BoardRole


class BoardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class PendingInvite(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    role: BoardRole = BoardRole.member


class InviteMember(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    role: BoardRole = BoardRole.member


class MemberRoleUpdate(BaseModel):
    user_id: str
    role: BoardRole


class BoardOut(BaseModel):
    id: str
    name: str
    owner_id: str
    members: list[BoardMember]
    pending_invites: list[dict] = []
    created_at: datetime
    updated_at: datetime | None = None
