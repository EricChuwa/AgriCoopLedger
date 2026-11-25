"""Payment batches (FR 10). A Payment Officer plans a round of payments as a batch: some farmers and an amount
for each, at most what they are owed. A Manager approves or rejects it, and never the person who made it (BR 10).
Only then can the Payment Officer record the payments against it, each one checked like any other payment (FR 5.3).
Whether a batch is part paid or paid is worked out from its live payments, never stored."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import require_role
from app.helpers import conflict, get_in_coop, invalid
from app.models import (
    BATCH_APPROVED, BATCH_REJECTED, BATCH_SUBMITTED, ROLE_MANAGER, ROLE_PAYMENT_OFFICER,
    BatchLine, Farmer, Payment, PaymentBatch, User,
)
from app.routers.payments import batch_no, record_payment_core
from app.schemas import BatchDetail, BatchIn, BatchLineOut, BatchOut, PaymentIn, PaymentOut, Reason
from app.services import balance_of, fmt_rwf

router = APIRouter(prefix="/api/batches", tags=["batches"])

STAFF = (ROLE_MANAGER, ROLE_PAYMENT_OFFICER)


def _paid(db: Session, batch_ids: list[int]) -> dict[tuple[int, int], int]:
    """Live payments recorded against each (batch, farmer)."""
    if not batch_ids:
        return {}
    rows = db.execute(
        select(Payment.batch_id, Payment.farmer_id, func.sum(Payment.amount))
        .where(Payment.batch_id.in_(batch_ids), Payment.voided_at.is_(None))
        .group_by(Payment.batch_id, Payment.farmer_id)).all()
    return {(b, f): int(t) for b, f, t in rows}


def _line_status(planned: int, paid: int) -> str:
    return "paid" if paid >= planned else "part_paid" if paid > 0 else "unpaid"


def _status(batch: PaymentBatch, paid: dict[tuple[int, int], int]) -> str:
    if batch.status != BATCH_APPROVED:
        return batch.status
    totals = [paid.get((batch.id, ln.farmer_id), 0) for ln in batch.lines]
    if batch.lines and all(t >= ln.amount for t, ln in zip(totals, batch.lines)):
        return "paid"
    return "part_paid" if any(totals) else BATCH_APPROVED


def _out(batch: PaymentBatch, paid: dict[tuple[int, int], int], detail: bool = False):
    fields = dict(
        id=batch.id, number=batch_no(batch.id), status=_status(batch, paid), note=batch.note,
        created_by=batch.created_by.full_name, created_at=batch.created_at,
        decided_by=batch.decided_by.full_name if batch.decided_by else None, decided_at=batch.decided_at,
        decision_note=batch.decision_note, farmers=len(batch.lines),
        planned=sum(ln.amount for ln in batch.lines),
        paid=sum(min(paid.get((batch.id, ln.farmer_id), 0), ln.amount) for ln in batch.lines),
    )
    if not detail:
        return BatchOut(**fields)
    lines = []
    for ln in batch.lines:
        got = paid.get((batch.id, ln.farmer_id), 0)
        lines.append(BatchLineOut(
            farmer_id=ln.farmer_id, farmer_name=ln.farmer.full_name, planned=ln.amount, paid=got,
            remaining=max(ln.amount - got, 0), status=_line_status(ln.amount, got)))
    return BatchDetail(**fields, lines=lines)


def _load(db: Session, batch_id: int, user: User) -> PaymentBatch:
    get_in_coop(db, PaymentBatch, batch_id, user, "Batch")
    return db.scalars(select(PaymentBatch).where(PaymentBatch.id == batch_id).options(
        selectinload(PaymentBatch.lines).selectinload(BatchLine.farmer),
        selectinload(PaymentBatch.created_by), selectinload(PaymentBatch.decided_by))).one()


@router.get("", response_model=list[BatchOut])
def list_batches(user: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    batches = db.scalars(
        select(PaymentBatch).where(PaymentBatch.cooperative_id == user.cooperative_id)
        .options(selectinload(PaymentBatch.lines), selectinload(PaymentBatch.created_by),
                 selectinload(PaymentBatch.decided_by))
        .order_by(PaymentBatch.id.desc())).all()
    paid = _paid(db, [b.id for b in batches])
    return [_out(b, paid) for b in batches]


@router.get("/{batch_id}", response_model=BatchDetail)
def get_batch(batch_id: int, user: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    batch = _load(db, batch_id, user)
    return _out(batch, _paid(db, [batch.id]), detail=True)


@router.post("", response_model=BatchDetail, status_code=201)
def create_batch(data: BatchIn, user: User = Depends(require_role(ROLE_PAYMENT_OFFICER)), db: Session = Depends(get_db)):
    audit.lock_cooperative(db, user.cooperative_id)  # the balances read below must not change underneath us
    ids = [ln.farmer_id for ln in data.lines]
    if len(set(ids)) != len(ids):
        raise invalid("A farmer can appear only once in a batch.", "lines")

    # Farmers already in a batch that is waiting or still has money to pay out.
    open_rows = db.execute(
        select(PaymentBatch.id, BatchLine.farmer_id, BatchLine.amount)
        .join(BatchLine, BatchLine.batch_id == PaymentBatch.id)
        .where(PaymentBatch.cooperative_id == user.cooperative_id,
               PaymentBatch.status.in_((BATCH_SUBMITTED, BATCH_APPROVED)), BatchLine.farmer_id.in_(ids))).all()
    paid = _paid(db, list({b for b, _, _ in open_rows}))
    in_open = {f: b for b, f, amount in open_rows if paid.get((b, f), 0) < amount}

    lines = []
    for item in data.lines:
        farmer = get_in_coop(db, Farmer, item.farmer_id, user, "Farmer")
        if not farmer.is_active:  # BR 6
            raise conflict(f"{farmer.full_name} is inactive and cannot be paid.", "lines")
        if farmer.id in in_open:
            raise conflict(f"{farmer.full_name} is already in batch {batch_no(in_open[farmer.id])}.", "lines")
        owed = balance_of(db, farmer.id)
        if owed <= 0:
            raise conflict(f"Nothing is owed to {farmer.full_name}.", "lines")
        if item.amount > owed:
            raise conflict(f"{farmer.full_name} is owed {fmt_rwf(owed)}. A batch cannot plan more than that.", "lines")
        lines.append(BatchLine(farmer_id=farmer.id, amount=item.amount))

    batch = PaymentBatch(cooperative_id=user.cooperative_id, created_by_id=user.id, note=data.note, lines=lines)
    db.add(batch)
    db.flush()
    audit.record(db, user, "batch.submitted", "batch", batch.id,
                 f"Submitted {batch_no(batch.id)}: {len(lines)} farmers, {fmt_rwf(sum(ln.amount for ln in lines))} "
                 f"planned. A Manager must approve it.")
    db.commit()
    batch = _load(db, batch.id, user)
    return _out(batch, {}, detail=True)


def _decide(db: Session, user: User, batch_id: int, status: str, note: str | None) -> BatchDetail:
    audit.lock_cooperative(db, user.cooperative_id)
    batch = _load(db, batch_id, user)
    if batch.status != BATCH_SUBMITTED:
        raise conflict(f"{batch_no(batch.id)} has already been decided.")
    if batch.created_by_id == user.id:  # the person who decides is never the person who made it (BR 10)
        raise conflict("You made this batch, so another Manager must decide on it.")
    batch.status = status
    batch.decided_by_id, batch.decided_at, batch.decision_note = user.id, datetime.now(timezone.utc), note
    if status == BATCH_APPROVED:
        audit.record(db, user, "batch.approved", "batch", batch.id,
                     f"Approved {batch_no(batch.id)} ({fmt_rwf(sum(ln.amount for ln in batch.lines))} planned).")
    else:
        audit.record(db, user, "batch.rejected", "batch", batch.id,
                     f"Declined {batch_no(batch.id)}. Reason: {note}")
    db.commit()
    batch = _load(db, batch.id, user)
    return _out(batch, _paid(db, [batch.id]), detail=True)


@router.post("/{batch_id}/approve", response_model=BatchDetail)
def approve_batch(batch_id: int, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)):
    return _decide(db, user, batch_id, BATCH_APPROVED, None)


@router.post("/{batch_id}/reject", response_model=BatchDetail)
def reject_batch(batch_id: int, data: Reason, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)):
    return _decide(db, user, batch_id, BATCH_REJECTED, data.reason)


@router.post("/{batch_id}/payments", response_model=PaymentOut, status_code=201)
def pay_in_batch(
    batch_id: int, data: PaymentIn, user: User = Depends(require_role(ROLE_PAYMENT_OFFICER)),
    db: Session = Depends(get_db),
):
    get_in_coop(db, PaymentBatch, batch_id, user, "Batch")

    def check(farmer: Farmer) -> None:
        batch = db.scalars(select(PaymentBatch).where(PaymentBatch.id == batch_id)
                           .options(selectinload(PaymentBatch.lines))).one()
        if batch.status == BATCH_SUBMITTED:
            raise conflict(f"{batch_no(batch.id)} is waiting for a Manager's approval.", "farmer_id")
        if batch.status == BATCH_REJECTED:
            raise conflict(f"{batch_no(batch.id)} was declined, so nothing can be paid from it.", "farmer_id")
        line = next((ln for ln in batch.lines if ln.farmer_id == farmer.id), None)
        if line is None:
            raise conflict(f"{farmer.full_name} is not in {batch_no(batch.id)}.", "farmer_id")
        remaining = line.amount - _paid(db, [batch.id]).get((batch.id, farmer.id), 0)
        if remaining <= 0:
            raise conflict(f"{farmer.full_name} has already been paid in full in {batch_no(batch.id)}.", "amount")
        if data.amount > remaining:
            raise conflict(f"That is more than the {fmt_rwf(remaining)} still planned for {farmer.full_name} in "
                           f"{batch_no(batch.id)}. Enter {remaining:,} or less.", "amount")

    return record_payment_core(db, user, data, batch_id=batch_id, extra_check=check)
