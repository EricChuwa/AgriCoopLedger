from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Roles (SRS FR 1.4, BR 1, BR 2, NFR 11).
ROLE_MANAGER = "manager"
ROLE_CLERK = "clerk"  # Collection Clerk: records deliveries
ROLE_PAYMENT_OFFICER = "payment_officer"  # Payment Officer: records payments
ROLES = (ROLE_MANAGER, ROLE_CLERK, ROLE_PAYMENT_OFFICER)

# Whether a person who asked to join an existing cooperative has been let in by its Manager.
# Only an "approved" account can sign in. Everyone created by a Manager, and the first Manager of a new
# cooperative, is approved straight away.
APPROVED = "approved"
PENDING = "pending"
REJECTED = "rejected"

# Quality grades a price can be set for (FR 3.2, FR 4.1).
GRADES = ("A", "B", "C")

METHODS = ("cash", "momo")

CORRECTION_PENDING = "pending"
CORRECTION_APPROVED = "approved"
CORRECTION_REJECTED = "rejected"
CORRECTION_DIRECT = "direct"  # made by a Manager without a request


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Cooperative(Base):
    __tablename__ = "cooperatives"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    district: Mapped[str] = mapped_column(String(100), default="")
    phone: Mapped[str] = mapped_column(String(16), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    users: Mapped[list["User"]] = relationship(back_populates="cooperative")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    full_name: Mapped[str] = mapped_column(String(150))
    # What the person types to sign in (FR 1.1). Lower case, unique across the whole system.
    username: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    # Stored in the form +2507XXXXXXXX. Also unique, and also accepted at sign in.
    phone: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=ROLE_CLERK)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    approval: Mapped[str] = mapped_column(String(10), default=APPROVED)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    cooperative: Mapped[Cooperative] = relationship(back_populates="users")


class Farmer(Base):
    __tablename__ = "farmers"
    __table_args__ = (UniqueConstraint("cooperative_id", "national_id", name="uq_farmer_national_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    full_name: Mapped[str] = mapped_column(String(150))
    national_id: Mapped[str] = mapped_column(String(16))  # 16 digits, unique per cooperative (BR 7)
    phone: Mapped[str] = mapped_column(String(16), default="")
    village: Mapped[str] = mapped_column(String(100), default="")
    member_since: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ProduceType(Base):
    __tablename__ = "produce_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    prices: Mapped[list["Price"]] = relationship(back_populates="produce", order_by="Price.id")


class Price(Base):
    """A price per kg for one produce type and grade, in force from `effective_from` (FR 3.2, FR 3.3)."""

    __tablename__ = "prices"

    id: Mapped[int] = mapped_column(primary_key=True)
    produce_id: Mapped[int] = mapped_column(ForeignKey("produce_types.id"), index=True)
    grade: Mapped[str] = mapped_column(String(2))
    price_per_kg: Mapped[int] = mapped_column(Integer)  # whole RWF
    effective_from: Mapped[date] = mapped_column(Date)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    produce: Mapped[ProduceType] = relationship(back_populates="prices")
    created_by: Mapped[User] = relationship()


class Delivery(Base):
    __tablename__ = "deliveries"
    __table_args__ = (
        Index("ix_deliveries_coop_date", "cooperative_id", "delivery_date"),
        # Duplicate protection: one submission (client_id) can only ever create one delivery.
        UniqueConstraint("cooperative_id", "client_id", name="uq_deliveries_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmers.id"), index=True)
    produce_id: Mapped[int] = mapped_column(ForeignKey("produce_types.id"))
    grade: Mapped[str] = mapped_column(String(2))
    # Weight in grams so no floating point is ever used for money (1 kg = 1000 g).
    weight_grams: Mapped[int] = mapped_column(Integer)
    # The price in force on the delivery date, stored so later price changes never alter it (BR 3).
    price_per_kg: Mapped[int] = mapped_column(Integer)
    value: Mapped[int] = mapped_column(Integer)  # whole RWF
    delivery_date: Mapped[date] = mapped_column(Date)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    farmer: Mapped[Farmer] = relationship()
    produce: Mapped[ProduceType] = relationship()
    recorded_by: Mapped[User] = relationship(foreign_keys=[recorded_by_id])
    voided_by: Mapped[User | None] = relationship(foreign_keys=[voided_by_id])


class Correction(Base):
    """A change to a delivery's weight or grade. Either made directly by a Manager, or requested
    by a Clerk and decided by a Manager. The old values are always kept (FR 4.4, BR 5)."""

    __tablename__ = "corrections"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id"), index=True)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # What was asked for. None means "leave unchanged".
    new_weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_grade: Mapped[str | None] = mapped_column(String(2), nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default=CORRECTION_PENDING)
    # Filled in when the correction is applied.
    old_weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    old_grade: Mapped[str | None] = mapped_column(String(2), nullable=True)
    old_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applied_weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applied_grade: Mapped[str | None] = mapped_column(String(2), nullable=True)
    applied_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    delivery: Mapped[Delivery] = relationship()
    requested_by: Mapped[User] = relationship(foreign_keys=[requested_by_id])
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id])


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_coop_date", "cooperative_id", "payment_date"),
        UniqueConstraint("cooperative_id", "client_id", name="uq_payments_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmers.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # whole RWF
    method: Mapped[str] = mapped_column(String(10))
    reference: Mapped[str] = mapped_column(String(60), default="")
    payment_date: Mapped[date] = mapped_column(Date)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    farmer: Mapped[Farmer] = relationship()
    recorded_by: Mapped[User] = relationship(foreign_keys=[recorded_by_id])
    voided_by: Mapped[User | None] = relationship(foreign_keys=[voided_by_id])


class AuditEntry(Base):
    """Append-only record of who changed what and when (FR 7.1, NFR 15). Nothing edits or deletes these."""

    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_coop_created", "cooperative_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    user_name: Mapped[str] = mapped_column(String(150))  # kept as written, even if the user is renamed later
    action: Mapped[str] = mapped_column(String(40))
    entity_type: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(String(400))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # Tamper evidence: each entry stores the hash of the entry before it and a hash of its own contents
    # plus that previous hash, so changing or removing any earlier entry breaks every hash after it.
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    entry_hash: Mapped[str] = mapped_column(String(64), default="")
