"""Produce deliveries (FR 4.1 to 4.5). Only a Collection Clerk records one (BR 2). A Manager corrects or voids
one with a reason (BR 1, BR 5). Nothing is ever deleted (NFR 7)."""

import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import get_current_user, require_role
from app.helpers import conflict, get_in_coop, invalid, like
from app.models import (
    CORRECTION_APPROVED, CORRECTION_DIRECT, CORRECTION_PENDING, ROLE_CLERK, ROLE_MANAGER,
    Correction, Delivery, Farmer, ProduceType, User,
)
from app.schemas import CorrectIn, DeliveryIn, DeliveryOut, DeliveryPage, Reason, VoidInfo
from app.statuses import annotate_deliveries
from app.services import balance_of, fmt_rwf, kg_of, price_on, to_grams, today, value_of

router = APIRouter(prefix="/api/deliveries", tags=["deliveries"])


def receipt_no(delivery_id: int) -> str:
    return f"D-{delivery_id:06d}"


def delivery_out(d: Delivery, corrected: bool, pending: bool) -> DeliveryOut:
    return DeliveryOut(
        id=d.id, receipt_no=receipt_no(d.id), farmer_id=d.farmer_id, farmer_name=d.farmer.full_name,
        produce_id=d.produce_id, produce_name=d.produce.name, grade=d.grade, weight_kg=kg_of(d.weight_grams),
        price_per_kg=d.price_per_kg, value=d.value, delivery_date=d.delivery_date,
        recorded_by=d.recorded_by.full_name, created_at=d.created_at,
        voided=VoidInfo(by=d.voided_by.full_name, reason=d.void_reason or "", at=d.voided_at) if d.voided_at else None,
        corrected=corrected, pending_correction=pending,
    )


def _flags(db: Session, cooperative_id: int, delivery_ids: list[int] | None = None) -> tuple[set[int], set[int]]:
    stmt = select(Correction.delivery_id, Correction.status).where(Correction.cooperative_id == cooperative_id)
    if delivery_ids is not None:
        stmt = stmt.where(Correction.delivery_id.in_(delivery_ids))
    rows = db.execute(stmt).all()
    corrected = {i for i, s in rows if s in (CORRECTION_DIRECT, CORRECTION_APPROVED)}
    pending = {i for i, s in rows if s == CORRECTION_PENDING}
    return corrected, pending


def _one(db: Session, d: Delivery) -> DeliveryOut:
    corrected, pending = _flags(db, d.cooperative_id, [d.id])
    return annotate_deliveries(db, d.cooperative_id, [delivery_out(d, d.id in corrected, d.id in pending)])[0]


def _check_date(value: date | None, field: str) -> date:
    value = value or today()
    if value > today():
        raise invalid("The date cannot be in the future.", field)
    return value


def _receipt_id(q: str, letter: str) -> int | None:
    m = re.fullmatch(rf"{letter}-?0*([0-9]+)", q.strip(), re.IGNORECASE)
    return int(m.group(1)) if m else None


