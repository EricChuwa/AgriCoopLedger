"""Numbers for the landing page. Open to visitors who are not signed in, so it returns only totals across all
cooperatives: no names, no amounts per farmer, nothing that could identify anyone."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cooperative, Delivery, Farmer
from app.schemas import PublicStatsOut
from app.services import kg_of

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
