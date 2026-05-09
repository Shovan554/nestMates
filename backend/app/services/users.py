"""Helpers for looking up auth.users info via service-role admin API."""
from app.supabase_client import get_supabase


def get_user_email(user_id: str) -> str | None:
    sb = get_supabase()
    try:
        resp = sb.auth.admin.get_user_by_id(user_id)
    except Exception:
        return None
    user = getattr(resp, "user", None) if resp else None
    return getattr(user, "email", None) if user else None
