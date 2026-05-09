from datetime import datetime

from pydantic import BaseModel, Field


class Complaint(BaseModel):
    id: str
    group_id: str
    filed_by: str
    filed_by_name: str | None = None
    filed_by_avatar: str | None = None
    filed_against: str
    filed_against_name: str | None = None
    filed_against_avatar: str | None = None
    reason: str
    created_at: datetime | None = None


class ComplaintCreate(BaseModel):
    filed_against: str
    reason: str = Field(min_length=10, max_length=2000)


class StrikeCount(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None = None
    strike_count: int


class Punishment(BaseModel):
    id: str
    user_id: str
    user_name: str | None = None
    user_avatar: str | None = None
    description: str
    assigned_at: datetime | None = None
    is_completed: bool
    completed_at: datetime | None = None


class GroupPunishmentItem(BaseModel):
    id: str
    description: str


class GroupPunishmentCreate(BaseModel):
    description: str = Field(min_length=2, max_length=200)
