import random
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.models.chore import Chore, ChoreCreate, ChoreUpdate
from app.models.responses import ApiResponse, err, ok
from app.services.email import send_chore_assigned
from app.services.users import get_user_email
from app.supabase_client import get_supabase

router = APIRouter(prefix="/chores", tags=["chores"])


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


def _enrich(c: dict, members_by_id: dict[str, dict]) -> Chore:
    a = members_by_id.get(c.get("assigned_to") or "")
    cr = members_by_id.get(c.get("assigned_by") or "")
    cp = members_by_id.get(c.get("completed_by") or "")
    return Chore(
        id=c["id"],
        group_id=c["group_id"],
        title=c["title"],
        description=c.get("description"),
        assigned_to=c.get("assigned_to"),
        assignee_name=a.get("display_name") if a else None,
        assignee_avatar=a.get("avatar_url") if a else None,
        assigned_by=c.get("assigned_by"),
        creator_name=cr.get("display_name") if cr else None,
        is_completed=bool(c.get("is_completed")),
        completed_at=c.get("completed_at"),
        completed_by=c.get("completed_by"),
        completer_name=cp.get("display_name") if cp else None,
        due_date=c.get("due_date"),
        created_at=c.get("created_at"),
    )


def _notify_assigned(
    chore_title: str,
    assignee_id: str,
    assigner_id: str,
    members_by_id: dict[str, dict],
    due_date: date | None,
) -> None:
    if not assignee_id:
        return
    email = get_user_email(assignee_id)
    if not email:
        return
    assignee_name = (members_by_id.get(assignee_id) or {}).get("display_name") or "there"
    assigner_name = (members_by_id.get(assigner_id) or {}).get("display_name") or "A roommate"
    send_chore_assigned(
        to=email,
        display_name=assignee_name,
        chore_title=chore_title,
        assigned_by=assigner_name,
        due_date=due_date.isoformat() if due_date else None,
    )


