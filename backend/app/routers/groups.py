import secrets
import string

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.dependencies import CurrentUserDep
from app.models.group import Group, GroupMember, GroupWithMembers
from app.models.responses import ApiResponse, err, ok
from app.supabase_client import get_supabase

router = APIRouter(prefix="/groups", tags=["groups"])

DEFAULT_PUNISHMENTS = [
    "Clean the bathroom",
    "Take out trash for a week",
    "Do all dishes for 3 days",
    "Vacuum the whole place",
    "Clean the kitchen",
]

INVITE_ALPHABET = string.ascii_uppercase + string.digits
INVITE_LEN = 6
INVITE_MAX_TRIES = 12


class CreateGroupBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class JoinGroupBody(BaseModel):
    invite_code: str = Field(min_length=INVITE_LEN, max_length=INVITE_LEN)


def _generate_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(INVITE_LEN))


def _user_already_in_group(sb, user_id: str) -> bool:
    res = sb.table("profiles").select("group_id").eq("id", user_id).maybe_single().execute()
    row = getattr(res, "data", None) or {}
    return bool(row.get("group_id"))


def _to_group(row: dict) -> Group:
    return Group(
        id=row["id"],
        name=row["name"],
        invite_code=row["invite_code"],
        created_by=row.get("created_by"),
        created_at=row.get("created_at"),
    )


@router.post("", response_model=ApiResponse[Group])
def create_group(body: CreateGroupBody, user: CurrentUserDep) -> ApiResponse[Group]:
    sb = get_supabase()

    if _user_already_in_group(sb, user.id):
        return err("You are already in a group. Leave it before creating a new one.")

    invite_code: str | None = None
    for _ in range(INVITE_MAX_TRIES):
        candidate = _generate_invite_code()
        existing = sb.table("groups").select("id").eq("invite_code", candidate).execute()
        if not (existing.data or []):
            invite_code = candidate
            break
    if not invite_code:
        return err("Could not generate a unique invite code. Try again.")

    res = (
        sb.table("groups")
        .insert(
            {
                "name": body.name.strip(),
                "invite_code": invite_code,
                "created_by": user.id,
            }
        )
        .execute()
    )
    rows = getattr(res, "data", None) or []
    if not rows:
        return err("Failed to create group")
    group_row = rows[0]

    sb.table("profiles").update({"group_id": group_row["id"]}).eq("id", user.id).execute()

    sb.table("group_punishments").insert(
        [{"group_id": group_row["id"], "description": p} for p in DEFAULT_PUNISHMENTS]
    ).execute()

    return ok(_to_group(group_row))


@router.post("/join", response_model=ApiResponse[Group])
def join_group(body: JoinGroupBody, user: CurrentUserDep) -> ApiResponse[Group]:
    sb = get_supabase()
    code = body.invite_code.strip().upper()

    if _user_already_in_group(sb, user.id):
        return err("You are already in a group. Leave it before joining a new one.")

    res = sb.table("groups").select("*").eq("invite_code", code).maybe_single().execute()
    group_row = getattr(res, "data", None)
    if not group_row:
        return err("Invalid invite code")

    sb.table("profiles").update({"group_id": group_row["id"]}).eq("id", user.id).execute()

    return ok(_to_group(group_row))


@router.get("/me", response_model=ApiResponse[GroupWithMembers])
def get_my_group(user: CurrentUserDep) -> ApiResponse[GroupWithMembers]:
    sb = get_supabase()

    profile_res = (
        sb.table("profiles").select("group_id").eq("id", user.id).maybe_single().execute()
    )
    profile = getattr(profile_res, "data", None) or {}
    group_id = profile.get("group_id")
    if not group_id:
        return ok(None)

    group_res = sb.table("groups").select("*").eq("id", group_id).maybe_single().execute()
    group_row = getattr(group_res, "data", None)
    if not group_row:
        return err("Group not found")

    members_res = (
        sb.table("profiles")
        .select("id, display_name, avatar_url")
        .eq("group_id", group_id)
        .order("display_name")
        .execute()
    )
    members_rows = members_res.data or []

    return ok(
        GroupWithMembers(
            group=_to_group(group_row),
            members=[
                GroupMember(
                    id=m["id"],
                    display_name=m.get("display_name") or "",
                    avatar_url=m.get("avatar_url"),
                )
                for m in members_rows
            ],
        )
    )
