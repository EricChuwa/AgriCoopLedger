"""Audit entries with a hash chain (FR 7.1, NFR 15).

Every entry stores the hash of the previous entry in its cooperative and a SHA-256 hash of its own fields
plus that previous hash. Editing a row, or deleting one from the middle, breaks the chain and `verify`
reports the first entry that no longer matches."""

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, Cooperative, User

GENESIS = "0" * 64


def _stamp(moment: datetime) -> str:
    """A time written the same way whether it came from Python or back from the database."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc).replace(tzinfo=None)
    return moment.isoformat(timespec="microseconds")


def compute_hash(prev_hash: str, e: AuditEntry) -> str:
    parts = [prev_hash, str(e.cooperative_id), str(e.user_id or ""), e.user_name, e.action,
             e.entity_type, str(e.entity_id), e.summary, _stamp(e.created_at)]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def lock_cooperative(db: Session, cooperative_id: int) -> None:
    """Take a row lock on the cooperative until the transaction ends (PostgreSQL; SQLite serialises writes anyway).
    Anything that reads a balance and then acts on it calls this first, so two requests for the same cooperative
    cannot both act on the same old balance. The audit writer takes the same lock, so chains never fork either."""
    db.execute(select(Cooperative.id).where(Cooperative.id == cooperative_id).with_for_update())


def record(db: Session, user: User, action: str, entity_type: str, entity_id: int, summary: str) -> None:
    """Add an audit entry in the caller's transaction, so the change and its log entry save together
    or not at all (FR 7.1). The caller commits."""
    record_for(db, user.cooperative_id, user.id, user.full_name, action, entity_type, entity_id, summary)


def record_for(db: Session, cooperative_id: int, user_id: int | None, user_name: str, action: str,
               entity_type: str, entity_id: int, summary: str) -> None:
    """The same, for an action with no signed in user (a buyer's public order request). The name is the
    buyer's own words and says so in the summary."""
    # The same lock stops two requests chaining onto the same previous entry.
    lock_cooperative(db, cooperative_id)
    last = db.scalar(select(AuditEntry.entry_hash).where(AuditEntry.cooperative_id == cooperative_id)
                     .order_by(AuditEntry.id.desc()).limit(1))
    entry = AuditEntry(
        cooperative_id=cooperative_id, user_id=user_id, user_name=user_name, action=action,
        entity_type=entity_type, entity_id=entity_id, summary=summary[:400],
        created_at=datetime.now(timezone.utc), prev_hash=last or GENESIS,
    )
    entry.entry_hash = compute_hash(entry.prev_hash, entry)
    db.add(entry)
    db.flush()


def verify(db: Session, cooperative_id: int) -> dict:
    """Walk the whole chain. Returns how many entries were checked and the first one that does not match."""
    expected_prev = GENESIS
    checked = 0
    for e in db.scalars(select(AuditEntry).where(AuditEntry.cooperative_id == cooperative_id).order_by(AuditEntry.id)):
        checked += 1
        if e.prev_hash != expected_prev or e.entry_hash != compute_hash(e.prev_hash, e):
            return {"ok": False, "checked": checked, "first_bad_id": e.id}
        expected_prev = e.entry_hash
    return {"ok": True, "checked": checked, "first_bad_id": None}
