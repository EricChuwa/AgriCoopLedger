"""The audit log (FR 7.2, NFR 15). A Manager can read and filter it. There is deliberately no route that
edits or deletes an entry."""

from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit as audit_chain
from app.database import get_db
from app.deps import require_role
from app.models import ROLE_MANAGER, AuditEntry, User
from app.schemas import AuditOut
from app.services import KIGALI

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/verify")
def verify_chain(user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)):
    """Re-check the hash chain of every entry. ok=false names the first entry that was altered or whose
    predecessor was removed."""
    return audit_chain.verify(db, user.cooperative_id)


@router.get("", response_model=list[AuditOut])
def list_audit(
    action: str | None = Query(default=None, max_length=40, description="An action, or a prefix such as 'delivery'"),
    entity_type: str | None = Query(default=None, max_length=30),
    user_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    user: User = Depends(require_role(ROLE_MANAGER)),
    db: Session = Depends(get_db),
):
    stmt = select(AuditEntry).where(AuditEntry.cooperative_id == user.cooperative_id)
    if action:
        stmt = stmt.where(AuditEntry.action.startswith(action))
    if entity_type:
        stmt = stmt.where(AuditEntry.entity_type == entity_type)
    if user_id is not None:
        stmt = stmt.where(AuditEntry.user_id == user_id)
    if date_from is not None:
        stmt = stmt.where(AuditEntry.created_at >= datetime.combine(date_from, time.min, tzinfo=KIGALI))
    if date_to is not None:
        stmt = stmt.where(AuditEntry.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=KIGALI))
    rows = db.scalars(stmt.order_by(AuditEntry.id.desc()).limit(limit)).all()
    return [AuditOut(id=r.id, user_name=r.user_name, action=r.action, entity_type=r.entity_type,
                     entity_id=r.entity_id, summary=r.summary, created_at=r.created_at) for r in rows]
