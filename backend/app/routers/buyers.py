"""The buyer side (FR 12). Buying is the Clerk's business: a Clerk turns a buyer's request into a sale (or
declines it), records a sale made at the counter, and records each payment a buyer makes. A Payment Officer
confirms or rejects every buyer payment, and only confirmed payments count. A Manager reads everything and
changes nothing here (BR 11). Stock is what the cooperative received minus what it has sold, so a sale can never
be larger than what is on hand."""

from collections import defaultdict
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import get_current_user, require_role
from app.helpers import conflict, get_in_coop, invalid, like
from app.routers.produce import current_selling_price
from app.models import (
    BUYER_PAY_CONFIRMED, BUYER_PAY_PENDING, BUYER_PAY_REJECTED, ORDER_ACCEPTED, ORDER_DECLINED, ORDER_REQUESTED,
    ROLE_CLERK, ROLE_PAYMENT_OFFICER, BuyerOrder, BuyerPayment, Delivery, Payment, ProduceType, Sale, User,
)
from app.schemas import (
    AcceptOrderIn, BuyerPaymentIn, BuyerPaymentOut, DisputeDecisionIn, OptionalNoteIn, OrderOut, Reason, SaleIn, SaleOut,
    SalesSummaryOut, StockLineOut, VoidInfo,
)
from app.services import fmt_rwf, kg_of, to_grams, today, value_of

router = APIRouter(prefix="/api", tags=["buyers"])

clerk_only = require_role(ROLE_CLERK)
officer_only = require_role(ROLE_PAYMENT_OFFICER)


def order_no(i: int) -> str:
    return f"O-{i:06d}"


def sale_no(i: int) -> str:
    return f"S-{i:06d}"


def buyer_pay_no(i: int) -> str:
    return f"R-{i:06d}"


# ---------- stock ----------

def stock_grams(db: Session, cooperative_id: int | None = None) -> dict[tuple[int, int, str], int]:
    """Grams on hand per (cooperative, produce, grade): live deliveries minus live sales."""
    def sums(model, col):
        stmt = select(model.cooperative_id, model.produce_id, model.grade, func.sum(col)).where(
            model.voided_at.is_(None)).group_by(model.cooperative_id, model.produce_id, model.grade)
        if cooperative_id is not None:
            stmt = stmt.where(model.cooperative_id == cooperative_id)
        return {(c, p, g): int(t) for c, p, g, t in db.execute(stmt).all()}

    received, sold = sums(Delivery, Delivery.weight_grams), sums(Sale, Sale.weight_grams)
    return {k: received[k] - sold.get(k, 0) for k in received}


def _on_hand(db: Session, cooperative_id: int, produce_id: int, grade: str) -> int:
    return stock_grams(db, cooperative_id).get((cooperative_id, produce_id, grade), 0)


# ---------- output ----------

def sale_outs(db: Session, sales: list[Sale]) -> list[SaleOut]:
    if not sales:
        return []
    rows = db.execute(
        select(BuyerPayment.sale_id, BuyerPayment.status, func.sum(BuyerPayment.amount))
        .where(BuyerPayment.sale_id.in_([s.id for s in sales]))
        .group_by(BuyerPayment.sale_id, BuyerPayment.status)).all()
    by_sale: dict[int, dict[str, int]] = defaultdict(dict)
    for sid, status, total in rows:
        by_sale[sid][status] = int(total)
    out = []
    for s in sales:
        got = by_sale.get(s.id, {})
        confirmed, pending = got.get(BUYER_PAY_CONFIRMED, 0), got.get(BUYER_PAY_PENDING, 0)
        if s.voided_at:
            status = "voided"
        else:
            status = "paid" if confirmed >= s.value else "part_paid" if confirmed > 0 else "unpaid"
        out.append(SaleOut(
            id=s.id, number=sale_no(s.id), order_no=order_no(s.order_id) if s.order_id else None,
            buyer_name=s.buyer_name, buyer_phone=s.buyer_phone, produce_name=s.produce.name, grade=s.grade,
            weight_kg=kg_of(s.weight_grams), price_per_kg=s.price_per_kg, value=s.value, sale_date=s.sale_date,
            recorded_by=s.recorded_by.full_name, created_at=s.created_at, confirmed=confirmed, pending=pending,
            owed=s.value - confirmed if not s.voided_at else 0, status=status,
            voided=VoidInfo(by=s.voided_by.full_name, reason=s.void_reason or "", at=s.voided_at) if s.voided_at else None))
    return out


