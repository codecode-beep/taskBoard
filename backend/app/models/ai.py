from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AiPolishRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)
    task_title: str | None = Field(default=None, max_length=500)


class AiTitleIdeasRequest(BaseModel):
    seed: str = Field(min_length=1, max_length=500)
    context: str | None = Field(default=None, max_length=2000)


class AiBoardBriefRequest(BaseModel):
    board_name: str = Field(min_length=1, max_length=200)
    tasks: list[dict] = Field(default_factory=list)

    @field_validator('tasks')
    @classmethod
    def cap_tasks(cls, v: list) -> list:
        return v[:200]


class AiAssistResponse(BaseModel):
    result: str
    mode: Literal["gemini", "demo", "gemini_quota", "gemini_auth"]


class AiChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    board_name: str | None = None
    task_title: str | None = None
