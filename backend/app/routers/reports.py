"""Everything that adds up the ledger on the server, so the browser never has to download every delivery:
the dashboard, a farmer's statement (FR 6.2) and the period summary (FR 6.1)."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user, require_role
from app.helpers import get_in_coop
from app.models import (
    CORRECTION_PENDING, ROLE_MANAGER, ROLE_PAYMENT_OFFICER, Correction, Delivery, Farmer, Payment, ProduceType, User,
)
from app.routers.deliveries import _flags, delivery_out, receipt_no as delivery_receipt
from app.routers.payments import METHOD_LABEL, payment_out, receipt_no as payment_receipt
from app.schemas import (
    DashboardOut, LargestBalance, ProduceMixOut, ProduceShare, StatementOut, StatementRow, SummaryFarmerRow, SummaryOut, SummaryProduceRow, WeekDay,
)
from app.services import balances_for, kg_of, today

router = APIRouter(tags=["reports"])

LIVE_D = Delivery.voided_at.is_(None)
LIVE_P = Payment.voided_at.is_(None)


@router.get("/api/farmers/{farmer_id}/statement", response_model=StatementOut)
def statement(
    farmer_id: int, date_from: date | None = None, date_to: date | None = None,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Live deliveries and payments, oldest first, with a running balance. Entries before `date_from` are
    rolled into an opening balance. On the same day a delivery comes before a payment."""
    farmer = get_in_coop(db, Farmer, farmer_id, user, "Farmer")
    deliveries = db.scalars(select(Delivery).where(Delivery.farmer_id == farmer.id)
                            .options(selectinload(Delivery.produce))).all()
    payments = db.scalars(select(Payment).where(Payment.farmer_id == farmer.id)).all()

    entries = [
        dict(key=f"d{d.id}", date=d.delivery_date, kind=0, id=d.id, receipt=delivery_receipt(d.id),
             description=(f"Delivery {delivery_receipt(d.id)}: {kg_of(d.weight_grams):g} kg {d.produce.name.lower()}, "
                          f"grade {d.grade}, at {d.price_per_kg} RWF per kg"),
             owed=d.value, paid=0)
        for d in deliveries if d.voided_at is None
    ] + [
        dict(key=f"p{p.id}", date=p.payment_date, kind=1, id=p.id, receipt=payment_receipt(p.id),
             description=(f"Payment {payment_receipt(p.id)} ({METHOD_LABEL[p.method]})"
                          + (f", ref {p.reference}" if p.reference else "")),
             owed=0, paid=p.amount)
        for p in payments if p.voided_at is None
    ]
    entries.sort(key=lambda e: (e["date"], e["kind"], e["id"]))

    opening = sum(e["owed"] - e["paid"] for e in entries if date_from and e["date"] < date_from)
    balance = opening
    rows = []
    for e in entries:
        if (date_from and e["date"] < date_from) or (date_to and e["date"] > date_to):
            continue
        balance += e["owed"] - e["paid"]
        rows.append(StatementRow(**e, balance=balance))

    live_d = [d for d in deliveries if d.voided_at is None]
    live_p = [p for p in payments if p.voided_at is None]
    return StatementOut(
        rows=rows, opening=opening, balance=balance,
        voided_count=(len(deliveries) - len(live_d)) + (len(payments) - len(live_p)),
        show_opening=date_from is not None,
        delivered_kg=round(sum(d.weight_grams for d in live_d) / 1000, 3),
        delivered_value=sum(d.value for d in live_d),
        paid_total=sum(p.amount for p in live_p), payment_count=len(live_p),
    )


