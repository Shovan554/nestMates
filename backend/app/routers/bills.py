from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.dependencies import CurrentUserDep
from app.models.bill import Bill, BillCreate, BillSplit, BillUpdate
from app.models.responses import ApiResponse, err, ok
from app.services.email import send_bill_added
from app.services.users import get_user_email
from app.supabase_client import get_supabase

router = APIRouter(prefix="/bills", tags=["bills"])

ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "gif"}
SIGNED_URL_TTL_SECONDS = 3600


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


def _sign_receipt(sb, path: str | None) -> str | None:
    if not path:
        return None
    try:
        res = sb.storage.from_("receipts").create_signed_url(path, SIGNED_URL_TTL_SECONDS)
    except Exception:
        return None
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    return getattr(res, "signed_url", None) or getattr(res, "signedURL", None)


def _split_evenly(total: Decimal, n: int) -> list[Decimal]:
    """Split total into n parts of equal cents; remainder goes to the last split."""
    cents_total = (total * 100).to_integral_value(rounding=ROUND_HALF_UP)
    base = cents_total // n
    remainder = cents_total - base * n
    parts = [Decimal(base) / 100 for _ in range(n)]
    if remainder:
        parts[-1] += Decimal(remainder) / 100
    return parts


def _to_split(s: dict, members: dict[str, dict]) -> BillSplit:
    m = members.get(s.get("user_id") or "")
    return BillSplit(
        id=s["id"],
        bill_id=s["bill_id"],
        user_id=s["user_id"],
        user_name=m.get("display_name") if m else None,
        user_avatar=m.get("avatar_url") if m else None,
        amount_owed=float(s.get("amount_owed") or 0),
        is_paid=bool(s.get("is_paid")),
        paid_at=s.get("paid_at"),
    )


def _to_bill(b: dict, splits: list[dict], members: dict[str, dict], signed_url: str | None) -> Bill:
    payer = members.get(b.get("paid_by") or "")
    return Bill(
        id=b["id"],
        group_id=b["group_id"],
        title=b["title"],
        amount=float(b.get("amount") or 0),
        paid_by=b["paid_by"],
        payer_name=payer.get("display_name") if payer else None,
        payer_avatar=payer.get("avatar_url") if payer else None,
        note=b.get("note"),
        receipt_url=signed_url,
        created_at=b.get("created_at"),
        splits=[_to_split(s, members) for s in splits],
    )


@router.get("", response_model=ApiResponse[list[Bill]])
def list_bills(user: CurrentUserDep) -> ApiResponse[list[Bill]]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    members = _members_map(sb, group_id)
    bills_res = (
        sb.table("bills")
        .select("*")
        .eq("group_id", group_id)
        .order("created_at", desc=True)
        .execute()
    )
    bills = bills_res.data or []
    if not bills:
        return ok([])

    bill_ids = [b["id"] for b in bills]
    splits_res = sb.table("bill_splits").select("*").in_("bill_id", bill_ids).execute()
    splits_by_bill: dict[str, list[dict]] = {}
    for s in splits_res.data or []:
        splits_by_bill.setdefault(s["bill_id"], []).append(s)

    return ok(
        [
            _to_bill(b, splits_by_bill.get(b["id"], []), members, _sign_receipt(sb, b.get("receipt_url")))
            for b in bills
        ]
    )


@router.post("", response_model=ApiResponse[Bill])
def create_bill(body: BillCreate, user: CurrentUserDep) -> ApiResponse[Bill]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    members = _members_map(sb, group_id)
    member_ids = list(dict.fromkeys(body.member_ids))
    for mid in member_ids:
        if mid not in members:
            return err("Some selected members are not in your group")

    bill_res = (
        sb.table("bills")
        .insert(
            {
                "group_id": group_id,
                "title": body.title.strip(),
                "amount": float(body.amount),
                "paid_by": user.id,
                "note": (body.note or "").strip() or None,
            }
        )
        .execute()
    )
    bill_rows = bill_res.data or []
    if not bill_rows:
        return err("Failed to create bill")
    bill = bill_rows[0]

    parts = _split_evenly(Decimal(str(body.amount)), len(member_ids))
    split_payload = [
        {
            "bill_id": bill["id"],
            "user_id": mid,
            "amount_owed": float(part),
            "is_paid": mid == user.id,
            "paid_at": datetime.now(timezone.utc).isoformat() if mid == user.id else None,
        }
        for mid, part in zip(member_ids, parts)
    ]
    splits_res = sb.table("bill_splits").insert(split_payload).execute()
    splits = splits_res.data or []

    payer_name = (members.get(user.id) or {}).get("display_name") or "A roommate"
    for mid, part in zip(member_ids, parts):
        if mid == user.id:
            continue
        email = get_user_email(mid)
        if not email:
            continue
        m = members.get(mid) or {}
        send_bill_added(
            to=email,
            display_name=m.get("display_name") or "there",
            bill_title=bill["title"],
            amount_owed=float(part),
            paid_by=payer_name,
        )

    return ok(_to_bill(bill, splits, members, _sign_receipt(sb, bill.get("receipt_url"))))


