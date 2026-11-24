from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import audit
from app.database import get_db
from app.deps import get_current_user, require_role
from app.models import ROLE_MANAGER, Cooperative, User
from app.schemas import CooperativeOut, CooperativeUpdateIn

router = APIRouter(prefix="/api/cooperative", tags=["cooperative"])


def _out(c: Cooperative) -> CooperativeOut:
    return CooperativeOut(id=c.id, name=c.name, district=c.district or "", phone=c.phone or "")


@router.get("", response_model=CooperativeOut)
def get_cooperative(user: User = Depends(get_current_user)):
    return _out(user.cooperative)


@router.patch("", response_model=CooperativeOut)
def update_cooperative(
    data: CooperativeUpdateIn, user: User = Depends(require_role(ROLE_MANAGER)), db: Session = Depends(get_db)
):
    coop = user.cooperative
    coop.name, coop.district, coop.phone = data.name, data.district, data.phone
    audit.record(db, user, "cooperative.updated", "cooperative", coop.id, f"Updated the details of {coop.name}.")
    db.commit()
    return _out(coop)
