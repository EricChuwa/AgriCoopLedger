import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.database import get_db
from app.deps import get_current_user
from app.models import APPROVED, PENDING, REJECTED, ROLE_CLERK, ROLE_MANAGER, ROLE_PAYMENT_OFFICER, Cooperative, User
from app.schemas import ChangePasswordIn, LoginIn, RegisterIn, UserOut
from app.phone import normalize_phone
from app.security import hash_password, verify_password
from app.usernames import suggest_username

ROLE_LABEL = {ROLE_CLERK: "Collection Clerk", ROLE_PAYMENT_OFFICER: "Payment Officer"}

router = APIRouter(prefix="/api/auth", tags=["auth"])

BAD_CREDENTIALS = "Username or password is wrong. Check both and try again."


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        full_name=user.full_name,
        username=user.username,
        phone=user.phone,
        role=user.role,
        cooperative_id=user.cooperative_id,
        cooperative_name=user.cooperative.name,
        approval=user.approval,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Register with a cooperative's name.

    A name nobody has used starts a new cooperative and the person becomes its Manager, signed in straight away.
    A name that already exists (any capitals) sends a request to that cooperative's Managers: the account is
    created but cannot sign in until a Manager approves it and chooses its role."""
    taken = db.scalar(select(User.id).where(User.phone == data.phone))
    if taken:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"field": "phone", "message": "An account with this phone number already exists."},
        )

    if data.username and db.scalar(select(User.id).where(User.username == data.username)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"field": "username", "message": "This username is taken. Choose another."},
        )

    existing = db.scalar(select(Cooperative).where(func.lower(Cooperative.name) == data.cooperative_name.lower()))
    if data.account_type == ROLE_MANAGER and existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"field": "cooperative_name", "message": "A cooperative with this name is already registered. "
                    "To join it, choose Collection Clerk or Payment Officer."},
        )
    if data.account_type in (ROLE_CLERK, ROLE_PAYMENT_OFFICER) and existing is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"field": "cooperative_name", "message": "No cooperative is registered with this name. Check the "
                    "spelling, or choose Manager to register a new cooperative."},
        )
    coop = existing or Cooperative(name=data.cooperative_name)
    joining = existing is not None
    # A joiner's role is only what they asked for. It gives no access until a Manager approves it.
    requested = data.account_type if data.account_type in (ROLE_CLERK, ROLE_PAYMENT_OFFICER) else ROLE_CLERK
    user = User(
        cooperative=coop,
        full_name=data.full_name,
        username=data.username or suggest_username(db, data.full_name),
        phone=data.phone,
        password_hash=hash_password(data.password),
        # A person who asks to join gets no access until a Manager decides. The role is the one they asked for.
        role=requested if joining else ROLE_MANAGER,
        is_active=not joining,
        approval=PENDING if joining else APPROVED,
    )
    db.add_all([coop, user])
    try:
        db.flush()
        if joining:
            audit.record(db, user, "user.requested", "user", user.id,
                         f"{user.full_name} asked to join {coop.name} as {ROLE_LABEL[requested]}. A Manager must approve the request.")
        else:
            audit.record(db, user, "cooperative.registered", "cooperative", coop.id,
                         f"Registered {coop.name} with {user.full_name} as Manager.")
        db.commit()
    except IntegrityError:  # two requests with the same phone at the same moment
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"field": "phone", "message": "An account with this phone number already exists."},
        )
    return _user_out(user)


def _find_for_login(db: Session, typed: str) -> User | None:
    """The account for what was typed at sign in: a username, or else a phone number."""
    user = db.scalar(select(User).where(User.username == typed.strip().lower()))
    if user is None:
        try:
            user = db.scalar(select(User).where(User.phone == normalize_phone(typed)))
        except ValueError:
            user = None
    return user


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = _find_for_login(db, data.username)
    ok = verify_password(data.password, user.password_hash if user else None)
    if not user or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_CREDENTIALS)
    # Only someone who proved they know the password is told where their request stands.
    if user.approval == PENDING:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Your request to join {user.cooperative.name} is waiting for its Manager to approve it. Try again later.")
    if user.approval == REJECTED:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"The Manager of {user.cooperative.name} did not approve your request.")
    if not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_CREDENTIALS)

    request.session.clear()  # new session on every sign in
    request.session["user_id"] = user.id
    request.session["last_seen"] = time.time()
    return _user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request):
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            422,
            detail={"field": "current", "message": "Your current password is wrong."},
        )
    if data.current_password == data.new_password:
        raise HTTPException(
            422,
            detail={"field": "next", "message": "Choose a password different from your current one."},
        )
    user.password_hash = hash_password(data.new_password)
    audit.record(db, user, "user.password_changed", "user", user.id, f"{user.full_name} changed their own password.")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