@router.get("/api/reports/summary", response_model=SummaryOut)
def summary(
    date_from: date | None = None, date_to: date | None = None, produce_id: int | None = None,
    user: User = Depends(require_role(ROLE_MANAGER, ROLE_PAYMENT_OFFICER)), db: Session = Depends(get_db),
):
    coop = user.cooperative_id
    d_where = [Delivery.cooperative_id == coop, LIVE_D]
    p_where = [Payment.cooperative_id == coop, LIVE_P]
    if date_from:
        d_where.append(Delivery.delivery_date >= date_from)
        p_where.append(Payment.payment_date >= date_from)
    if date_to:
        d_where.append(Delivery.delivery_date <= date_to)
        p_where.append(Payment.payment_date <= date_to)
    if produce_id is not None:
        d_where.append(Delivery.produce_id == produce_id)

    by_produce = []
    rows = db.execute(
        select(ProduceType.id, ProduceType.name, Delivery.grade, func.count(Delivery.id),
               func.sum(Delivery.weight_grams), func.sum(Delivery.value))
        .join(ProduceType, ProduceType.id == Delivery.produce_id).where(*d_where)
        .group_by(ProduceType.id, ProduceType.name, Delivery.grade)
        .order_by(ProduceType.name, Delivery.grade)).all()
    for pid, name, grade, count, grams, value in rows:
        by_produce.append(SummaryProduceRow(key=f"{pid}-{grade}", name=f"{name}, grade {grade}", count=count,
                                            kg=kg_of(int(grams)), value=int(value)))

    delivered = {fid: (int(g), int(v)) for fid, g, v in db.execute(
        select(Delivery.farmer_id, func.sum(Delivery.weight_grams), func.sum(Delivery.value))
        .where(*d_where).group_by(Delivery.farmer_id)).all()}
    paid = {fid: int(a) for fid, a in db.execute(
        select(Payment.farmer_id, func.sum(Payment.amount)).where(*p_where).group_by(Payment.farmer_id)).all()}
    balances = balances_for(db, coop)
    names = dict(db.execute(select(Farmer.id, Farmer.full_name).where(Farmer.cooperative_id == coop)).all())
    by_farmer = sorted((
        SummaryFarmerRow(id=fid, name=names[fid], kg=kg_of(delivered.get(fid, (0, 0))[0]),
                         delivered=delivered.get(fid, (0, 0))[1], paid=paid.get(fid, 0), owed_now=balances.get(fid, 0))
        for fid in set(delivered) | set(paid)), key=lambda r: r.name)

    return SummaryOut(
        deliveries=sum(r.count for r in by_produce), kg=round(sum(r.kg for r in by_produce), 3),
        delivered=sum(r.value for r in by_produce), paid=sum(paid.values()),
        by_produce=by_produce, by_farmer=by_farmer)


PERIOD_LABEL = {"week": "This week", "month": "This month", "last_month": "Last month",
                "quarter": "This quarter", "last_quarter": "Last quarter"}