@router.patch("/{bill_id}", response_model=ApiResponse[Bill])
def update_bill(bill_id: str, body: BillUpdate, user: CurrentUserDep) -> ApiResponse[Bill]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    bill_res = sb.table("bills").select("*").eq("id", bill_id).maybe_single().execute()
    bill = getattr(bill_res, "data", None)
    if not bill or bill["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bill not found")
    if bill["paid_by"] != user.id:
        return err("Only the bill creator can edit")

    update: dict = {}
    if body.title is not None:
        update["title"] = body.title.strip()
    if body.note is not None:
        update["note"] = body.note.strip() or None
    if not update:
        return err("No updatable fields provided")

    res = sb.table("bills").update(update).eq("id", bill_id).execute()
    rows = res.data or []
    if not rows:
        return err("Failed to update bill")
    updated = rows[0]

    members = _members_map(sb, group_id)
    splits_res = sb.table("bill_splits").select("*").eq("bill_id", bill_id).execute()
    return ok(
        _to_bill(updated, splits_res.data or [], members, _sign_receipt(sb, updated.get("receipt_url")))
    )


@router.delete("/{bill_id}", response_model=ApiResponse[dict])
def delete_bill(bill_id: str, user: CurrentUserDep) -> ApiResponse[dict]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    bill_res = sb.table("bills").select("*").eq("id", bill_id).maybe_single().execute()
    bill = getattr(bill_res, "data", None)
    if not bill or bill["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bill not found")
    if bill["paid_by"] != user.id:
        return err("Only the bill creator can delete")

    if bill.get("receipt_url"):
        try:
            sb.storage.from_("receipts").remove([bill["receipt_url"]])
        except Exception:
            pass

    sb.table("bills").delete().eq("id", bill_id).execute()
    return ok({"deleted": True})


@router.patch("/{bill_id}/splits/{split_id}/pay", response_model=ApiResponse[Bill])
def mark_split_paid(bill_id: str, split_id: str, user: CurrentUserDep) -> ApiResponse[Bill]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    split_res = sb.table("bill_splits").select("*").eq("id", split_id).maybe_single().execute()
    split = getattr(split_res, "data", None)
    if not split or split["bill_id"] != bill_id or split["user_id"] != user.id:
        return err("You can only mark your own splits as paid")

    if not split.get("is_paid"):
        sb.table("bill_splits").update(
            {"is_paid": True, "paid_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", split_id).execute()

    bill_res = sb.table("bills").select("*").eq("id", bill_id).maybe_single().execute()
    bill = getattr(bill_res, "data", None)
    if not bill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bill not found")
    splits_res = sb.table("bill_splits").select("*").eq("bill_id", bill_id).execute()
    members = _members_map(sb, group_id)
    return ok(
        _to_bill(bill, splits_res.data or [], members, _sign_receipt(sb, bill.get("receipt_url")))
    )


@router.post("/{bill_id}/receipt", response_model=ApiResponse[Bill])
async def upload_receipt(
    bill_id: str, user: CurrentUserDep, file: UploadFile = File(...)
) -> ApiResponse[Bill]:
    sb = get_supabase()
    group_id = _user_group_id(sb, user.id)
    if not group_id:
        return err("You are not in a group")

    bill_res = sb.table("bills").select("*").eq("id", bill_id).maybe_single().execute()
    bill = getattr(bill_res, "data", None)
    if not bill or bill["group_id"] != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bill not found")
    if bill["paid_by"] != user.id:
        return err("Only the bill creator can upload a receipt")

    filename = file.filename or "receipt"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    if ext not in ALLOWED_EXT:
        return err("Unsupported file type. Use jpg, png, webp, or gif.")

    contents = await file.read()
    object_path = f"{bill_id}.{ext}"

    try:
        sb.storage.from_("receipts").upload(
            path=object_path,
            file=contents,
            file_options={
                "content-type": file.content_type or "image/jpeg",
                "upsert": "true",
            },
        )
    except Exception as e:
        return err(f"Upload failed: {e}")

    sb.table("bills").update({"receipt_url": object_path}).eq("id", bill_id).execute()

    bill["receipt_url"] = object_path
    splits_res = sb.table("bill_splits").select("*").eq("bill_id", bill_id).execute()
    members = _members_map(sb, group_id)
    return ok(
        _to_bill(bill, splits_res.data or [], members, _sign_receipt(sb, object_path))
    )