def payment_out(p: BuyerPayment) -> BuyerPaymentOut:
    return BuyerPaymentOut(
        id=p.id, number=buyer_pay_no(p.id), sale_id=p.sale_id, sale_no=sale_no(p.sale_id), buyer_name=p.sale.buyer_name,
        amount=p.amount, method=p.method, reference=p.reference, payment_date=p.payment_date, status=p.status,
        recorded_by=p.recorded_by.full_name, created_at=p.created_at,
        decided_by=p.decided_by.full_name if p.decided_by else None, decided_at=p.decided_at,
        decision_note=p.decision_note)


def _order_out(o: BuyerOrder, sale: Sale | None = None) -> OrderOut:
    return OrderOut(
        id=o.id, number=order_no(o.id), status=o.status, buyer_name=o.buyer_name, buyer_phone=o.buyer_phone,
        produce_id=o.produce_id, produce_name=o.produce.name, grade=o.grade, weight_kg=kg_of(o.weight_grams),
        note=o.note or "", created_at=o.created_at, handled_by=o.handled_by.full_name if o.handled_by else None,
        handled_at=o.handled_at, decline_reason=o.decline_reason,
        sale_id=sale.id if sale else None, sale_no=sale_no(sale.id) if sale else None)


def _sale_with(db: Session, sale_id: int) -> Sale:
    return db.scalar(select(Sale).where(Sale.id == sale_id).options(
        selectinload(Sale.produce), selectinload(Sale.recorded_by), selectinload(Sale.voided_by)))


# ---------- orders ----------

