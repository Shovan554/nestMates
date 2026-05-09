from datetime import datetime

from pydantic import BaseModel, Field


class Message(BaseModel):
    id: str
    group_id: str
    sender_id: str
    sender_name: str | None = None
    sender_avatar: str | None = None
    content: str
    created_at: datetime | None = None


class SendMessageBody(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
