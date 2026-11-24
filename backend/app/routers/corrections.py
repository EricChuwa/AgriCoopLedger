"""Correction requests. A Collection Clerk, who spots a wrong value, asks for a correction with a reason; a
Manager approves or rejects it (SRS Appendix B, activity diagram). The Manager can also correct a delivery
directly (see deliveries.py). Every decision is audited."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import require_role
from app.helpers import conflict, get_in_coop, invalid
from app.models import (
    CORRECTION_APPROVED, CORRECTION_DIRECT, CORRECTION_PENDING, CORRECTION_REJECTED, ROLE_CLERK, ROLE_MANAGER,
    Correction, Delivery, User,
)
from app.routers.deliveries import apply_correction, receipt_no
from app.schemas import CorrectionOut, CorrectionRequestIn, DecisionIn
from app.services import kg_of, price_on, to_grams, value_of

router = APIRouter(prefix="/api/corrections", tags=["corrections"])

manager_only = require_role(ROLE_MANAGER)


def _out(db: Session, c: Correction) -> CorrectionOut:
    d = c.delivery
    applied = c.applied_weight_grams is not None
    if applied:
        old_w, old_g, old_v = c.old_weight_grams, c.old_grade, c.old_value
        new_w, new_g, new_v = c.applied_weight_grams, c.applied_grade, c.applied_value
    else:
        # Pending or rejected: compare the delivery as it stands with what was asked for.
        old_w, old_g, old_v = d.weight_grams, d.grade, d.value
        new_w = c.new_weight_grams if c.new_weight_grams is not None else d.weight_grams
        new_g = c.new_grade or d.grade
        if new_g == d.grade:
            per_kg = d.price_per_kg  # same grade keeps the price it was recorded under
        else:
            price = price_on(db, d.produce_id, new_g, d.delivery_date)
            per_kg = price.price_per_kg if price else None
        new_v = value_of(new_w, per_kg) if per_kg is not None else None
    return CorrectionOut(
        id=c.id, delivery_id=d.id, receipt_no=receipt_no(d.id), farmer_name=d.farmer.full_name,
        produce_name=d.produce.name, status=c.status, reason=c.reason, requested_by=c.requested_by.full_name,
        created_at=c.created_at, old_weight_kg=kg_of(old_w), old_grade=old_g, old_value=old_v,
        new_weight_kg=kg_of(new_w), new_grade=new_g, new_value=new_v,
        decided_by=c.decided_by.full_name if c.decided_by else None, decided_at=c.decided_at,
        decision_note=c.decision_note,
    )


def _load(db: Session, correction_id: int, user: User) -> Correction:
    return get_in_coop(db, Correction, correction_id, user, "Correction request")


@router.get("", response_model=list[CorrectionOut])
def list_corrections(
    status: str | None = Query(default=None, pattern="^(pending|approved|rejected|direct)$"),
    user: User = Depends(require_role(ROLE_MANAGER, ROLE_CLERK)),
    db: Session = Depends(get_db),
):
    """A Manager sees every correction. A Clerk sees only their own requests."""
    stmt = (
        select(Correction).where(Correction.cooperative_id == user.cooperative_id)
        .options(selectinload(Correction.delivery).selectinload(Delivery.farmer),
                 selectinload(Correction.delivery).selectinload(Delivery.produce),
                 selectinload(Correction.requested_by), selectinload(Correction.decided_by))
        .order_by(Correction.id.desc())
    )
    if user.role == ROLE_CLERK:
        stmt = stmt.where(Correction.requested_by_id == user.id)
    if status:
        stmt = stmt.where(Correction.status == status)
    return [_out(db, c) for c in db.scalars(stmt).all()]


@router.post("", response_model=CorrectionOut, status_code=201)
def request_correction(
    data: CorrectionRequestIn, user: User = Depends(require_role(ROLE_CLERK)), db: Session = Depends(get_db)
):
    delivery = get_in_coop(db, Delivery, data.delivery_id, user, "Delivery")
    if delivery.voided_at:
        raise conflict("This delivery is voided and cannot be corrected.")
    if data.weight_kg is None and data.grade is None:
        raise invalid("Enter a new weight or a new grade.")
    grams = to_grams(data.weight_kg) if data.weight_kg is not None else None
    if (grams is None or grams == delivery.weight_grams) and (data.grade is None or data.grade == delivery.grade):
        raise conflict("Nothing would change. Enter a different weight or grade.")
    open_request = db.scalar(select(Correction.id).where(
        Correction.delivery_id == delivery.id, Correction.status == CORRECTION_PENDING))
    if open_request:
        raise conflict("A correction request for this delivery is already waiting for a Manager.")
    correction = Correction(
        cooperative_id=user.cooperative_id, delivery_id=delivery.id, requested_by_id=user.id,
        new_weight_grams=grams, new_grade=data.grade, reason=data.reason, status=CORRECTION_PENDING,
    )
    db.add(correction)
    db.flush()
    audit.record(db, user, "correction.requested", "delivery", delivery.id,
                 f"Requested a correction to {receipt_no(delivery.id)}. Reason: {data.reason}")
    db.commit()
    db.refresh(correction)
    return _out(db, correction)


@router.post("/{correction_id}/approve", response_model=CorrectionOut)
def approve(correction_id: int, data: DecisionIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    audit.lock_cooperative(db, user.cooperative_id)  # the balance check in apply_correction must be current
    correction = _load(db, correction_id, user)
    if correction.status != CORRECTION_PENDING:
        raise conflict("This request has already been decided.")
    if correction.requested_by_id == user.id:  # the approver must not be the requester
        raise conflict("You cannot approve a correction you requested yourself.")
    apply_correction(db, user, correction.delivery, correction.new_weight_grams, correction.new_grade, correction)
    correction.status = CORRECTION_APPROVED
    correction.decided_by_id = user.id
    correction.decided_at = datetime.now(timezone.utc)
    correction.decision_note = data.note.strip() or None
    audit.record(db, user, "correction.approved", "delivery", correction.delivery_id,
                 f"Approved the correction request for {receipt_no(correction.delivery_id)}.")
    db.commit()
    db.refresh(correction)
    return _out(db, correction)


@router.post("/{correction_id}/reject", response_model=CorrectionOut)
def reject(correction_id: int, data: DecisionIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    correction = _load(db, correction_id, user)
    if correction.status != CORRECTION_PENDING:
        raise conflict("This request has already been decided.")
    correction.status = CORRECTION_REJECTED
    correction.decided_by_id = user.id
    correction.decided_at = datetime.now(timezone.utc)
    correction.decision_note = data.note.strip() or None
    audit.record(db, user, "correction.rejected", "delivery", correction.delivery_id,
                 f"Rejected the correction request for {receipt_no(correction.delivery_id)}. The current value stays.")
    db.commit()
    db.refresh(correction)
    return _out(db, correction)
