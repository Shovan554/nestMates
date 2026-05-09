from datetime import datetime

from pydantic import BaseModel, Field


class BillSplit(BaseModel):
    id: str
    bill_id: str
    user_id: str
    user_name: str | None = None
    user_avatar: str | None = None
    amount_owed: float
    is_paid: bool
    paid_at: datetime | None = None


class Bill(BaseModel):
    id: str
    group_id: str
    title: str
    amount: float
    paid_by: str
    payer_name: str | None = None
    payer_avatar: str | None = None
    note: str | None = None
    receipt_url: str | None = None
    created_at: datetime | None = None
    splits: list[BillSplit] = []


class BillCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0)
    note: str | None = None
    member_ids: list[str] = Field(min_length=1)


class BillUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = None
