from datetime import datetime

from pydantic import BaseModel


class Group(BaseModel):
    id: str
    name: str
    invite_code: str
    created_by: str | None = None
    created_at: datetime | None = None


class GroupMember(BaseModel):
    id: str
    display_name: str
    avatar_url: str | None = None


class GroupWithMembers(BaseModel):
    group: Group
    members: list[GroupMember]
