from fastapi import APIRouter, File, UploadFile

from app.dependencies import CurrentUserDep
from app.models.profile import Profile
from app.models.responses import ApiResponse, err, ok
from app.supabase_client import get_supabase

router = APIRouter(prefix="/profile", tags=["profile"])

ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "gif"}


@router.post("/avatar", response_model=ApiResponse[Profile])
async def upload_avatar(
    user: CurrentUserDep, file: UploadFile = File(...)
) -> ApiResponse[Profile]:
    sb = get_supabase()

    filename = file.filename or "avatar"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    if ext not in ALLOWED_EXT:
        return err("Unsupported file type. Use jpg, png, webp, or gif.")

    contents = await file.read()
    object_path = f"{user.id}/avatar.{ext}"

    try:
        sb.storage.from_("avatars").upload(
            path=object_path,
            file=contents,
            file_options={
                "content-type": file.content_type or "image/jpeg",
                "upsert": "true",
            },
        )
    except Exception as e:
        return err(f"Upload failed: {e}")

    public_url_resp = sb.storage.from_("avatars").get_public_url(object_path)
    public_url = public_url_resp if isinstance(public_url_resp, str) else None
    if isinstance(public_url_resp, dict):
        public_url = (
            public_url_resp.get("publicUrl")
            or public_url_resp.get("public_url")
            or public_url_resp.get("publicURL")
        )

    if public_url:
        public_url = f"{public_url.rstrip('/')}?v={int(__import__('time').time())}"

    update = {"avatar_url": public_url} if public_url else {}
    if update:
        sb.table("profiles").update(update).eq("id", user.id).execute()

    res = sb.table("profiles").select("*").eq("id", user.id).maybe_single().execute()
    row = getattr(res, "data", None) or {}
    return ok(
        Profile(
            id=row.get("id") or user.id,
            email=user.email,
            display_name=row.get("display_name") or "",
            avatar_url=row.get("avatar_url"),
            group_id=row.get("group_id"),
        )
    )
