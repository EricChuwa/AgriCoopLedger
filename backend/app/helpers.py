from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User


def conflict(message: str, field: str | None = None) -> HTTPException:
    """A 409 the front end can show beside a form field when `field` is given."""
    detail = {"field": field, "message": message} if field else message
    return HTTPException(status.HTTP_409_CONFLICT, detail=detail)


def invalid(message: str, field: str | None = None) -> HTTPException:
    detail = {"field": field, "message": message} if field else message
    return HTTPException(422, detail=detail)


def get_in_coop(db: Session, model, obj_id: int, user: User, label: str):
    """Fetch a row that belongs to the user's cooperative, or a 404.
    Other cooperatives' rows look exactly like missing ones."""
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "cooperative_id", user.cooperative_id) != user.cooperative_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} not found.")
    return obj


def like(text: str) -> str:
    """A search term for ILIKE with % and _ taken literally, so typing "50%" finds "50%" and not everything.
    Use with `.ilike(like(q), escape="\\")`."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
