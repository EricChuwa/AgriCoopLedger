"""Statuses worked out from the records, never stored (like every balance). FR 4.9.

Status of a delivery: voided, disputed (an open dispute), correction_pending (a Clerk's request waits for a
Manager) or recorded.

Payment status of a delivery: a farmer's live payments are applied to their live deliveries oldest first. A
delivery fully covered is paid, partly covered is part_paid. Of the rest, the oldest ones that an open payment
batch (submitted or approved) still has money planned for are in_batch, and the others are unpaid.
"""

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    BATCH_APPROVED, BATCH_SUBMITTED, BatchLine, Delivery, Dispute, DISPUTE_OPEN, Payment, PaymentBatch,
)
from app.schemas import DeliveryOut, PaymentOut


def annotate_deliveries(db: Session, cooperative_id: int, outs: list[DeliveryOut]) -> list[DeliveryOut]:
    if not outs:
        return outs
    ids = [o.id for o in outs]
    farmer_ids = sorted({o.farmer_id for o in outs})

    disputed = set(db.scalars(select(Dispute.delivery_id).where(
        Dispute.cooperative_id == cooperative_id, Dispute.status == DISPUTE_OPEN, Dispute.delivery_id.in_(ids))).all())

    paid_total = {f: int(t) for f, t in db.execute(
        select(Payment.farmer_id, func.sum(Payment.amount))
        .where(Payment.cooperative_id == cooperative_id, Payment.farmer_id.in_(farmer_ids), Payment.voided_at.is_(None))
        .group_by(Payment.farmer_id)).all()}

    # Money still planned in open batches, per farmer: planned minus what was already paid against that batch.
    planned = defaultdict(int)
    lines = db.execute(
        select(BatchLine.batch_id, BatchLine.farmer_id, BatchLine.amount)
        .join(PaymentBatch, PaymentBatch.id == BatchLine.batch_id)
        .where(PaymentBatch.cooperative_id == cooperative_id, BatchLine.farmer_id.in_(farmer_ids),
               PaymentBatch.status.in_((BATCH_SUBMITTED, BATCH_APPROVED)))).all()
    if lines:
        batch_paid = {(b, f): int(t) for b, f, t in db.execute(
            select(Payment.batch_id, Payment.farmer_id, func.sum(Payment.amount))
            .where(Payment.batch_id.in_({b for b, _, _ in lines}), Payment.voided_at.is_(None))
            .group_by(Payment.batch_id, Payment.farmer_id)).all()}
        for b, f, amount in lines:
            planned[f] += max(amount - batch_paid.get((b, f), 0), 0)

    live = db.execute(
        select(Delivery.farmer_id, Delivery.id, Delivery.value)
        .where(Delivery.cooperative_id == cooperative_id, Delivery.farmer_id.in_(farmer_ids), Delivery.voided_at.is_(None))
        .order_by(Delivery.farmer_id, Delivery.delivery_date, Delivery.id)).all()
    pay_status: dict[int, str] = {}
    left_paid = dict(paid_total)
    left_planned = dict(planned)
    for farmer_id, delivery_id, value in live:
        covered = min(left_paid.get(farmer_id, 0), value)
        left_paid[farmer_id] = left_paid.get(farmer_id, 0) - covered
        if covered >= value:
            pay_status[delivery_id] = "paid"
        elif covered > 0:
            pay_status[delivery_id] = "part_paid"
        else:
            room = left_planned.get(farmer_id, 0)
            if room > 0:
                pay_status[delivery_id] = "in_batch"
                left_planned[farmer_id] = room - value
            else:
                pay_status[delivery_id] = "unpaid"

    for o in outs:
        if o.voided:
            o.status, o.payment_status = "voided", "none"
            continue
        o.status = "disputed" if o.id in disputed else "correction_pending" if o.pending_correction else "recorded"
        o.payment_status = pay_status.get(o.id, "unpaid")
    return outs


def annotate_payments(db: Session, cooperative_id: int, outs: list[PaymentOut]) -> list[PaymentOut]:
    if not outs:
        return outs
    ids = [o.id for o in outs]
    disputed = set(db.scalars(select(Dispute.payment_id).where(
        Dispute.cooperative_id == cooperative_id, Dispute.status == DISPUTE_OPEN, Dispute.payment_id.in_(ids))).all())
    for o in outs:
        o.disputed = o.id in disputed
    return outs
