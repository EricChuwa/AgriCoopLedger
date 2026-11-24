"""Payments (FR 5.2 to 5.5). Only a Payment Officer records one (BR 2); a Manager voids one with a reason
(BR 1, BR 5). A payment can never exceed what the farmer is owed (FR 5.3, BR 4)."""

import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import get_current_user, require_role
from app.helpers import conflict, get_in_coop, invalid, like
from app.models import ROLE_MANAGER, ROLE_PAYMENT_OFFICER, Farmer, Payment, User
from app.schemas import PaymentIn, PaymentOut, PaymentPage, Reason, VoidInfo
from app.services import balance_of, fmt_rwf, today

router = APIRouter(prefix="/api/payments", tags=["payments"])

METHOD_LABEL = {"cash": "cash", "momo": "mobile money"}


def receipt_no(payment_id: int) -> str:
    return f"P-{payment_id:06d}"


def payment_out(p: Payment) -> PaymentOut:
    return PaymentOut(
        id=p.id, receipt_no=receipt_no(p.id), farmer_id=p.farmer_id, farmer_name=p.farmer.full_name,
        amount=p.amount, method=p.method, reference=p.reference, payment_date=p.payment_date,
        recorded_by=p.recorded_by.full_name, created_at=p.created_at,
        voided=VoidInfo(by=p.voided_by.full_name, reason=p.void_reason or "", at=p.voided_at) if p.voided_at else None,
    )


@router.get("", response_model=PaymentPage)
def list_payments(
    farmer_id: int | None = None,
    method: str | None = Query(default=None, pattern="^(cash|momo)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    q: str = Query(default="", max_length=60, description="Farmer name, reference or receipt number"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    where = [Payment.cooperative_id == user.cooperative_id]
    if farmer_id is not None:
        where.append(Payment.farmer_id == farmer_id)
    if method:
        where.append(Payment.method == method)
    if date_from is not None:
        where.append(Payment.payment_date >= date_from)
    if date_to is not None:
        where.append(Payment.payment_date <= date_to)
    q = q.strip()
    if q:
        terms = [Payment.reference.ilike(like(q), escape="\\"), Payment.farmer_id.in_(select(Farmer.id).where(
            Farmer.cooperative_id == user.cooperative_id, Farmer.full_name.ilike(like(q), escape="\\")))]
        m = re.fullmatch(r"p-?0*([0-9]+)", q, re.IGNORECASE)
        if m:
            terms.append(Payment.id == int(m.group(1)))
        where.append(or_(*terms))

    total = db.scalar(select(func.count(Payment.id)).where(*where)) or 0
    live_count, live_amount = db.execute(
        select(func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0))
        .where(*where, Payment.voided_at.is_(None))).one()
    rows = db.scalars(
        select(Payment).where(*where)
        .options(selectinload(Payment.farmer), selectinload(Payment.recorded_by), selectinload(Payment.voided_by))
        .order_by(Payment.payment_date.desc(), Payment.id.desc())
        .offset((page - 1) * page_size).limit(page_size)).all()
    return PaymentPage(items=[payment_out(p) for p in rows], total=total, page=page, page_size=page_size,
                       live_count=live_count, live_amount=int(live_amount))


@router.post("", response_model=PaymentOut, status_code=201)
def record_payment(
    data: PaymentIn, user: User = Depends(require_role(ROLE_PAYMENT_OFFICER)), db: Session = Depends(get_db)
):
    # Lock first, then look at anything. Two payments for the same farmer would otherwise both read the same
    # balance and both pass the overpayment check (BR 4). A repeat submission that waited here finds the
    # first one already saved and gets it back.
    audit.lock_cooperative(db, user.cooperative_id)
    if data.client_id:  # a repeat of an earlier submission: return that record, record nothing new
        again = db.scalar(select(Payment).where(
            Payment.cooperative_id == user.cooperative_id, Payment.client_id == data.client_id))
        if again:
            return payment_out(again)
    farmer = get_in_coop(db, Farmer, data.farmer_id, user, "Farmer")
    if not farmer.is_active:  # BR 6
        raise conflict(f"{farmer.full_name} is inactive. Reactivate the farmer before recording a payment.", "farmer_id")
    when = data.payment_date or today()
    if when > today():
        raise invalid("The date cannot be in the future.", "payment_date")

    balance = balance_of(db, farmer.id)
    if balance <= 0:
        raise conflict(f"Nothing is owed to {farmer.full_name}.", "amount")
    if data.amount > balance:
        raise conflict(
            f"That is more than the {fmt_rwf(balance)} owed. Enter {balance:,} or less.", "amount")
    if data.reference:
        used = db.scalar(select(func.count(Payment.id)).where(
            Payment.cooperative_id == user.cooperative_id, Payment.voided_at.is_(None),
            func.lower(Payment.reference) == data.reference.lower()))
        if used:
            raise conflict("This reference was already used for another payment.", "reference")

    payment = Payment(
        cooperative_id=user.cooperative_id, farmer_id=farmer.id, amount=data.amount, method=data.method,
        reference=data.reference, payment_date=when, recorded_by_id=user.id,
        client_id=data.client_id,
    )
    db.add(payment)
    db.flush()
    audit.record(db, user, "payment.recorded", "payment", payment.id,
                 f"Recorded {receipt_no(payment.id)}: paid {fmt_rwf(payment.amount)} to {farmer.full_name} "
                 f"({METHOD_LABEL[payment.method]}).")
    try:
        db.commit()
    except IntegrityError:  # two identical submissions raced: the other one won, return it
        db.rollback()
        again = db.scalar(select(Payment).where(
            Payment.cooperative_id == user.cooperative_id, Payment.client_id == data.client_id))
        if again is None:
            raise
        return payment_out(again)
    db.refresh(payment)
    return payment_out(payment)


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return payment_out(get_in_coop(db, Payment, payment_id, user, "Payment"))


@router.post("/{payment_id}/void", response_model=PaymentOut)
def void_payment(
    payment_id: int, data: Reason, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)
):
    payment = get_in_coop(db, Payment, payment_id, user, "Payment")
    if payment.voided_at:
        raise conflict("This payment is already voided.")
    payment.voided_at = datetime.now(timezone.utc)
    payment.voided_by_id = user.id
    payment.void_reason = data.reason
    audit.record(db, user, "payment.voided", "payment", payment.id,
                 f"Voided {receipt_no(payment.id)} ({fmt_rwf(payment.amount)} to {payment.farmer.full_name}). "
                 f"Reason: {data.reason}")
    db.commit()
    db.refresh(payment)
    return payment_out(payment)
