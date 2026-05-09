from functools import lru_cache
from typing import Annotated

import httpx
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel
from supabase import Client, create_client

from app.config import get_settings
from app.supabase_client import _force_http1

_TRANSIENT_NETWORK_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.WriteError,
)


class CurrentUser(BaseModel):
    id: str
    email: str | None = None


@lru_cache
def _auth_client() -> Client:
    """Lightweight Supabase client used only for auth.get_user(jwt).

    Uses the anon key — get_user(jwt) authenticates by the bearer token itself,
    not by the apikey, so the anon key is sufficient and avoids exposing
    the service role secret in this code path.

    Forces HTTP/1.1 so the long-lived gotrue httpx pool doesn't die from
    idle HTTP/2 GOAWAYs (same fix as supabase_client.get_supabase()).
    """
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    _force_http1(client)
    return client


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if not authorization:
        print("[auth] 401: no Authorization header on request")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    if not authorization.lower().startswith("bearer "):
        print(f"[auth] 401: Authorization header not a Bearer token (got prefix: {authorization[:20]!r})")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be a Bearer token",
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
        resp = _auth_client().auth.get_user(token)
    except _TRANSIENT_NETWORK_ERRORS as e:
        print(f"[auth] retrying after transient network error — {type(e).__name__}: {e}")
        try:
            resp = _auth_client().auth.get_user(token)
        except Exception as e2:
            print(f"[auth] 401: Supabase rejected token — {type(e2).__name__}: {e2}")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        print(f"[auth] 401: Supabase rejected token — {type(e).__name__}: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = getattr(resp, "user", None)
    if user is None or not getattr(user, "id", None):
        print("[auth] 401: Supabase returned no user for token (likely expired/revoked)")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return CurrentUser(id=user.id, email=getattr(user, "email", None))


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
