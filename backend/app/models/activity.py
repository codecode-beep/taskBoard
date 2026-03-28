from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class ActivityAction(str, Enum):
    task_created = "task_created"
    task_updated = "task_updated"
    task_deleted = "task_deleted"
    status_changed = "status_changed"
    assignee_changed = "assignee_changed"
    comment_added = "comment_added"
    column_created = "column_created"
    column_updated = "column_updated"
    column_deleted = "column_deleted"
    column_reordered = "column_reordered"
    member_added = "member_added"
    member_removed = "member_removed"


class ActivityOut(BaseModel):
    id: str
    board_id: str
    task_id: str | None
    user_id: str | None
    action: ActivityAction
    details: dict
    created_at: datetime
