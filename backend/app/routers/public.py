"""Numbers for the landing page. Open to visitors who are not signed in, so it returns only totals across all
cooperatives: no names, no amounts per farmer, nothing that could identify anyone."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.database import get_db
from app.helpers import conflict
from app.models import ORDER_REQUESTED, BuyerOrder, Cooperative, Delivery, Farmer, ProduceType
from app.routers.buyers import order_no, stock_grams
from app.schemas import PublicOrderIn, PublicOrderOut, PublicStatsOut, PublicStockOut, StockItemOut
from app.services import kg_of, to_grams

router = APIRouter(tags=["public"])


@router.get("/api/public/stats", response_model=PublicStatsOut)
def public_stats(db: Session = Depends(get_db)):
    grams = db.scalar(select(func.coalesce(func.sum(Delivery.weight_grams), 0)).where(Delivery.voided_at.is_(None)))
    return PublicStatsOut(
        cooperatives=db.scalar(select(func.count(Cooperative.id))) or 0,
        farmers=db.scalar(select(func.count(Farmer.id)).where(Farmer.is_active.is_(True))) or 0,
        deliveries=db.scalar(select(func.count(Delivery.id)).where(Delivery.voided_at.is_(None))) or 0,
        total_kg=round(kg_of(int(grams)), 1),
    )


MAX_OPEN_REQUESTS = 3  # per phone number and cooperative, so one person cannot flood a cooperative's inbox


@router.get("/api/public/stock", response_model=list[PublicStockOut])
def public_stock(db: Session = Depends(get_db)):
    """What each cooperative has in stock, for the Buy page. Kilograms per produce and grade only: no prices,
    no farmers, no amounts."""
    stock = stock_grams(db)
    produce = {p.id: p for p in db.scalars(select(ProduceType).where(ProduceType.is_active.is_(True)))}
    out = []
    for coop in db.scalars(select(Cooperative).order_by(Cooperative.name)):
        items = [
            StockItemOut(produce_id=pid, produce_name=produce[pid].name, grade=grade, available_kg=kg_of(grams))
            for (cid, pid, grade), grams in sorted(stock.items(), key=lambda kv: (produce.get(kv[0][1]).name if kv[0][1] in produce else "", kv[0][2]))
            if cid == coop.id and grams > 0 and pid in produce
        ]
        if items:
            out.append(PublicStockOut(cooperative_id=coop.id, cooperative_name=coop.name, district=coop.district or "", items=items))
    return out


@router.post("/api/public/orders", response_model=PublicOrderOut, status_code=201)
def public_order(data: PublicOrderIn, db: Session = Depends(get_db)):
    """A buyer asks to buy. It promises nothing: a Clerk at the cooperative accepts or declines it."""
    coop = db.get(Cooperative, data.cooperative_id)
    produce = db.get(ProduceType, data.produce_id)
    if coop is None or produce is None or produce.cooperative_id != coop.id or not produce.is_active:
        raise conflict("That produce is not offered by this cooperative.")
    grams = to_grams(data.weight_kg)
    if grams > stock_grams(db, coop.id).get((coop.id, produce.id, data.grade), 0):
        raise conflict("That is more than the cooperative has in stock. Ask for less.", "weight_kg")
    audit.lock_cooperative(db, coop.id)
    open_now = db.scalar(select(func.count(BuyerOrder.id)).where(
        BuyerOrder.cooperative_id == coop.id, BuyerOrder.buyer_phone == data.buyer_phone,
        BuyerOrder.status == ORDER_REQUESTED)) or 0
    if open_now >= MAX_OPEN_REQUESTS:
        raise conflict("You already have several requests waiting with this cooperative. Wait for them to be answered.")
    order = BuyerOrder(
        cooperative_id=coop.id, buyer_name=data.buyer_name, buyer_phone=data.buyer_phone, produce_id=produce.id,
        grade=data.grade, weight_grams=grams, note=data.note or None)
    db.add(order)
    db.flush()
    audit.record_for(db, coop.id, None, f"{data.buyer_name} (buyer, not signed in)", "order.requested", "order", order.id,
                     f"Request {order_no(order.id)}: {data.weight_kg} kg {produce.name} grade {data.grade}")
    db.commit()
    return PublicOrderOut(
        number=order_no(order.id), cooperative_name=coop.name,
        summary=f"{data.weight_kg} kg of {produce.name}, grade {data.grade}")
