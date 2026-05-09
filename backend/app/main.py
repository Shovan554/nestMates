from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    auth,
    bills,
    chores,
    complaints,
    dashboard,
    groups,
    health,
    me,
    messages,
    profile,
)

settings = get_settings()

app = FastAPI(title="Nestmates API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(groups.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(chores.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")
app.include_router(bills.router, prefix="/api/v1")
app.include_router(complaints.complaints_router, prefix="/api/v1")
app.include_router(complaints.strikes_router, prefix="/api/v1")
app.include_router(complaints.punishments_router, prefix="/api/v1")
app.include_router(complaints.group_punishments_router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
