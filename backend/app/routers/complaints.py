from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.models.complaint import (
    Complaint,
    ComplaintCreate,
    GroupPunishmentCreate,
    GroupPunishmentItem,
    Punishment,
    StrikeCount,
)
from app.models.responses import ApiResponse, err, ok
from app.services.email import send_complaint_filed, send_punishment_assigned
from app.services.users import get_user_email
from app.supabase_client import get_supabase

complaints_router = APIRouter(prefix="/complaints", tags=["complaints"])
strikes_router = APIRouter(prefix="/strikes", tags=["complaints"])
punishments_router = APIRouter(prefix="/punishments", tags=["complaints"])
group_punishments_router = APIRouter(prefix="/group-punishments", tags=["complaints"])

PUNISHMENT_LOOKBACK_SECONDS = 10


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


def _to_complaint(c: dict, members: dict[str, dict]) -> Complaint:
    f = members.get(c["filed_by"]) or {}
    a = members.get(c["filed_against"]) or {}
    return Complaint(
        id=c["id"],
        group_id=c["group_id"],
        filed_by=c["filed_by"],
        filed_by_name=f.get("display_name"),
        filed_by_avatar=f.get("avatar_url"),
        filed_against=c["filed_against"],
        filed_against_name=a.get("display_name"),
        filed_against_avatar=a.get("avatar_url"),
        reason=c["reason"],
        created_at=c.get("created_at"),
    )


def _to_punishment(p: dict, members: dict[str, dict]) -> Punishment:
    m = members.get(p["user_id"]) or {}
    return Punishment(
        id=p["id"],
        user_id=p["user_id"],
        user_name=m.get("display_name"),
        user_avatar=m.get("avatar_url"),
        description=p["description"],
        assigned_at=p.get("assigned_at"),
        is_completed=bool(p.get("is_completed")),
        completed_at=p.get("completed_at"),
    )


@complaints_router.get("", response_model=ApiResponse[list[Complaint]])
def list_complaints(user: CurrentUserDep) -> ApiResponse[list[Complaint]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    members = _members_map(sb, group_id)
    res = (
        sb.table("complaints")
        .select("*")
        .eq("group_id", group_id)
        .order("created_at", desc=True)
        .execute()
    )
    return ok([_to_complaint(c, members) for c in (res.data or [])])


@complaints_router.post("", response_model=ApiResponse[Complaint])
def file_complaint(body: ComplaintCreate, user: CurrentUserDep) -> ApiResponse[Complaint]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    members = _members_map(sb, group_id)
    if body.filed_against == user.id:
        return err("You cannot file a complaint against yourself")
    if body.filed_against not in members:
        return err("Target must be a member of your group")

    res = (
        sb.table("complaints")
        .insert(
            {
                "group_id": group_id,
                "filed_by": user.id,
                "filed_against": body.filed_against,
                "reason": body.reason.strip(),
            }
        )
        .execute()
    )
    rows = res.data or []
    if not rows:
        return err("Failed to file complaint")
    complaint = rows[0]

    target = members.get(body.filed_against) or {}
    target_email = get_user_email(body.filed_against)
    filer_name = (members.get(user.id) or {}).get("display_name") or "A roommate"

    if target_email:
        send_complaint_filed(
            to=target_email,
            display_name=target.get("display_name") or "there",
            filed_by=filer_name,
            reason=body.reason.strip(),
        )

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=PUNISHMENT_LOOKBACK_SECONDS)).isoformat()
    new_pun_res = (
        sb.table("punishments")
        .select("*")
        .eq("user_id", body.filed_against)
        .eq("group_id", group_id)
        .gte("assigned_at", cutoff)
        .order("assigned_at", desc=True)
        .limit(1)
        .execute()
    )
    new_pun = (new_pun_res.data or [None])[0]
    if new_pun and target_email:
        strike_res = (
            sb.table("strikes")
            .select("strike_count")
            .eq("group_id", group_id)
            .eq("user_id", body.filed_against)
            .maybe_single()
            .execute()
        )
        strike_count = ((getattr(strike_res, "data", None) or {}).get("strike_count")) or 1
        send_punishment_assigned(
            to=target_email,
            display_name=target.get("display_name") or "there",
            strike_count=int(strike_count),
            punishment=new_pun["description"],
        )

    return ok(_to_complaint(complaint, members))


