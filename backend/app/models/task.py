from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class Priority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    column_id: str
    priority: Priority = Priority.medium
    due_date: date | None = None
    assignee_id: str | None = None
    label_ids: list[str] = []


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    column_id: str | None = None
    priority: Priority | None = None
    due_date: date | None = None
    assignee_id: str | None = None
    label_ids: list[str] | None = None
    order: int | None = None


class TaskOut(BaseModel):
    id: str
    board_id: str
    column_id: str
    title: str
    description: str
    priority: Priority
    due_date: date | None
    assignee_id: str | None
    label_ids: list[str]
    order: int
    created_at: datetime
    updated_at: datetime


class TaskMove(BaseModel):
    task_id: str
    source_column_id: str
    dest_column_id: str
    source_order: int
    dest_order: int


class TaskBatchOrderItem(BaseModel):
    task_id: str
    column_id: str
    order: int


class TaskBatchReorder(BaseModel):
    items: list[TaskBatchOrderItem]


class TaskFilters(BaseModel):
    q: str | None = None
    priority: Priority | None = None
    column_id: str | None = None
    assignee_id: str | None = None
    label_id: str | None = None
    sort: str | None = Field(default=None, description="due_date_asc|due_date_desc|priority_asc|priority_desc")
