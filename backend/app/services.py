"""Calculations the whole ledger depends on. Money is whole RWF and weight is whole grams,
so no floating point is ever involved in what a farmer is owed (BR 3, BR 4)."""

from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Delivery, Payment, Price

# Rwanda is UTC+2 all year, so a fixed offset avoids needing a timezone database.
KIGALI = timezone(timedelta(hours=2))


def today() -> date:
    return datetime.now(KIGALI).date()


def to_grams(kg: Decimal | float | int | str) -> int:
    """Kilograms to whole grams, rounded to the nearest gram. Raises ValueError if not a number."""
    try:
        grams = (Decimal(str(kg)) * 1000).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Enter the weight as a number of kilograms.") from exc
    return int(grams)


def kg_of(grams: int) -> float:
    return grams / 1000


def value_of(grams: int, price_per_kg: int) -> int:
    """Delivery value = weight x price, rounded half up to a whole franc (BR 3)."""
    return (grams * price_per_kg + 500) // 1000


def price_on(db: Session, produce_id: int, grade: str, on: date) -> Price | None:
    """The price in force for a produce type and grade on a date: the newest one that started on or before it."""
    return db.scalars(
        select(Price)
        .where(Price.produce_id == produce_id, Price.grade == grade, Price.effective_from <= on)
        .order_by(Price.effective_from.desc(), Price.id.desc())
        .limit(1)
    ).first()


def balance_of(db: Session, farmer_id: int) -> int:
    """What a farmer is owed: value of live deliveries minus live payments (FR 5.1, BR 4)."""
    delivered = db.scalar(
        select(func.coalesce(func.sum(Delivery.value), 0))
        .where(Delivery.farmer_id == farmer_id, Delivery.voided_at.is_(None))
    )
    paid = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.farmer_id == farmer_id, Payment.voided_at.is_(None))
    )
    return int(delivered) - int(paid)


def balances_for(db: Session, cooperative_id: int) -> dict[int, int]:
    """Balance owed for every farmer in a cooperative, in two queries."""
    delivered = dict(db.execute(
        select(Delivery.farmer_id, func.sum(Delivery.value))
        .where(Delivery.cooperative_id == cooperative_id, Delivery.voided_at.is_(None))
        .group_by(Delivery.farmer_id)
    ).all())
    paid = dict(db.execute(
        select(Payment.farmer_id, func.sum(Payment.amount))
        .where(Payment.cooperative_id == cooperative_id, Payment.voided_at.is_(None))
        .group_by(Payment.farmer_id)
    ).all())
    return {fid: int(delivered.get(fid, 0)) - int(paid.get(fid, 0)) for fid in set(delivered) | set(paid)}


def fmt_rwf(n: int) -> str:
    return f"{n:,} RWF"
