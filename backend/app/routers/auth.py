from fastapi import APIRouter

from app.dependencies import CurrentUserDep
from app.models.responses import ApiResponse, ok
from app.services.email import send_welcome
from app.supabase_client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/welcome", response_model=ApiResponse[dict])
def send_welcome_email(user: CurrentUserDep) -> ApiResponse[dict]:
    if not user.email:
        return ok({"sent": False, "reason": "no email"})

    sb = get_supabase()
    res = sb.table("profiles").select("display_name").eq("id", user.id).maybe_single().execute()
    row = getattr(res, "data", None) or {}
    display_name = row.get("display_name") or (user.email.split("@")[0] if user.email else "there")

    sent = send_welcome(user.email, display_name)
    return ok({"sent": sent})