@strikes_router.get("", response_model=ApiResponse[list[StrikeCount]])
def list_strikes(user: CurrentUserDep) -> ApiResponse[list[StrikeCount]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    members = _members_map(sb, group_id)
    res = (
        sb.table("strikes")
        .select("user_id, strike_count")
        .eq("group_id", group_id)
        .execute()
    )
    by_uid = {r["user_id"]: int(r.get("strike_count") or 0) for r in (res.data or [])}
    summary = [
        StrikeCount(
            user_id=m["id"],
            display_name=m.get("display_name") or "",
            avatar_url=m.get("avatar_url"),
            strike_count=by_uid.get(m["id"], 0),
        )
        for m in members.values()
    ]
    summary.sort(key=lambda s: (-s.strike_count, s.display_name))
    return ok(summary)


@punishments_router.get("", response_model=ApiResponse[list[Punishment]])
def list_punishments(user: CurrentUserDep) -> ApiResponse[list[Punishment]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    members = _members_map(sb, group_id)
    res = (
        sb.table("punishments")
        .select("*")
        .eq("group_id", group_id)
        .order("assigned_at", desc=True)
        .execute()
    )
    return ok([_to_punishment(p, members) for p in (res.data or [])])


@punishments_router.patch("/{punishment_id}/complete", response_model=ApiResponse[Punishment])
def complete_punishment(punishment_id: str, user: CurrentUserDep) -> ApiResponse[Punishment]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    pun_res = sb.table("punishments").select("*").eq("id", punishment_id).maybe_single().execute()
    p = getattr(pun_res, "data", None)
    if not p or p["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Punishment not found")
    if p["user_id"] != user.id:
        return err("Only the punished user can mark this complete")

    update = {
        "is_completed": True,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    res = sb.table("punishments").update(update).eq("id", punishment_id).execute()
    rows = res.data or []
    if not rows:
        return err("Failed to mark complete")
    members = _members_map(sb, group_id)
    return ok(_to_punishment(rows[0], members))


@group_punishments_router.get("", response_model=ApiResponse[list[GroupPunishmentItem]])
def list_group_punishments(user: CurrentUserDep) -> ApiResponse[list[GroupPunishmentItem]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    res = (
        sb.table("group_punishments")
        .select("id, description")
        .eq("group_id", group_id)
        .order("description")
        .execute()
    )
    return ok(
        [GroupPunishmentItem(id=r["id"], description=r["description"]) for r in (res.data or [])]
    )


@group_punishments_router.post("", response_model=ApiResponse[GroupPunishmentItem])
def add_group_punishment(
    body: GroupPunishmentCreate, user: CurrentUserDep
) -> ApiResponse[GroupPunishmentItem]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    res = (
        sb.table("group_punishments")
        .insert({"group_id": group_id, "description": body.description.strip()})
        .execute()
    )
    rows = res.data or []
    if not rows:
        return err("Failed to add punishment")
    return ok(GroupPunishmentItem(id=rows[0]["id"], description=rows[0]["description"]))


@group_punishments_router.delete("/{punishment_id}", response_model=ApiResponse[dict])
def delete_group_punishment(punishment_id: str, user: CurrentUserDep) -> ApiResponse[dict]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    pun_res = (
        sb.table("group_punishments").select("*").eq("id", punishment_id).maybe_single().execute()
    )
    p = getattr(pun_res, "data", None)
    if not p or p["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Punishment option not found")
    sb.table("group_punishments").delete().eq("id", punishment_id).execute()
    return ok({"deleted": True})
