from pydantic import BaseModel


class Profile(BaseModel):
    id: str
    email: str | None = None
    display_name: str
    avatar_url: str | None = None
    group_id: str | None = None