def period_bounds(now: date, period: str) -> tuple[date, date]:
    """First and last day (inclusive) of a named period. The current ones end today. A week is the last 7 days."""
    if period == "week":
        return now - timedelta(days=6), now
    if period == "month":
        return now.replace(day=1), now
    if period == "last_month":
        end = now.replace(day=1) - timedelta(days=1)
        return end.replace(day=1), end
    q_start_month = 3 * ((now.month - 1) // 3) + 1
    q_start = now.replace(month=q_start_month, day=1)
    if period == "quarter":
        return q_start, now
    # last quarter: the three months before this quarter began
    end = q_start - timedelta(days=1)
    return end.replace(month=3 * ((end.month - 1) // 3) + 1, day=1), end


@router.get("/api/reports/produce-mix", response_model=ProduceMixOut)
def produce_mix(
    period: Literal["week", "month", "last_month", "quarter", "last_quarter"] = Query("week"),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    start, end = period_bounds(today(), period)
    rows = db.execute(
        select(ProduceType.name, func.sum(Delivery.weight_grams))
        .join(ProduceType, ProduceType.id == Delivery.produce_id)
        .where(Delivery.cooperative_id == user.cooperative_id, LIVE_D,
               Delivery.delivery_date >= start, Delivery.delivery_date <= end)
        .group_by(ProduceType.name).order_by(func.sum(Delivery.weight_grams).desc())).all()
    total = sum(int(g) for _, g in rows)
    return ProduceMixOut(period=period, label=PERIOD_LABEL[period], date_from=start, date_to=end,
                         total_kg=kg_of(total), items=[ProduceShare(name=n, kg=kg_of(int(g))) for n, g in rows[:5]])


@router.get("/api/dashboard", response_model=DashboardOut)
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    coop = user.cooperative_id
    now = today()
    week_start = now - timedelta(days=6)

    balances = balances_for(db, coop)
    owing = sorted(((fid, b) for fid, b in balances.items() if b > 0), key=lambda x: -x[1])
    names = dict(db.execute(select(Farmer.id, Farmer.full_name).where(Farmer.cooperative_id == coop)).all())

    per_day = dict(db.execute(
        select(Delivery.delivery_date, func.sum(Delivery.weight_grams))
        .where(Delivery.cooperative_id == coop, LIVE_D, Delivery.delivery_date >= week_start, Delivery.delivery_date <= now)
        .group_by(Delivery.delivery_date)).all())
    today_count = db.scalar(select(func.count(Delivery.id)).where(
        Delivery.cooperative_id == coop, LIVE_D, Delivery.delivery_date == now)) or 0
    paid_today = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.cooperative_id == coop, LIVE_P, Payment.payment_date == now)) or 0
    farmers_week = db.scalar(select(func.count(func.distinct(Delivery.farmer_id))).where(
        Delivery.cooperative_id == coop, LIVE_D, Delivery.delivery_date >= week_start, Delivery.delivery_date <= now)) or 0
    mix = db.execute(
        select(ProduceType.name, func.sum(Delivery.weight_grams))
        .join(ProduceType, ProduceType.id == Delivery.produce_id)
        .where(Delivery.cooperative_id == coop, LIVE_D, Delivery.delivery_date >= week_start, Delivery.delivery_date <= now)
        .group_by(ProduceType.name).order_by(func.sum(Delivery.weight_grams).desc()).limit(5)).all()
    pending = 0
    if user.role == ROLE_MANAGER:
        pending = db.scalar(select(func.count(Correction.id)).where(
            Correction.cooperative_id == coop, Correction.status == CORRECTION_PENDING)) or 0

    recent_d = db.scalars(
        select(Delivery).where(Delivery.cooperative_id == coop, LIVE_D)
        .options(selectinload(Delivery.farmer), selectinload(Delivery.produce), selectinload(Delivery.recorded_by),
                 selectinload(Delivery.voided_by))
        .order_by(Delivery.delivery_date.desc(), Delivery.id.desc()).limit(6)).all()
    recent_p = db.scalars(
        select(Payment).where(Payment.cooperative_id == coop, LIVE_P)
        .options(selectinload(Payment.farmer), selectinload(Payment.recorded_by), selectinload(Payment.voided_by))
        .order_by(Payment.payment_date.desc(), Payment.id.desc()).limit(5)).all()
    corrected, awaiting = _flags(db, coop)

    return DashboardOut(
        total_owed=sum(b for _, b in owing), farmers_owed=len(owing),
        delivered_today_kg=kg_of(int(per_day.get(now, 0))), deliveries_today=today_count, paid_today=int(paid_today),
        farmers_this_week=farmers_week, pending_corrections=pending,
        week=[WeekDay(date=week_start + timedelta(days=i), kg=kg_of(int(per_day.get(week_start + timedelta(days=i), 0))))
              for i in range(7)],
        produce_week=[ProduceShare(name=n, kg=kg_of(int(g))) for n, g in mix],
        largest_balances=[LargestBalance(id=fid, name=names[fid], owed=b) for fid, b in owing[:5]],
        recent_deliveries=[delivery_out(d, d.id in corrected, d.id in awaiting) for d in recent_d],
        recent_payments=[payment_out(p) for p in recent_p],
    )
