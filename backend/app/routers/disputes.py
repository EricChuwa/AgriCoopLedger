"""Disputes (FR 11). A challenge to one delivery or one payment. A Collection Clerk disputes a delivery, a Payment
Officer a payment, and a Manager either. A Manager decides: upheld (the challenge is right, and the Manager then
corrects or voids the record) or dismissed (the record stands). Deciding changes no amount by itself. Every step is
audited."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import get_current_user, require_role
from app.helpers import conflict, get_in_coop, invalid
from app.models import (
    DISPUTE_DISMISSED, DISPUTE_OPEN, DISPUTE_UPHELD, ROLE_CLERK, ROLE_MANAGER, ROLE_PAYMENT_OFFICER,
    Delivery, Dispute, Payment, User,
)
from app.routers.deliveries import receipt_no as delivery_no
from app.routers.payments import receipt_no as payment_no
from app.schemas import DisputeDecisionIn, DisputeIn, DisputeOut
from app.services import fmt_rwf, kg_of

router = APIRouter(prefix="/api/disputes", tags=["disputes"])

manager_only = require_role(ROLE_MANAGER)


def dispute_no(dispute_id: int) -> str:
    return f"X-{dispute_id:06d}"


def _out(d: Dispute) -> DisputeOut:
    if d.delivery_id:
        rec = d.delivery
        kind, rid, no = "delivery", rec.id, delivery_no(rec.id)
        summary = f"{kg_of(rec.weight_grams):g} kg {rec.produce.name}, grade {rec.grade}, {fmt_rwf(rec.value)}"
    else:
        rec = d.payment
        kind, rid, no = "payment", rec.id, payment_no(rec.id)
        summary = f"{fmt_rwf(rec.amount)} paid"
    return DisputeOut(
        id=d.id, number=dispute_no(d.id), kind=kind, record_id=rid, record_no=no, farmer_name=rec.farmer.full_name,
        summary=summary, status=d.status, reason=d.reason, raised_by=d.raised_by.full_name, created_at=d.created_at,
        decided_by=d.decided_by.full_name if d.decided_by else None, decided_at=d.decided_at,
        decision_note=d.decision_note)


def _load(db: Session, dispute_id: int, user: User) -> Dispute:
    return get_in_coop(db, Dispute, dispute_id, user, "Dispute")


@router.get("", response_model=list[DisputeOut])
def list_disputes(
    status: str | None = Query(default=None, pattern="^(open|upheld|dismissed)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A Manager sees every dispute. A Clerk or Payment Officer sees the ones they raised."""
    stmt = (
        select(Dispute).where(Dispute.cooperative_id == user.cooperative_id)
        .options(selectinload(Dispute.delivery).selectinload(Delivery.farmer),
                 selectinload(Dispute.delivery).selectinload(Delivery.produce),
                 selectinload(Dispute.payment).selectinload(Payment.farmer),
                 selectinload(Dispute.raised_by), selectinload(Dispute.decided_by))
        .order_by(Dispute.id.desc())
    )
    if user.role != ROLE_MANAGER:
        stmt = stmt.where(Dispute.raised_by_id == user.id)
    if status:
        stmt = stmt.where(Dispute.status == status)
    return [_out(d) for d in db.scalars(stmt).all()]


@router.post("", response_model=DisputeOut, status_code=201)
def raise_dispute(data: DisputeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if (data.delivery_id is None) == (data.payment_id is None):
        raise invalid("Choose one delivery or one payment to dispute.")
    if data.delivery_id is not None:
        if user.role not in (ROLE_CLERK, ROLE_MANAGER):
            raise conflict("Only a Collection Clerk or a Manager can dispute a delivery.")
        rec = get_in_coop(db, Delivery, data.delivery_id, user, "Delivery")
        label, no, column = "delivery", delivery_no(rec.id), Dispute.delivery_id
    else:
        if user.role not in (ROLE_PAYMENT_OFFICER, ROLE_MANAGER):
            raise conflict("Only a Payment Officer or a Manager can dispute a payment.")
        rec = get_in_coop(db, Payment, data.payment_id, user, "Payment")
        label, no, column = "payment", payment_no(rec.id), Dispute.payment_id
    if rec.voided_at:
        raise conflict(f"This {label} is voided and cannot be disputed.")
    if db.scalar(select(Dispute.id).where(column == rec.id, Dispute.status == DISPUTE_OPEN)):
        raise conflict(f"A dispute for this {label} is already open.")
    dispute = Dispute(
        cooperative_id=user.cooperative_id, delivery_id=data.delivery_id, payment_id=data.payment_id,
        raised_by_id=user.id, reason=data.reason, status=DISPUTE_OPEN)
    db.add(dispute)
    db.flush()
    audit.record(db, user, "dispute.raised", label, rec.id, f"Raised dispute {dispute_no(dispute.id)} on {no}. Reason: {data.reason}")
    db.commit()
    db.refresh(dispute)
    return _out(dispute)


def _decide(db: Session, user: User, dispute_id: int, data: DisputeDecisionIn, outcome: str) -> DisputeOut:
    dispute = _load(db, dispute_id, user)
    if dispute.status != DISPUTE_OPEN:
        raise conflict("This dispute has already been decided.")
    dispute.status = outcome
    dispute.decided_by_id = user.id
    dispute.decided_at = datetime.now(timezone.utc)
    dispute.decision_note = data.note
    label = "delivery" if dispute.delivery_id else "payment"
    rec_id = dispute.delivery_id or dispute.payment_id
    no = delivery_no(rec_id) if dispute.delivery_id else payment_no(rec_id)
    tail = "The record stands." if outcome == DISPUTE_DISMISSED else "Correct or void the record to fix it."
    audit.record(db, user, f"dispute.{outcome}", label, rec_id,
                 f"{outcome.capitalize()} dispute {dispute_no(dispute.id)} on {no}. {tail} Note: {data.note}")
    db.commit()
    db.refresh(dispute)
    return _out(dispute)


@router.post("/{dispute_id}/uphold", response_model=DisputeOut)
def uphold(dispute_id: int, data: DisputeDecisionIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    return _decide(db, user, dispute_id, data, DISPUTE_UPHELD)


@router.post("/{dispute_id}/dismiss", response_model=DisputeOut)
def dismiss(dispute_id: int, data: DisputeDecisionIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    return _decide(db, user, dispute_id, data, DISPUTE_DISMISSED)
