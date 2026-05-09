import httpx
from supabase import Client, create_client

from app.config import get_settings

_client: Client | None = None


def _force_http1(client: Client) -> None:
    """Swap HTTP/2 internal sessions for HTTP/1.1.

    Supabase's PostgREST endpoint serves HTTP/2 by default and supabase-py
    keeps the connection pooled forever. Idle HTTP/2 streams get GOAWAY'd
    server-side without the client noticing, so the next call dies with
    `httpx.RemoteProtocolError: Server disconnected` and we surface a 500.
    HTTP/1.1 reconnects cleanly when a socket is stale.
    """
    for attr in ("postgrest", "storage"):
        sub = getattr(client, attr, None)
        if sub is None:
            continue
        old = getattr(sub, "session", None)
        if not isinstance(old, httpx.Client):
            continue
        new = httpx.Client(
            base_url=old.base_url,
            headers=dict(old.headers),
            timeout=old.timeout,
            http2=False,
            follow_redirects=True,
        )
        try:
            old.close()
        except Exception:
            pass
        sub.session = new

    auth = getattr(client, "auth", None)
    old_auth = getattr(auth, "_http_client", None) if auth is not None else None
    if isinstance(old_auth, httpx.Client):
        new_auth = httpx.Client(
            headers=dict(old_auth.headers),
            timeout=old_auth.timeout,
            http2=False,
            follow_redirects=True,
        )
        try:
            old_auth.close()
        except Exception:
            pass
        auth._http_client = new_auth


def _build_client() -> Client:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    _force_http1(client)
    return client


def get_supabase() -> Client:
    """Service-role client for privileged backend operations (bypasses RLS)."""
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def reset_supabase() -> None:
    global _client
    if _client is not None:
        for attr in ("postgrest", "storage"):
            sub = getattr(_client, attr, None)
            session = getattr(sub, "session", None) if sub else None
            if isinstance(session, httpx.Client):
                try:
                    session.close()
                except Exception:
                    pass
    _client = None
