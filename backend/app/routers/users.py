"""Staff accounts. Manager only (FR 1.3, FR 1.4, BR 1)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.database import get_db
from app.deps import require_role
from app.helpers import conflict, get_in_coop, invalid
from app.models import APPROVED, PENDING, REJECTED, ROLE_MANAGER, User
from app.schemas import ApproveIn, StaffCreatedOut, StaffCreateIn, StaffOut, StaffUpdateIn, TempPasswordOut
from app.security import generate_password, hash_password
from app.usernames import suggest_username

router = APIRouter(prefix="/api/users", tags=["users"])

ROLE_NAME = {"manager": "Manager", "clerk": "Collection Clerk", "payment_officer": "Payment Officer"}

manager_only = require_role(ROLE_MANAGER)


def _out(u: User) -> StaffOut:
    return StaffOut(id=u.id, full_name=u.full_name, username=u.username, phone=u.phone, role=u.role,
                    is_active=u.is_active, approval=u.approval)


@router.get("", response_model=list[StaffOut])
def list_staff(user: User = Depends(manager_only), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(User).where(User.cooperative_id == user.cooperative_id).order_by(User.full_name)
    ).all()
    return [_out(u) for u in rows]


@router.post("", response_model=StaffCreatedOut, status_code=201)
def create_staff(data: StaffCreateIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.phone == data.phone)):
        raise conflict("An account with this phone number already exists.", "phone")
    if data.username and db.scalar(select(User.id).where(User.username == data.username)):
        raise conflict("This username is taken. Choose another.", "username")
    password = data.password or generate_password()
    member = User(
        cooperative_id=user.cooperative_id,
        full_name=data.full_name,
        username=data.username or suggest_username(db, data.full_name),
        phone=data.phone,
        password_hash=hash_password(password),
        role=data.role,
    )
    db.add(member)
    db.flush()
    audit.record(db, user, "user.created", "user", member.id,
                 f"Created the account of {member.full_name} as {ROLE_NAME[member.role]}.")
    db.commit()
    return StaffCreatedOut(**_out(member).model_dump(), temp_password=password)


@router.patch("/{user_id}", response_model=StaffOut)
def update_staff(user_id: int, data: StaffUpdateIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    member = get_in_coop(db, User, user_id, user, "Staff member")
    if member.approval != APPROVED:
        raise invalid("This person has not been approved yet. Approve or decline the request first.")
    changes: list[str] = []

    if member.id == user.id:
        if data.role is not None and data.role != member.role:
            raise invalid("You cannot change your own role.")
        if data.is_active is False:
            raise invalid("You cannot deactivate your own account.")

    if data.full_name is not None and data.full_name != member.full_name:
        changes.append(f"name {member.full_name} to {data.full_name}")
        member.full_name = data.full_name
    if data.username is not None and data.username != member.username:
        if db.scalar(select(User.id).where(User.username == data.username, User.id != member.id)):
            raise conflict("This username is taken. Choose another.", "username")
        changes.append(f"username {member.username} to {data.username}")
        member.username = data.username
    if data.phone is not None and data.phone != member.phone:
        if db.scalar(select(User.id).where(User.phone == data.phone, User.id != member.id)):
            raise conflict("An account with this phone number already exists.", "phone")
        changes.append("phone number")
        member.phone = data.phone
    if data.role is not None and data.role != member.role:
        changes.append(f"role {ROLE_NAME[member.role]} to {ROLE_NAME[data.role]}")
        member.role = data.role
    if data.is_active is not None and data.is_active != member.is_active:
        changes.append("deactivated" if not data.is_active else "reactivated")
        member.is_active = data.is_active

    if changes:
        audit.record(db, user, "user.updated", "user", member.id,
                     f"Changed {member.full_name}: {', '.join(changes)}.")
        db.commit()
    return _out(member)


@router.post("/{user_id}/reset-password", response_model=TempPasswordOut)
def reset_password(user_id: int, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    member = get_in_coop(db, User, user_id, user, "Staff member")
    password = generate_password()
    member.password_hash = hash_password(password)
    audit.record(db, user, "user.password_reset", "user", member.id, f"Reset the password of {member.full_name}.")
    db.commit()
    return TempPasswordOut(temp_password=password)


@router.post("/{user_id}/approve", response_model=StaffOut)
def approve_request(user_id: int, data: ApproveIn, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    """Let in someone who asked to join this cooperative, with the role the Manager chooses. A request that was
    declined can be approved later."""
    member = get_in_coop(db, User, user_id, user, "Staff member")
    if member.approval == APPROVED:
        raise conflict("This person already has an account.")
    member.approval, member.is_active, member.role = APPROVED, True, data.role
    audit.record(db, user, "user.approved", "user", member.id,
                 f"Approved {member.full_name} to join as {ROLE_NAME[member.role]}.")
    db.commit()
    return _out(member)


@router.post("/{user_id}/reject", response_model=StaffOut)
def reject_request(user_id: int, user: User = Depends(manager_only), db: Session = Depends(get_db)):
    """Turn down a request to join. The record stays (nothing is deleted); the person cannot sign in."""
    member = get_in_coop(db, User, user_id, user, "Staff member")
    if member.approval != PENDING:
        raise conflict("Only a waiting request can be declined.")
    member.approval, member.is_active = REJECTED, False
    audit.record(db, user, "user.declined", "user", member.id, f"Declined the request of {member.full_name} to join.")
    db.commit()
    return _out(member)
