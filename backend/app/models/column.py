from datetime import datetime

from pydantic import BaseModel, Field


class ColumnCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ColumnUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class ColumnOut(BaseModel):
    id: str
    board_id: str
    name: str
    order: int
    created_at: datetime


class ColumnReorder(BaseModel):
    ordered_column_ids: list[str]
