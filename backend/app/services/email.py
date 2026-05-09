"""Resend email service.

All sends are wrapped in try/except — a failed send must never 500 the API.
Templates per RESEND.md.
"""
from typing import Optional

import resend

from app.config import get_settings

_settings = get_settings()
resend.api_key = _settings.RESEND_API_KEY
FROM_EMAIL = _settings.FROM_EMAIL
FRONTEND_URL = _settings.FRONTEND_URL


def send_email(to: str, subject: str, html: str) -> bool:
    if not _settings.RESEND_API_KEY:
        print(f"[email] RESEND_API_KEY not set — skipping send to {to} ({subject!r})")
        return False
    try:
        resend.Emails.send(
            {"from": FROM_EMAIL, "to": to, "subject": subject, "html": html}
        )
        return True
    except Exception as e:
        print(f"[email] send failed to {to}: {e}")
        return False


def send_welcome(to: str, display_name: str) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h1 style="color:#7c3aed;font-size:24px;margin-bottom:8px;">Welcome to Nestmates 🏠</h1>
      <p style="color:#374151;font-size:16px;">Hey {display_name},</p>
      <p style="color:#374151;font-size:16px;">
        You're all set. Now create a household or join one with an invite code to get started.
      </p>
      <a href="{FRONTEND_URL}/group/create"
         style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">
        Set up your home
      </a>
      <p style="color:#9ca3af;font-size:13px;margin-top:32px;">The Nestmates team</p>
    </div>
    """
    return send_email(to, "Welcome to Nestmates 🏠", html)


def send_chore_assigned(
    to: str,
    display_name: str,
    chore_title: str,
    assigned_by: str,
    due_date: Optional[str] = None,
) -> bool:
    due_line = f"<p style='color:#374151;'>Due: <strong>{due_date}</strong></p>" if due_date else ""
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h2 style="color:#7c3aed;font-size:20px;">New chore assigned 🧹</h2>
      <p style="color:#374151;">Hey {display_name}, <strong>{assigned_by}</strong> assigned you a task:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0;">
        <strong style="font-size:16px;color:#111827;">{chore_title}</strong>
        {due_line}
      </div>
      <a href="{FRONTEND_URL}/chores"
         style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600;">
        View chore
      </a>
    </div>
    """
    return send_email(to, f"You've been assigned: {chore_title}", html)


def send_bill_added(
    to: str, display_name: str, bill_title: str, amount_owed: float, paid_by: str
) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h2 style="color:#7c3aed;font-size:20px;">New shared bill 💸</h2>
      <p style="color:#374151;">Hey {display_name},</p>
      <p style="color:#374151;"><strong>{paid_by}</strong> added a bill that includes you:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0;">
        <strong style="font-size:16px;color:#111827;">{bill_title}</strong>
        <p style="color:#ef4444;font-size:20px;font-weight:700;margin:8px 0 0;">
          You owe ${amount_owed:.2f}
        </p>
      </div>
      <a href="{FRONTEND_URL}/bills"
         style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600;">
        View bill
      </a>
    </div>
    """
    return send_email(to, f"You owe ${amount_owed:.2f} for: {bill_title}", html)


def send_complaint_filed(to: str, display_name: str, filed_by: str, reason: str) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h2 style="color:#dc2626;font-size:20px;">You received a complaint ⚠️</h2>
      <p style="color:#374151;">Hey {display_name},</p>
      <p style="color:#374151;"><strong>{filed_by}</strong> filed a complaint against you:</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="color:#374151;font-style:italic;">"{reason}"</p>
      </div>
      <p style="color:#6b7280;font-size:14px;">
        3 complaints = 1 strike. 3 strikes = a punishment. Try to keep the peace 🕊️
      </p>
      <a href="{FRONTEND_URL}/complaints"
         style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600;">
        View complaints
      </a>
    </div>
    """
    return send_email(to, "You received a complaint from a roommate", html)


def send_punishment_assigned(
    to: str, display_name: str, strike_count: int, punishment: str
) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h2 style="color:#dc2626;font-size:20px;">Strike {strike_count} — Punishment assigned 🔴</h2>
      <p style="color:#374151;">Hey {display_name},</p>
      <p style="color:#374151;">You've accumulated enough complaints for a strike. Your punishment:</p>
      <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;
                  padding:20px;margin:16px 0;text-align:center;">
        <strong style="font-size:18px;color:#dc2626;">{punishment}</strong>
      </div>
      <p style="color:#6b7280;font-size:14px;">
        Complete it and mark it done in the app to clear the badge.
      </p>
      <a href="{FRONTEND_URL}/complaints"
         style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600;">
        View punishment
      </a>
    </div>
    """
    return send_email(to, f"Strike {strike_count}: You've been assigned a punishment", html)
