"""Produce types and per-grade prices with effective dates (FR 3.1 to 3.3). Only a Manager sets them (BR 1);
everyone signed in can read them, because recording a delivery needs the price."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import get_current_user, require_role
from app.helpers import conflict, get_in_coop, invalid
from app.models import ROLE_MANAGER, Price, ProduceType, User
from app.schemas import PriceIn, PriceOut, ProduceIn, ProduceOut, ProduceUpdateIn
from app.services import fmt_rwf, today

router = APIRouter(prefix="/api/produce", tags=["produce"])

manager_only = require_role(ROLE_MANAGER)


def _out(p: ProduceType) -> ProduceOut:
    prices = sorted(p.prices, key=lambda x: (x.effective_from, x.id), reverse=True)
    return ProduceOut(
        id=p.id, name=p.name, is_active=p.is_active,
        prices=[PriceOut(id=x.id, grade=x.grade, price_per_kg=x.price_per_kg,
                         effective_from=x.effective_from, set_by=x.created_by.full_name) for x in prices],
    )


def _load(db: Session, produce_id: int, user: User) -> ProduceType:
    produce = get_in_coop(db, ProduceType, produce_id, user, "Produce")
    return produce


def _add_price(db: Session, user: User, produce: ProduceType, data: PriceIn) -> Price:
    start = data.effective_from or today()
    latest = db.scalar(
        select(func.max(Price.effective_from)).where(Price.produce_id == produce.id, Price.grade == data.grade)
    )
    if latest is not None and start < latest:
        raise invalid(
            f"A Grade {data.grade} price already starts on {latest.isoformat()}. Choose that date or a later one.",
            "effective_from",
        )
    current = db.scalars(
        select(Price).where(Price.produce_id == produce.id, Price.grade == data.grade, Price.effective_from <= start)
        .order_by(Price.effective_from.desc(), Price.id.desc()).limit(1)
    ).first()
    if current is not None and current.price_per_kg == data.price_per_kg:
        raise conflict("That is already the price from that date.", "price")
    price = Price(produce_id=produce.id, grade=data.grade, price_per_kg=data.price_per_kg,
                  effective_from=start, created_by_id=user.id)
    db.add(price)
    db.flush()
    audit.record(db, user, "price.set", "price", price.id,
                 f"Set {produce.name} Grade {data.grade} to {fmt_rwf(data.price_per_kg)} per kg from {start.isoformat()}.")
    return price


@router.get("", response_model=list[ProduceOut])
def list_produce(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ProduceType).where(ProduceType.cooperative_id == user.cooperative_id)
        .options(selectinload(ProduceType.prices).selectinload(Price.created_by)).order_by(ProduceType.name)
    ).all()
    return [_out(p) for p in rows]


@router.post("", response_model=ProduceOut, status_code=201)
def create_produce(data: ProduceIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    existing = db.scalars(select(ProduceType).where(ProduceType.cooperative_id == user.cooperative_id)).all()
    if any(p.name.lower() == data.name.lower() for p in existing):
        raise conflict("This produce is already on the list.", "name")
    if len({p.grade for p in data.prices}) != len(data.prices):
        raise invalid("Set each grade's price only once.", "price")
    produce = ProduceType(cooperative_id=user.cooperative_id, name=data.name)
    db.add(produce)
    db.flush()
    audit.record(db, user, "produce.created", "produce", produce.id, f"Added produce {produce.name}.")
    for price in data.prices:
        _add_price(db, user, produce, price)
    db.commit()
    db.refresh(produce)
    return _out(produce)


@router.patch("/{produce_id}", response_model=ProduceOut)
def update_produce(produce_id: int, data: ProduceUpdateIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    produce = _load(db, produce_id, user)
    changes = []
    if data.name is not None and data.name != produce.name:
        others = db.scalars(select(ProduceType).where(
            ProduceType.cooperative_id == user.cooperative_id, ProduceType.id != produce.id)).all()
        if any(p.name.lower() == data.name.lower() for p in others):
            raise conflict("This produce is already on the list.", "name")
        changes.append(f"renamed {produce.name} to {data.name}")
        produce.name = data.name
    if data.is_active is not None and data.is_active != produce.is_active:
        changes.append("no longer in use" if not data.is_active else "in use again")
        produce.is_active = data.is_active
    if changes:
        audit.record(db, user, "produce.updated", "produce", produce.id, f"{produce.name}: {', '.join(changes)}.")
        db.commit()
    return _out(produce)


@router.post("/{produce_id}/prices", response_model=ProduceOut, status_code=201)
def set_price(produce_id: int, data: PriceIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    produce = _load(db, produce_id, user)
    _add_price(db, user, produce, data)
    db.commit()
    db.refresh(produce)
    return _out(produce)
