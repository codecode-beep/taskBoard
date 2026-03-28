from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    user_id: str
    type: str
    message: str
    board_id: str | None
    task_id: str | None
    read: bool
    created_at: datetime