@router.get("", response_model=DeliveryPage)
def list_deliveries(
    farmer_id: int | None = None,
    produce_id: int | None = None,
    grade: str | None = Query(default=None, pattern="^[ABC]$"),
    date_from: date | None = None,
    date_to: date | None = None,
    q: str = Query(default="", max_length=60, description="Farmer name or receipt number"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One page of deliveries, newest first, filtered on the server. The live_* figures cover every page of
    the filter, not just this one."""
    where = [Delivery.cooperative_id == user.cooperative_id]
    if farmer_id is not None:
        where.append(Delivery.farmer_id == farmer_id)
    if produce_id is not None:
        where.append(Delivery.produce_id == produce_id)
    if grade:
        where.append(Delivery.grade == grade)
    if date_from is not None:
        where.append(Delivery.delivery_date >= date_from)
    if date_to is not None:
        where.append(Delivery.delivery_date <= date_to)
    q = q.strip()
    if q:
        terms = [Delivery.farmer_id.in_(select(Farmer.id).where(
            Farmer.cooperative_id == user.cooperative_id, Farmer.full_name.ilike(like(q), escape="\\")))]
        rid = _receipt_id(q, "D")
        if rid is not None:
            terms.append(Delivery.id == rid)
        where.append(or_(*terms))

    total = db.scalar(select(func.count(Delivery.id)).where(*where)) or 0
    live_count, live_grams, live_value = db.execute(
        select(func.count(Delivery.id), func.coalesce(func.sum(Delivery.weight_grams), 0),
               func.coalesce(func.sum(Delivery.value), 0)).where(*where, Delivery.voided_at.is_(None))).one()
    rows = db.scalars(
        select(Delivery).where(*where)
        .options(selectinload(Delivery.farmer), selectinload(Delivery.produce),
                 selectinload(Delivery.recorded_by), selectinload(Delivery.voided_by))
        .order_by(Delivery.delivery_date.desc(), Delivery.id.desc())
        .offset((page - 1) * page_size).limit(page_size)).all()
    corrected, pending = _flags(db, user.cooperative_id, [d.id for d in rows])
    return DeliveryPage(
        items=annotate_deliveries(db, user.cooperative_id,
                                  [delivery_out(d, d.id in corrected, d.id in pending) for d in rows]),
        total=total, page=page, page_size=page_size,
        live_count=live_count, live_kg=kg_of(int(live_grams)), live_value=int(live_value))


@router.post("", response_model=DeliveryOut, status_code=201)
def record_delivery(data: DeliveryIn, user: User = Depends(require_role(ROLE_CLERK)), db: Session = Depends(get_db)):
    if data.client_id:  # a repeat of an earlier submission: return that record, record nothing new
        again = db.scalar(select(Delivery).where(
            Delivery.cooperative_id == user.cooperative_id, Delivery.client_id == data.client_id))
        if again:
            return _one(db, again)
    farmer = get_in_coop(db, Farmer, data.farmer_id, user, "Farmer")
    produce = get_in_coop(db, ProduceType, data.produce_id, user, "Produce")
    if not farmer.is_active:  # BR 6
        raise conflict(f"{farmer.full_name} is inactive. Reactivate the farmer before recording a delivery.", "farmer_id")
    if not produce.is_active:
        raise conflict(f"{produce.name} is not in use.", "produce_id")
    when = _check_date(data.delivery_date, "delivery_date")
    price = price_on(db, produce.id, data.grade, when)
    if price is None:
        raise conflict(f"No price is set for {produce.name} Grade {data.grade} on {when.isoformat()}.", "grade")

    grams = to_grams(data.weight_kg)
    delivery = Delivery(
        cooperative_id=user.cooperative_id, farmer_id=farmer.id, produce_id=produce.id, grade=data.grade,
        weight_grams=grams, price_per_kg=price.price_per_kg, value=value_of(grams, price.price_per_kg),
        delivery_date=when, recorded_by_id=user.id, client_id=data.client_id,
    )
    db.add(delivery)
    db.flush()
    audit.record(db, user, "delivery.recorded", "delivery", delivery.id,
                 f"Recorded {receipt_no(delivery.id)}: {farmer.full_name} delivered {kg_of(grams):g} kg "
                 f"{produce.name} Grade {data.grade}, worth {fmt_rwf(delivery.value)}.")
    try:
        db.commit()
    except IntegrityError:  # two identical submissions raced: the other one won, return it
        db.rollback()
        again = db.scalar(select(Delivery).where(
            Delivery.cooperative_id == user.cooperative_id, Delivery.client_id == data.client_id))
        if again is None:
            raise
        return _one(db, again)
    db.refresh(delivery)
    return _one(db, delivery)


@router.get("/{delivery_id}", response_model=DeliveryOut)
def get_delivery(delivery_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _one(db, get_in_coop(db, Delivery, delivery_id, user, "Delivery"))


def apply_correction(
    db: Session, actor: User, delivery: Delivery, new_grams: int | None, new_grade: str | None,
    correction: Correction,
) -> None:
    """Change a delivery's weight and/or grade, recalculating its value from the price in force on its date.
    The old values stay on the correction record (FR 4.4). Raises 409 if the change is not allowed."""
    if delivery.voided_at:
        raise conflict("This delivery is voided and cannot be corrected.")
    grams = new_grams if new_grams is not None else delivery.weight_grams
    grade = new_grade or delivery.grade
    if grams == delivery.weight_grams and grade == delivery.grade:
        raise conflict("Nothing would change. Enter a different weight or grade.")
    if grade == delivery.grade:
        # Same grade: keep the price the delivery was recorded under (BR 3). A price added later must not
        # quietly change a delivery just because its weight was fixed.
        price_per_kg = delivery.price_per_kg
    else:
        price = price_on(db, delivery.produce_id, grade, delivery.delivery_date)
        if price is None:
            raise conflict(f"No price is set for Grade {grade} on {delivery.delivery_date.isoformat()}.", "grade")
        price_per_kg = price.price_per_kg
    new_value = value_of(grams, price_per_kg)
    after = balance_of(db, delivery.farmer_id) - delivery.value + new_value
    if after < 0:
        raise conflict(
            f"This change would leave {delivery.farmer.full_name} overpaid by {fmt_rwf(-after)}. Void a payment first.")

    correction.old_weight_grams, correction.old_grade, correction.old_value = delivery.weight_grams, delivery.grade, delivery.value
    delivery.weight_grams, delivery.grade = grams, grade
    delivery.price_per_kg, delivery.value = price_per_kg, new_value
    correction.applied_weight_grams, correction.applied_grade, correction.applied_value = grams, grade, new_value
    audit.record(
        db, actor, "delivery.corrected", "delivery", delivery.id,
        f"Corrected {receipt_no(delivery.id)}: {kg_of(correction.old_weight_grams):g} kg Grade {correction.old_grade} "
        f"({fmt_rwf(correction.old_value)}) to {kg_of(grams):g} kg Grade {grade} ({fmt_rwf(new_value)}). "
        f"Reason: {correction.reason}",
    )


@router.post("/{delivery_id}/correct", response_model=DeliveryOut)
def correct_delivery(
    delivery_id: int, data: CorrectIn, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)
):
    """A Manager corrects a delivery directly, with a reason."""
    audit.lock_cooperative(db, user.cooperative_id)  # the balance check below must see every committed payment
    delivery = get_in_coop(db, Delivery, delivery_id, user, "Delivery")
    if data.weight_kg is None and data.grade is None:
        raise invalid("Enter a new weight or a new grade.")
    correction = Correction(
        cooperative_id=user.cooperative_id, delivery_id=delivery.id, requested_by_id=user.id,
        new_weight_grams=to_grams(data.weight_kg) if data.weight_kg is not None else None,
        new_grade=data.grade, reason=data.reason, status=CORRECTION_DIRECT,
        decided_by_id=user.id, decided_at=datetime.now(timezone.utc),
    )
    db.add(correction)
    apply_correction(db, user, delivery, correction.new_weight_grams, correction.new_grade, correction)
    db.commit()
    db.refresh(delivery)
    return _one(db, delivery)


@router.post("/{delivery_id}/void", response_model=DeliveryOut)
def void_delivery(
    delivery_id: int, data: Reason, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)
):
    audit.lock_cooperative(db, user.cooperative_id)  # the balance check below must see every committed payment
    delivery = get_in_coop(db, Delivery, delivery_id, user, "Delivery")
    if delivery.voided_at:
        raise conflict("This delivery is already voided.")
    after = balance_of(db, delivery.farmer_id) - delivery.value
    if after < 0:
        raise conflict(
            f"Voiding this delivery would leave {delivery.farmer.full_name} overpaid by {fmt_rwf(-after)}. "
            "Void a payment first.")
    delivery.voided_at = datetime.now(timezone.utc)
    delivery.voided_by_id = user.id
    delivery.void_reason = data.reason
    audit.record(db, user, "delivery.voided", "delivery", delivery.id,
                 f"Voided {receipt_no(delivery.id)} ({fmt_rwf(delivery.value)} for {delivery.farmer.full_name}). "
                 f"Reason: {data.reason}")
    db.commit()
    db.refresh(delivery)
    return _one(db, delivery)