@router.get("/orders", response_model=list[OrderOut])
def list_orders(
    status: str | None = Query(default=None, pattern="^(requested|accepted|declined)$"),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if user.role == ROLE_PAYMENT_OFFICER:
        raise_forbidden()
    stmt = select(BuyerOrder).where(BuyerOrder.cooperative_id == user.cooperative_id).options(
        selectinload(BuyerOrder.produce), selectinload(BuyerOrder.handled_by)).order_by(BuyerOrder.id.desc())
    if status:
        stmt = stmt.where(BuyerOrder.status == status)
    orders = db.scalars(stmt.limit(300)).all()
    sales = {s.order_id: s for s in db.scalars(select(Sale).where(
        Sale.cooperative_id == user.cooperative_id, Sale.order_id.in_([o.id for o in orders] or [0])))}
    return [_order_out(o, sales.get(o.id)) for o in orders]


def raise_forbidden():
    from fastapi import HTTPException
    raise HTTPException(403, "Your role cannot use this.")


def _make_sale(db: Session, user: User, *, order: BuyerOrder | None, buyer_name: str, buyer_phone: str,
               produce_id: int, grade: str, grams: int, price: int | None, when: date, client_id: str | None) -> Sale:
    produce = get_in_coop(db, ProduceType, produce_id, user, "Produce")
    if not produce.is_active:
        raise conflict(f"{produce.name} is inactive.", "produce_id")
    if when > today():
        raise invalid("The date cannot be in the future.", "sale_date")
    on_hand = _on_hand(db, user.cooperative_id, produce_id, grade)
    if grams > on_hand:
        raise conflict(f"Only {kg_of(max(on_hand, 0)):g} kg of {produce.name}, grade {grade} is in stock.", "weight_kg")
    set_price = current_selling_price(db, produce_id, grade, when)
    if set_price is None:
        raise conflict(f"No selling price is set for {produce.name}, grade {grade}. Ask the Manager to set it.", "price_per_kg")
    if price is not None and price != set_price:
        raise invalid(f"The Manager's selling price is {fmt_rwf(set_price)} per kg. Clerks cannot change it.", "price_per_kg")
    price = set_price
    sale = Sale(
        cooperative_id=user.cooperative_id, order_id=order.id if order else None, buyer_name=buyer_name,
        buyer_phone=buyer_phone, produce_id=produce_id, grade=grade, weight_grams=grams, price_per_kg=price,
        value=value_of(grams, price), sale_date=when, client_id=client_id, recorded_by_id=user.id)
    db.add(sale)
    db.flush()
    audit.record(db, user, "sale.recorded", "sale", sale.id,
                 f"Sold {kg_of(grams):g} kg {produce.name} grade {grade} to {buyer_name} at {fmt_rwf(price)} per kg, "
                 f"{fmt_rwf(sale.value)} ({sale_no(sale.id)})")
    return sale


@router.post("/orders/{order_id}/accept", response_model=OrderOut)
def accept_order(order_id: int, data: AcceptOrderIn, user: User = Depends(clerk_only), db: Session = Depends(get_db)):
    audit.lock_cooperative(db, user.cooperative_id)
    order = get_in_coop(db, BuyerOrder, order_id, user, "Order")
    if order.status != ORDER_REQUESTED:
        raise conflict("This order has already been handled.")
    sale = _make_sale(db, user, order=order, buyer_name=order.buyer_name, buyer_phone=order.buyer_phone,
                      produce_id=order.produce_id, grade=order.grade, grams=order.weight_grams,
                      price=data.price_per_kg, when=data.sale_date or today(), client_id=None)
    order.status = ORDER_ACCEPTED
    order.handled_by_id = user.id
    order.handled_at = datetime.now(timezone.utc)
    audit.record(db, user, "order.accepted", "order", order.id, f"Accepted {order_no(order.id)} as {sale_no(sale.id)}")
    db.commit()
    db.refresh(order)
    return _order_out(order, sale)


@router.post("/orders/{order_id}/decline", response_model=OrderOut)
def decline_order(order_id: int, data: Reason, user: User = Depends(clerk_only), db: Session = Depends(get_db)):
    audit.lock_cooperative(db, user.cooperative_id)
    order = get_in_coop(db, BuyerOrder, order_id, user, "Order")
    if order.status != ORDER_REQUESTED:
        raise conflict("This order has already been handled.")
    order.status = ORDER_DECLINED
    order.handled_by_id = user.id
    order.handled_at = datetime.now(timezone.utc)
    order.decline_reason = data.reason
    audit.record(db, user, "order.declined", "order", order.id, f"Declined {order_no(order.id)}. Reason: {data.reason}")
    db.commit()
    db.refresh(order)
    return _order_out(order)


# ---------- sales ----------

@router.get("/sales", response_model=list[SaleOut])
def list_sales(
    q: str = Query(default="", max_length=60),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    stmt = select(Sale).where(Sale.cooperative_id == user.cooperative_id).options(
        selectinload(Sale.produce), selectinload(Sale.recorded_by), selectinload(Sale.voided_by)).order_by(Sale.id.desc())
    if q.strip():
        stmt = stmt.where(Sale.buyer_name.ilike(like(q.strip()), escape="\\"))
    return sale_outs(db, list(db.scalars(stmt.limit(300)).all()))


@router.post("/sales", response_model=SaleOut, status_code=201)
def record_sale(data: SaleIn, user: User = Depends(clerk_only), db: Session = Depends(get_db)):
    audit.lock_cooperative(db, user.cooperative_id)
    if data.client_id:
        again = db.scalar(select(Sale).where(Sale.cooperative_id == user.cooperative_id, Sale.client_id == data.client_id))
        if again:
            return sale_outs(db, [_sale_with(db, again.id)])[0]
    sale = _make_sale(db, user, order=None, buyer_name=data.buyer_name, buyer_phone=data.buyer_phone,
                      produce_id=data.produce_id, grade=data.grade, grams=to_grams(data.weight_kg),
                      price=data.price_per_kg, when=data.sale_date or today(), client_id=data.client_id)
    db.commit()
    return sale_outs(db, [_sale_with(db, sale.id)])[0]


@router.post("/sales/{sale_id}/void", response_model=SaleOut)
def void_sale(sale_id: int, data: Reason, user: User = Depends(clerk_only), db: Session = Depends(get_db)):
    audit.lock_cooperative(db, user.cooperative_id)
    sale = get_in_coop(db, Sale, sale_id, user, "Sale")
    if sale.voided_at:
        raise conflict("This sale is already voided.")
    has_money = db.scalar(select(func.count(BuyerPayment.id)).where(
        BuyerPayment.sale_id == sale.id, BuyerPayment.status != BUYER_PAY_REJECTED))
    if has_money:
        raise conflict("This sale has buyer payments recorded against it. A Payment Officer must reject them first.")
    sale.voided_at = datetime.now(timezone.utc)
    sale.voided_by_id = user.id
    sale.void_reason = data.reason
    audit.record(db, user, "sale.voided", "sale", sale.id, f"Voided {sale_no(sale.id)}. Reason: {data.reason}")
    db.commit()
    return sale_outs(db, [_sale_with(db, sale.id)])[0]


@router.get("/sales/summary", response_model=SalesSummaryOut)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    coop = user.cooperative_id
    sold = int(db.scalar(select(func.coalesce(func.sum(Sale.value), 0)).where(
        Sale.cooperative_id == coop, Sale.voided_at.is_(None))) or 0)
    by_status = {s: int(t) for s, t in db.execute(
        select(BuyerPayment.status, func.coalesce(func.sum(BuyerPayment.amount), 0))
        .join(Sale, Sale.id == BuyerPayment.sale_id)
        .where(BuyerPayment.cooperative_id == coop, Sale.voided_at.is_(None))
        .group_by(BuyerPayment.status)).all()}
    confirmed = by_status.get(BUYER_PAY_CONFIRMED, 0)
    delivered_value = int(db.scalar(select(func.coalesce(func.sum(Delivery.value), 0)).where(
        Delivery.cooperative_id == coop, Delivery.voided_at.is_(None))) or 0)
    paid_farmers = int(db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.cooperative_id == coop, Payment.voided_at.is_(None))) or 0)

    lines = []
    names = {p.id: p.name for p in db.scalars(select(ProduceType).where(ProduceType.cooperative_id == coop))}
    rec = {(p, g): int(t) for p, g, t in db.execute(
        select(Delivery.produce_id, Delivery.grade, func.sum(Delivery.weight_grams))
        .where(Delivery.cooperative_id == coop, Delivery.voided_at.is_(None))
        .group_by(Delivery.produce_id, Delivery.grade)).all()}
    sol = {(p, g): int(t) for p, g, t in db.execute(
        select(Sale.produce_id, Sale.grade, func.sum(Sale.weight_grams))
        .where(Sale.cooperative_id == coop, Sale.voided_at.is_(None))
        .group_by(Sale.produce_id, Sale.grade)).all()}
    for (p, g), r in sorted(rec.items(), key=lambda kv: (names.get(kv[0][0], ""), kv[0][1])):
        s = sol.get((p, g), 0)
        lines.append(StockLineOut(produce_name=names.get(p, "?"), grade=g, received_kg=kg_of(r), sold_kg=kg_of(s),
                                  on_hand_kg=kg_of(r - s)))
    return SalesSummaryOut(
        sold=sold, confirmed=confirmed, pending=by_status.get(BUYER_PAY_PENDING, 0), owed=sold - confirmed,
        new_orders=int(db.scalar(select(func.count(BuyerOrder.id)).where(
            BuyerOrder.cooperative_id == coop, BuyerOrder.status == ORDER_REQUESTED)) or 0),
        stock=lines, paid_to_farmers=paid_farmers, owed_to_farmers=delivered_value - paid_farmers)


