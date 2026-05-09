from datetime import date

from pydantic import BaseModel


class ChoreLite(BaseModel):
    id: str
    title: str
    due_date: date | None = None
    assignee_id: str | None = None
    assignee_name: str | None = None


class RoommateStatus(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None = None
    active_chores: int


class StrikeSummary(BaseModel):
    user_id: str
    display_name: str
    strike_count: int
    active_punishment: str | None = None


class DashboardData(BaseModel):
    group_name: str
    group_invite_code: str
    my_chores: list[ChoreLite]
    roommate_chores: list[ChoreLite]
    i_owe: float
    owed_to_me: float
    roommate_status: list[RoommateStatus]
    strikes: list[StrikeSummary]
