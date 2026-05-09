from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUserDep
from app.models.profile import Profile
from app.models.responses import ApiResponse, err, ok
from app.supabase_client import get_supabase

router = APIRouter(tags=["me"])


@router.get("/me", response_model=ApiResponse[Profile])
def get_me(user: CurrentUserDep) -> ApiResponse[Profile]:
    sb = get_supabase()
    res = sb.table("profiles").select("*").eq("id", user.id).maybe_single().execute()

    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found — handle_new_user trigger may not be active",
        )

    return ok(
        Profile(
            id=row["id"],
            email=user.email,
            display_name=row.get("display_name") or "",
            avatar_url=row.get("avatar_url"),
            group_id=row.get("group_id"),
        )
    )


@router.patch("/me", response_model=ApiResponse[Profile])
def update_me(payload: dict, user: CurrentUserDep) -> ApiResponse[Profile]:
    allowed = {k: v for k, v in payload.items() if k in {"display_name", "avatar_url"}}
    if not allowed:
        return err("No updatable fields provided")

    sb = get_supabase()
    res = sb.table("profiles").update(allowed).eq("id", user.id).execute()
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found")
    row = rows[0]
    return ok(
        Profile(
            id=row["id"],
            email=user.email,
            display_name=row.get("display_name") or "",
            avatar_url=row.get("avatar_url"),
            group_id=row.get("group_id"),
        )
    )
