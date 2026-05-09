from datetime import date, datetime

from pydantic import BaseModel, Field


class ChoreCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    due_date: date | None = None
    assigned_to: str | None = None


class ChoreUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    due_date: date | None = None
    assigned_to: str | None = None
    clear_assignee: bool = False


class Chore(BaseModel):
    id: str
    group_id: str
    title: str
    description: str | None = None
    assigned_to: str | None = None
    assignee_name: str | None = None
    assignee_avatar: str | None = None
    assigned_by: str | None = None
    creator_name: str | None = None
    is_completed: bool
    completed_at: datetime | None = None
    completed_by: str | None = None
    completer_name: str | None = None
    due_date: date | None = None
    created_at: datetime | None = None