# ---------- buyer payments ----------

def _room(db: Session, sale: Sale, exclude: int | None = None) -> int:
    """What a sale can still take: its value minus confirmed and pending payments."""
    stmt = select(func.coalesce(func.sum(BuyerPayment.amount), 0)).where(
        BuyerPayment.sale_id == sale.id, BuyerPayment.status != BUYER_PAY_REJECTED)
    if exclude:
        stmt = stmt.where(BuyerPayment.id != exclude)
    return sale.value - int(db.scalar(stmt) or 0)


@router.get("/buyer-payments", response_model=list[BuyerPaymentOut])
def list_buyer_payments(
    status: str | None = Query(default=None, pattern="^(pending|confirmed|rejected)$"),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    stmt = select(BuyerPayment).where(BuyerPayment.cooperative_id == user.cooperative_id).options(
        selectinload(BuyerPayment.sale), selectinload(BuyerPayment.recorded_by),
        selectinload(BuyerPayment.decided_by)).order_by(BuyerPayment.id.desc())
    if status:
        stmt = stmt.where(BuyerPayment.status == status)
    return [payment_out(p) for p in db.scalars(stmt.limit(300)).all()]


@router.post("/sales/{sale_id}/payments", response_model=BuyerPaymentOut, status_code=201)
def record_buyer_payment(sale_id: int, data: BuyerPaymentIn, user: User = Depends(clerk_only), db: Session = Depends(get_db)):
    audit.lock_cooperative(db, user.cooperative_id)
    if data.client_id:
        again = db.scalar(select(BuyerPayment).where(
            BuyerPayment.cooperative_id == user.cooperative_id, BuyerPayment.client_id == data.client_id))
        if again:
            return payment_out(again)
    sale = get_in_coop(db, Sale, sale_id, user, "Sale")
    if sale.voided_at:
        raise conflict("This sale is voided.")
    when = data.payment_date or today()
    if when > today():
        raise invalid("The date cannot be in the future.", "payment_date")
    room = _room(db, sale)
    if room <= 0:
        raise conflict(f"Nothing more can be recorded for {sale_no(sale.id)}. It is fully covered, counting payments waiting for confirmation.", "amount")
    if data.amount > room:
        raise conflict(f"That is more than the {fmt_rwf(room)} still open on this sale. Enter {room:,} or less.", "amount")
    if data.reference:
        used = db.scalar(select(func.count(BuyerPayment.id)).where(
            BuyerPayment.cooperative_id == user.cooperative_id, BuyerPayment.status != BUYER_PAY_REJECTED,
            func.lower(BuyerPayment.reference) == data.reference.lower()))
        if used:
            raise conflict("This reference was already used for another buyer payment.", "reference")
    pay = BuyerPayment(
        cooperative_id=user.cooperative_id, sale_id=sale.id, amount=data.amount, method=data.method,
        reference=data.reference, payment_date=when, status=BUYER_PAY_PENDING, client_id=data.client_id,
        recorded_by_id=user.id)
    db.add(pay)
    db.flush()
    audit.record(db, user, "buyer_payment.recorded", "buyer_payment", pay.id,
                 f"Recorded {fmt_rwf(pay.amount)} from {sale.buyer_name} for {sale_no(sale.id)}, waiting for confirmation "
                 f"({buyer_pay_no(pay.id)})")
    db.commit()
    return payment_out(db.get(BuyerPayment, pay.id))


def _decide_payment(db: Session, user: User, payment_id: int, note: str, outcome: str) -> BuyerPaymentOut:
    audit.lock_cooperative(db, user.cooperative_id)
    pay = get_in_coop(db, BuyerPayment, payment_id, user, "Buyer payment")
    if pay.status != BUYER_PAY_PENDING:
        raise conflict("This payment has already been decided.")
    if outcome == BUYER_PAY_CONFIRMED:
        sale = pay.sale
        if sale.voided_at:
            raise conflict("The sale is voided. Reject this payment instead.")
        if pay.amount > _room(db, sale, exclude=pay.id):
            raise conflict("Confirming this would take the sale past its value. Reject it instead.")
    pay.status = outcome
    pay.decided_by_id = user.id
    pay.decided_at = datetime.now(timezone.utc)
    pay.decision_note = note
    audit.record(db, user, f"buyer_payment.{outcome}", "buyer_payment", pay.id,
                 f"{outcome.capitalize()} {buyer_pay_no(pay.id)}, {fmt_rwf(pay.amount)} for {sale_no(pay.sale_id)}."
                 + (f" Note: {note}" if note else ""))
    db.commit()
    return payment_out(db.get(BuyerPayment, pay.id))


@router.post("/buyer-payments/{payment_id}/confirm", response_model=BuyerPaymentOut)
def confirm_payment(payment_id: int, data: OptionalNoteIn, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    return _decide_payment(db, user, payment_id, data.note, BUYER_PAY_CONFIRMED)


@router.post("/buyer-payments/{payment_id}/reject", response_model=BuyerPaymentOut)
def reject_payment(payment_id: int, data: DisputeDecisionIn, user: User = Depends(officer_only), db: Session = Depends(get_db)):
    return _decide_payment(db, user, payment_id, data.note, BUYER_PAY_REJECTED)
