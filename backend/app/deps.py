import time

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import SESSION_IDLE_SECONDS
from app.database import get_db
from app.models import User

IDLE_MESSAGE = "You were signed out after 15 minutes without activity. Sign in again."


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """The signed-in, active user for this request, or a 401.
    Also ends a session that has been idle for too long (NFR 13)."""
    user_id = request.session.get("user_id")
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        request.session.clear()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")

    now = time.time()
    last_seen = request.session.get("last_seen")
    if last_seen is None or now - last_seen > SESSION_IDLE_SECONDS:
        request.session.clear()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, IDLE_MESSAGE)
    request.session["last_seen"] = now
    return user


def require_role(*roles: str):
    """Dependency factory: allow only users whose role is in `roles` (NFR 11, BR 1, BR 2)."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this.")
        return user

    return checker
