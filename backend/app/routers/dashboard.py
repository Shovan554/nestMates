from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter

from app.dependencies import CurrentUserDep
from app.models.dashboard import (
    ChoreLite,
    DashboardData,
    RoommateStatus,
    StrikeSummary,
)
from app.models.responses import ApiResponse, ok
from app.supabase_client import get_supabase

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except (TypeError, ValueError):
        return None


@router.get("", response_model=ApiResponse[DashboardData])
def get_dashboard(user: CurrentUserDep) -> ApiResponse[DashboardData]:
    sb = get_supabase()

    profile_res = (
        sb.table("profiles").select("group_id").eq("id", user.id).maybe_single().execute()
    )
    profile = getattr(profile_res, "data", None) or {}
    group_id = profile.get("group_id")
    if not group_id:
        return ok(None)

    group_res = (
        sb.table("groups")
        .select("name, invite_code")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    group_row = getattr(group_res, "data", None) or {}

    members_res = (
        sb.table("profiles")
        .select("id, display_name, avatar_url")
        .eq("group_id", group_id)
        .execute()
    )
    members = members_res.data or []
    member_by_id = {m["id"]: m for m in members}

    chores_res = (
        sb.table("chores")
        .select("id, title, due_date, assigned_to, is_completed")
        .eq("group_id", group_id)
        .eq("is_completed", False)
        .execute()
    )
    chores = chores_res.data or []

    my_chores: list[ChoreLite] = []
    roommate_chores: list[ChoreLite] = []
    active_chores_per_user: dict[str, int] = defaultdict(int)

    for c in chores:
        assignee_id = c.get("assigned_to")
        if assignee_id:
            active_chores_per_user[assignee_id] += 1
        assignee = member_by_id.get(assignee_id) if assignee_id else None
        lite = ChoreLite(
            id=c["id"],
            title=c["title"],
            due_date=_parse_date(c.get("due_date")),
            assignee_id=assignee_id,
            assignee_name=assignee.get("display_name") if assignee else None,
        )
        if assignee_id == user.id:
            my_chores.append(lite)
        elif assignee_id is not None:
            roommate_chores.append(lite)

    my_splits_res = (
        sb.table("bill_splits")
        .select("amount_owed")
        .eq("user_id", user.id)
        .eq("is_paid", False)
        .execute()
    )
    i_owe = sum(Decimal(str(r.get("amount_owed") or 0)) for r in (my_splits_res.data or []))

    my_bills_res = sb.table("bills").select("id").eq("paid_by", user.id).execute()
    my_bill_ids = [b["id"] for b in (my_bills_res.data or [])]

    owed_to_me = Decimal(0)
    if my_bill_ids:
        owed_res = (
            sb.table("bill_splits")
            .select("amount_owed, user_id")
            .in_("bill_id", my_bill_ids)
            .eq("is_paid", False)
            .execute()
        )
        for r in owed_res.data or []:
            if r.get("user_id") != user.id:
                owed_to_me += Decimal(str(r.get("amount_owed") or 0))

    strikes_res = (
        sb.table("strikes")
        .select("user_id, strike_count")
        .eq("group_id", group_id)
        .gt("strike_count", 0)
        .execute()
    )
    strikes_rows = strikes_res.data or []

    pun_res = (
        sb.table("punishments")
        .select("user_id, description, assigned_at")
        .eq("group_id", group_id)
        .eq("is_completed", False)
        .order("assigned_at", desc=True)
        .execute()
    )
    latest_active_punishment: dict[str, str] = {}
    for p in pun_res.data or []:
        uid = p["user_id"]
        if uid not in latest_active_punishment:
            latest_active_punishment[uid] = p["description"]

    strike_summary: list[StrikeSummary] = []
    for s in strikes_rows:
        uid = s["user_id"]
        m = member_by_id.get(uid)
        if not m:
            continue
        strike_summary.append(
            StrikeSummary(
                user_id=uid,
                display_name=m.get("display_name") or "",
                strike_count=int(s.get("strike_count") or 0),
                active_punishment=latest_active_punishment.get(uid),
            )
        )

    roommate_status = [
        RoommateStatus(
            user_id=m["id"],
            display_name=m.get("display_name") or "",
            avatar_url=m.get("avatar_url"),
            active_chores=active_chores_per_user.get(m["id"], 0),
        )
        for m in members
    ]

    return ok(
        DashboardData(
            group_name=group_row.get("name") or "",
            group_invite_code=group_row.get("invite_code") or "",
            my_chores=my_chores,
            roommate_chores=roommate_chores,
            i_owe=float(i_owe),
            owed_to_me=float(owed_to_me),
            roommate_status=roommate_status,
            strikes=strike_summary,
        )
    )