@router.get("", response_model=ApiResponse[list[Chore]])
def list_chores(user: CurrentUserDep) -> ApiResponse[list[Chore]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")
    members_by_id = _members_map(sb, group_id)
    res = (
        sb.table("chores")
        .select("*")
        .eq("group_id", group_id)
        .order("is_completed")
        .order("created_at", desc=True)
        .execute()
    )
    return ok([_enrich(c, members_by_id) for c in (res.data or [])])


@router.post("", response_model=ApiResponse[Chore])
def create_chore(body: ChoreCreate, user: CurrentUserDep) -> ApiResponse[Chore]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    members_by_id = _members_map(sb, group_id)
    if body.assigned_to and body.assigned_to not in members_by_id:
        return err("Assignee must be a member of your group")

    payload = {
        "group_id": group_id,
        "title": body.title.strip(),
        "description": (body.description or "").strip() or None,
        "due_date": body.due_date.isoformat() if body.due_date else None,
        "assigned_to": body.assigned_to,
        "assigned_by": user.id,
    }
    res = sb.table("chores").insert(payload).execute()
    rows = res.data or []
    if not rows:
        return err("Failed to create chore")
    chore = rows[0]

    if body.assigned_to and body.assigned_to != user.id:
        _notify_assigned(
            chore_title=chore["title"],
            assignee_id=body.assigned_to,
            assigner_id=user.id,
            members_by_id=members_by_id,
            due_date=body.due_date,
        )

    return ok(_enrich(chore, members_by_id))


@router.patch("/{chore_id}", response_model=ApiResponse[Chore])
def update_chore(chore_id: str, body: ChoreUpdate, user: CurrentUserDep) -> ApiResponse[Chore]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    chore_res = sb.table("chores").select("*").eq("id", chore_id).maybe_single().execute()
    chore = getattr(chore_res, "data", None)
    if not chore or chore["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chore not found")

    if chore.get("assigned_by") != user.id and chore.get("assigned_to") != user.id:
        return err("Only the chore creator or assignee can edit")

    members_by_id = _members_map(sb, group_id)
    update: dict = {}
    if body.title is not None:
        update["title"] = body.title.strip()
    if body.description is not None:
        update["description"] = body.description.strip() or None
    if body.due_date is not None:
        update["due_date"] = body.due_date.isoformat()

    new_assignee_id: str | None = None
    if body.clear_assignee:
        update["assigned_to"] = None
    elif body.assigned_to is not None:
        if body.assigned_to not in members_by_id:
            return err("Assignee must be a member of your group")
        update["assigned_to"] = body.assigned_to
        new_assignee_id = body.assigned_to

    if not update:
        return err("No updatable fields provided")

    res = sb.table("chores").update(update).eq("id", chore_id).execute()
    rows = res.data or []
    if not rows:
        return err("Failed to update chore")
    updated = rows[0]

    if new_assignee_id and new_assignee_id != chore.get("assigned_to") and new_assignee_id != user.id:
        due = body.due_date or (
            date.fromisoformat(updated["due_date"][:10]) if updated.get("due_date") else None
        )
        _notify_assigned(
            chore_title=updated["title"],
            assignee_id=new_assignee_id,
            assigner_id=user.id,
            members_by_id=members_by_id,
            due_date=due,
        )

    return ok(_enrich(updated, members_by_id))


@router.delete("/{chore_id}", response_model=ApiResponse[dict])
def delete_chore(chore_id: str, user: CurrentUserDep) -> ApiResponse[dict]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    chore_res = sb.table("chores").select("*").eq("id", chore_id).maybe_single().execute()
    chore = getattr(chore_res, "data", None)
    if not chore or chore["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chore not found")
    if chore.get("assigned_by") != user.id:
        return err("Only the chore creator can delete")

    sb.table("chores").delete().eq("id", chore_id).execute()
    return ok({"deleted": True})


@router.post("/assign-random", response_model=ApiResponse[list[Chore]])
def assign_random(user: CurrentUserDep) -> ApiResponse[list[Chore]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    members_by_id = _members_map(sb, group_id)
    member_ids = list(members_by_id.keys())
    if not member_ids:
        return err("No members in this group")

    random.shuffle(member_ids)

    unassigned_res = (
        sb.table("chores")
        .select("id, title, due_date")
        .eq("group_id", group_id)
        .eq("is_completed", False)
        .is_("assigned_to", "null")
        .order("created_at")
        .execute()
    )
    unassigned = unassigned_res.data or []

    if not unassigned:
        return ok([])

    updated_chores: list[dict] = []
    for i, chore in enumerate(unassigned):
        assignee_id = member_ids[i % len(member_ids)]
        res = (
            sb.table("chores")
            .update({"assigned_to": assignee_id, "assigned_by": user.id})
            .eq("id", chore["id"])
            .execute()
        )
        rows = res.data or []
        if rows:
            updated_chores.append(rows[0])
            if assignee_id != user.id:
                due = (
                    date.fromisoformat(chore["due_date"][:10])
                    if chore.get("due_date")
                    else None
                )
                _notify_assigned(
                    chore_title=chore["title"],
                    assignee_id=assignee_id,
                    assigner_id=user.id,
                    members_by_id=members_by_id,
                    due_date=due,
                )

    return ok([_enrich(c, members_by_id) for c in updated_chores])


@router.patch("/{chore_id}/complete", response_model=ApiResponse[Chore])
def complete_chore(chore_id: str, user: CurrentUserDep) -> ApiResponse[Chore]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    chore_res = sb.table("chores").select("*").eq("id", chore_id).maybe_single().execute()
    chore = getattr(chore_res, "data", None)
    if not chore or chore["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chore not found")

    assigned_to = chore.get("assigned_to")
    if assigned_to and assigned_to != user.id:
        return err("Only the assignee can mark this complete")

    update = {
        "is_completed": True,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "completed_by": user.id,
    }
    res = sb.table("chores").update(update).eq("id", chore_id).execute()
    rows = res.data or []
    if not rows:
        return err("Failed to mark complete")

    members_by_id = _members_map(sb, group_id)
    return ok(_enrich(rows[0], members_by_id))
