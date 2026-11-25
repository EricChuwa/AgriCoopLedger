"""Farmers (FR 2.1 to 2.6). A Manager registers a farmer directly. A Clerk only proposes one, and it waits
for a Manager to approve it before it can be used (FR 2.5, FR 2.6). Only a Manager deactivates one. Farmer personal data is shown only to signed-in staff, and the Payment Officer sees the
national ID masked (NFR 14)."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.database import get_db
from app.deps import get_current_user, require_role
from app.helpers import conflict, get_in_coop, invalid, like
from app.models import (
    ENROL_APPROVED, ENROL_PENDING, ENROL_REJECTED, ROLE_CLERK, ROLE_MANAGER, ROLE_PAYMENT_OFFICER,
    Delivery, Farmer, User,
)
from app.schemas import DecisionIn, FarmerIn, FarmerOut
from app.services import balance_of, balances_for, fmt_rwf, today

router = APIRouter(prefix="/api/farmers", tags=["farmers"])


def _out(f: Farmer, balance: int, viewer: User, last_delivery=None) -> FarmerOut:
    national_id = f.national_id
    if viewer.role == ROLE_PAYMENT_OFFICER:
        national_id = "*" * 12 + national_id[-4:]
    return FarmerOut(
        id=f.id, full_name=f.full_name, national_id=national_id, phone=f.phone, village=f.village,
        member_since=f.member_since, is_active=f.is_active, balance=balance,
        last_delivery_date=last_delivery, enrolment=f.enrolment,
        proposed_by=f.proposed_by.full_name if f.proposed_by else None, decision_note=f.decision_note,
    )


def _check_unique(db: Session, user: User, national_id: str, phone: str, exclude_id: int | None = None) -> None:
    base = select(Farmer).where(Farmer.cooperative_id == user.cooperative_id)
    if exclude_id is not None:
        base = base.where(Farmer.id != exclude_id)
    clash = db.scalars(base.where(Farmer.national_id == national_id)).first()
    if clash:
        raise conflict(f"{clash.full_name} is already registered with this national ID.", "national_id")
    if phone:
        clash = db.scalars(base.where(Farmer.phone == phone)).first()
        if clash:
            raise conflict(f"{clash.full_name} already has this phone number.", "phone")


@router.get("", response_model=list[FarmerOut])
def list_farmers(
    q: str = Query(default="", max_length=60),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (select(Farmer).where(Farmer.cooperative_id == user.cooperative_id)
            .options(selectinload(Farmer.proposed_by)).order_by(Farmer.full_name))
    q = q.strip()
    if q:
        digits = re.sub(r"[\s+-]", "", q)
        phone_part = re.sub(r"^(250|0)", "", digits)
        terms = [Farmer.full_name.ilike(like(q), escape="\\"), Farmer.village.ilike(like(q), escape="\\")]
        if re.fullmatch(r"[0-9]+", phone_part):
            terms.append(Farmer.phone.contains(phone_part))
            # The Payment Officer sees the ID masked, so searching by it would reveal it.
            if user.role != ROLE_PAYMENT_OFFICER:
                terms.append(Farmer.national_id.contains(digits))
        stmt = stmt.where(or_(*terms))
    balances = balances_for(db, user.cooperative_id)
    last = dict(db.execute(
        select(Delivery.farmer_id, func.max(Delivery.delivery_date))
        .where(Delivery.cooperative_id == user.cooperative_id, Delivery.voided_at.is_(None))
        .group_by(Delivery.farmer_id)).all())
    return [_out(f, balances.get(f.id, 0), user, last.get(f.id)) for f in db.scalars(stmt).all()]


@router.post("", response_model=FarmerOut, status_code=201)
def create_farmer(
    data: FarmerIn,
    user: User = Depends(require_role(ROLE_MANAGER, ROLE_CLERK)),
    db: Session = Depends(get_db),
):
    member_since = data.member_since or today()
    if member_since > today():
        raise invalid("The membership date cannot be in the future.", "member_since")
    _check_unique(db, user, data.national_id, data.phone)
    proposed = user.role == ROLE_CLERK  # a Clerk proposes, a Manager registers
    farmer = Farmer(
        cooperative_id=user.cooperative_id, full_name=data.full_name, national_id=data.national_id,
        phone=data.phone, village=data.village, member_since=member_since,
        enrolment=ENROL_PENDING if proposed else ENROL_APPROVED, is_active=not proposed,
        proposed_by_id=user.id if proposed else None,
    )
    db.add(farmer)
    db.flush()
    if proposed:
        audit.record(db, user, "farmer.proposed", "farmer", farmer.id,
                     f"Proposed farmer {farmer.full_name}. A Manager must approve before deliveries can be recorded.")
    else:
        audit.record(db, user, "farmer.created", "farmer", farmer.id, f"Registered farmer {farmer.full_name}.")
    db.commit()
    return _out(farmer, 0, user)


@router.get("/{farmer_id}", response_model=FarmerOut)
def get_farmer(farmer_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    farmer = get_in_coop(db, Farmer, farmer_id, user, "Farmer")
    return _out(farmer, balance_of(db, farmer.id), user)


@router.patch("/{farmer_id}", response_model=FarmerOut)
def update_farmer(
    farmer_id: int,
    data: FarmerIn,
    user: User = Depends(require_role(ROLE_MANAGER, ROLE_CLERK)),
    db: Session = Depends(get_db),
):
    farmer = get_in_coop(db, Farmer, farmer_id, user, "Farmer")
    member_since = data.member_since or farmer.member_since
    if member_since > today():
        raise invalid("The membership date cannot be in the future.", "member_since")
    _check_unique(db, user, data.national_id, data.phone, exclude_id=farmer.id)

    changes = []
    for label, attr, new in (
        ("name", "full_name", data.full_name), ("national ID", "national_id", data.national_id),
        ("phone", "phone", data.phone), ("village", "village", data.village),
        ("membership date", "member_since", member_since),
    ):
        if getattr(farmer, attr) != new:
            changes.append(label)
            setattr(farmer, attr, new)
    if changes:
        audit.record(db, user, "farmer.updated", "farmer", farmer.id,
                     f"Edited {farmer.full_name}: changed {', '.join(changes)}.")
        db.commit()
    return _out(farmer, balance_of(db, farmer.id), user)


@router.post("/{farmer_id}/deactivate", response_model=FarmerOut)
def deactivate_farmer(farmer_id: int, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)):
    farmer = get_in_coop(db, Farmer, farmer_id, user, "Farmer")
    if farmer.enrolment != ENROL_APPROVED:
        raise conflict(f"{farmer.full_name} has not been approved. Decide on the enrolment instead.")
    balance = balance_of(db, farmer.id)
    if balance > 0:
        raise conflict(f"{farmer.full_name} is still owed {fmt_rwf(balance)}. Record a payment before deactivating.")
    if farmer.is_active:
        farmer.is_active = False
        audit.record(db, user, "farmer.deactivated", "farmer", farmer.id, f"Deactivated farmer {farmer.full_name}.")
        db.commit()
    return _out(farmer, balance, user)


@router.post("/{farmer_id}/activate", response_model=FarmerOut)
def activate_farmer(farmer_id: int, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)):
    farmer = get_in_coop(db, Farmer, farmer_id, user, "Farmer")
    if farmer.enrolment != ENROL_APPROVED:
        raise conflict(f"{farmer.full_name} has not been approved. Approve the enrolment first.")
    if not farmer.is_active:
        farmer.is_active = True
        audit.record(db, user, "farmer.activated", "farmer", farmer.id, f"Reactivated farmer {farmer.full_name}.")
        db.commit()
    return _out(farmer, balance_of(db, farmer.id), user)


def _decidable(db: Session, farmer_id: int, user: User) -> Farmer:
    farmer = get_in_coop(db, Farmer, farmer_id, user, "Farmer")
    if farmer.proposed_by_id == user.id:  # the person who decides is never the person who proposed (BR 10)
        raise conflict("You proposed this farmer, so another Manager must decide on it.")
    return farmer


@router.post("/{farmer_id}/approve", response_model=FarmerOut)
def approve_farmer(
    farmer_id: int, data: DecisionIn, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)
):
    """Let a proposed farmer in. A declined one can still be approved later."""
    farmer = _decidable(db, farmer_id, user)
    if farmer.enrolment == ENROL_APPROVED:
        raise conflict(f"{farmer.full_name} is already approved.")
    farmer.enrolment = ENROL_APPROVED
    farmer.is_active = True
    farmer.decided_by_id, farmer.decided_at = user.id, datetime.now(timezone.utc)
    farmer.decision_note = data.note or None
    audit.record(db, user, "farmer.approved", "farmer", farmer.id, f"Approved enrolment of {farmer.full_name}.")
    db.commit()
    return _out(farmer, balance_of(db, farmer.id), user)


@router.post("/{farmer_id}/reject", response_model=FarmerOut)
def reject_farmer(
    farmer_id: int, data: DecisionIn, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)
):
    farmer = _decidable(db, farmer_id, user)
    if farmer.enrolment != ENROL_PENDING:
        raise conflict(f"{farmer.full_name} is not waiting for a decision.")
    farmer.enrolment = ENROL_REJECTED
    farmer.decided_by_id, farmer.decided_at = user.id, datetime.now(timezone.utc)
    farmer.decision_note = data.note or None
    audit.record(db, user, "farmer.rejected", "farmer", farmer.id, f"Declined enrolment of {farmer.full_name}."
                 + (f" Note: {data.note}" if data.note else ""))
    db.commit()
    return _out(farmer, 0, user)
