from fastapi import APIRouter, Query

from app.dependencies import CurrentUserDep
from app.models.message import Message, SendMessageBody
from app.models.responses import ApiResponse, err, ok
from app.supabase_client import get_supabase

router = APIRouter(prefix="/messages", tags=["messages"])


def _user_group_id(sb, user_id: str) -> str | None:
    res = sb.table("profiles").select("group_id").eq("id", user_id).maybe_single().execute()
    row = getattr(res, "data", None) or {}
    return row.get("group_id")


def _members_map(sb, group_id: str) -> dict[str, dict]:
    res = (
        sb.table("profiles")
        .select("id, display_name, avatar_url")
        .eq("group_id", group_id)
        .execute()
    )
    return {m["id"]: m for m in (res.data or [])}


def _enrich(m: dict, members_by_id: dict[str, dict]) -> Message:
    sender = members_by_id.get(m.get("sender_id") or "")
    return Message(
        id=m["id"],
        group_id=m["group_id"],
        sender_id=m["sender_id"],
        sender_name=sender.get("display_name") if sender else None,
        sender_avatar=sender.get("avatar_url") if sender else None,
        content=m["content"],
        created_at=m.get("created_at"),
    )


@router.get("", response_model=ApiResponse[list[Message]])
def list_messages(
    user: CurrentUserDep,
    limit: int = Query(50, ge=1, le=100),
    before: str | None = None,
) -> ApiResponse[list[Message]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    members = _members_map(sb, group_id)
    q = (
        sb.table("messages")
        .select("*")
        .eq("group_id", group_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if before:
        q = q.lt("created_at", before)

    res = q.execute()
    rows = list(reversed(res.data or []))
    return ok([_enrich(m, members) for m in rows])


@router.post("", response_model=ApiResponse[Message])
def send_message(body: SendMessageBody, user: CurrentUserDep) -> ApiResponse[Message]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    payload = {
        "group_id": group_id,
        "sender_id": user.id,
        "content": body.content.strip()[:2000],
    }
    res = sb.table("messages").insert(payload).execute()
    rows = res.data or []
    if not rows:
        return err("Failed to send message")

    members = _members_map(sb, group_id)
    return ok(_enrich(rows[0], members))
