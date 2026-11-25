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

# Whether a farmer a Clerk proposed has been let in by a Manager. Only an "approved" farmer is active. A farmer a
# Manager registers is approved straight away (FR 2.5).
ENROL_APPROVED = "approved"
ENROL_PENDING = "pending"
ENROL_REJECTED = "rejected"

# Payment batches (FR 10). Whether a batch is paid is worked out from its payments, so only these are stored.
BATCH_SUBMITTED = "submitted"
BATCH_APPROVED = "approved"
BATCH_REJECTED = "rejected"

# Disputes (FR 11): a challenge to one delivery or one payment, decided by a Manager.
DISPUTE_OPEN = "open"
DISPUTE_UPHELD = "upheld"
DISPUTE_DISMISSED = "dismissed"

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
    # Enrolment (FR 2.5, FR 2.6): a farmer a Clerk proposes is pending and inactive until a Manager decides.
    enrolment: Mapped[str] = mapped_column(String(10), default=ENROL_APPROVED)
    proposed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    proposed_by: Mapped["User | None"] = relationship(foreign_keys=[proposed_by_id])


class ProduceType(Base):
    __tablename__ = "produce_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    prices: Mapped[list["Price"]] = relationship(back_populates="produce", order_by="Price.id")
    selling_prices: Mapped[list["SellingPrice"]] = relationship(back_populates="produce", order_by="SellingPrice.id")


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


class SellingPrice(Base):
    """The price per kg the cooperative sells at, set by the Manager (FR 12). Buying price (Price) is what farmers get."""

    __tablename__ = "selling_prices"

    id: Mapped[int] = mapped_column(primary_key=True)
    produce_id: Mapped[int] = mapped_column(ForeignKey("produce_types.id"), index=True)
    grade: Mapped[str] = mapped_column(String(2))
    price_per_kg: Mapped[int] = mapped_column(Integer)  # whole RWF
    effective_from: Mapped[date] = mapped_column(Date)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    produce: Mapped[ProduceType] = relationship(back_populates="selling_prices")
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
    # Set when the payment was recorded against an approved batch (FR 10.4). Ordinary payments leave it empty.
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("payment_batches.id"), nullable=True, index=True)
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    farmer: Mapped[Farmer] = relationship()
    recorded_by: Mapped[User] = relationship(foreign_keys=[recorded_by_id])
    voided_by: Mapped[User | None] = relationship(foreign_keys=[voided_by_id])


class PaymentBatch(Base):
    """A group of farmers' payments planned together. A Payment Officer submits it, a Manager approves or rejects
    it, and only then can payments be recorded against it (FR 10). Whether it is part paid or paid is worked out
    from its live payments, never stored, like every balance."""

    __tablename__ = "payment_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(10), default=BATCH_SUBMITTED)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id])
    lines: Mapped[list["BatchLine"]] = relationship(back_populates="batch", order_by="BatchLine.id")


class BatchLine(Base):
    """One farmer in a batch and the amount planned for them. The amount is a plan: at most what they were owed
    when the batch was made."""

    __tablename__ = "batch_lines"
    __table_args__ = (UniqueConstraint("batch_id", "farmer_id", name="uq_batch_farmer"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("payment_batches.id"), index=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmers.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # whole RWF

    batch: Mapped[PaymentBatch] = relationship(back_populates="lines")
    farmer: Mapped[Farmer] = relationship()


class Dispute(Base):
    """A challenge to one delivery or one payment (exactly one of the two is set). Raised by a Clerk (deliveries),
    a Payment Officer (payments) or a Manager, and decided by a Manager, who upholds or dismisses it with a note.
    Upholding does not change any amount by itself: the Manager then corrects or voids the record, which keeps
    every change under its own reason and audit entry."""

    __tablename__ = "disputes"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    delivery_id: Mapped[int | None] = mapped_column(ForeignKey("deliveries.id"), nullable=True, index=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"), nullable=True, index=True)
    raised_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default=DISPUTE_OPEN)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    delivery: Mapped[Delivery | None] = relationship()
    payment: Mapped[Payment | None] = relationship()
    raised_by: Mapped[User] = relationship(foreign_keys=[raised_by_id])
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id])


# Buyer side (FR 12). A buyer asks to buy from the public Buy page. A Clerk turns the request into a sale (or
# declines it), records what the buyer pays, and a Payment Officer confirms each payment. A Manager reads everything.
ORDER_REQUESTED = "requested"
ORDER_ACCEPTED = "accepted"
ORDER_DECLINED = "declined"
BUYER_PAY_PENDING = "pending"
BUYER_PAY_CONFIRMED = "confirmed"
BUYER_PAY_REJECTED = "rejected"


class BuyerOrder(Base):
    """A request from a buyer who is not signed in. Nothing is promised until a Clerk accepts it."""

    __tablename__ = "buyer_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    buyer_name: Mapped[str] = mapped_column(String(150))
    buyer_phone: Mapped[str] = mapped_column(String(20))
    produce_id: Mapped[int] = mapped_column(ForeignKey("produce_types.id"))
    grade: Mapped[str] = mapped_column(String(2))
    weight_grams: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default=ORDER_REQUESTED)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    handled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decline_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    produce: Mapped[ProduceType] = relationship()
    handled_by: Mapped[User | None] = relationship(foreign_keys=[handled_by_id])


class Sale(Base):
    """Produce sold to a buyer, priced per kg at the time of the sale, like a delivery (BR 3)."""

    __tablename__ = "sales"
    __table_args__ = (UniqueConstraint("cooperative_id", "client_id", name="uq_sales_client"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("buyer_orders.id"), nullable=True)
    buyer_name: Mapped[str] = mapped_column(String(150))
    buyer_phone: Mapped[str] = mapped_column(String(20))
    produce_id: Mapped[int] = mapped_column(ForeignKey("produce_types.id"))
    grade: Mapped[str] = mapped_column(String(2))
    weight_grams: Mapped[int] = mapped_column(Integer)
    price_per_kg: Mapped[int] = mapped_column(Integer)
    value: Mapped[int] = mapped_column(Integer)
    sale_date: Mapped[date] = mapped_column(Date)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    produce: Mapped[ProduceType] = relationship()
    recorded_by: Mapped[User] = relationship(foreign_keys=[recorded_by_id])
    voided_by: Mapped[User | None] = relationship(foreign_keys=[voided_by_id])


class BuyerPayment(Base):
    """Money a buyer paid for a sale. A Clerk records it as pending. A Payment Officer confirms or rejects it.
    Only confirmed payments count towards what the buyer has paid."""

    __tablename__ = "buyer_payments"
    __table_args__ = (UniqueConstraint("cooperative_id", "client_id", name="uq_buyer_payments_client"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperative_id: Mapped[int] = mapped_column(ForeignKey("cooperatives.id"), index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(10))
    reference: Mapped[str] = mapped_column(String(60), default="")
    payment_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default=BUYER_PAY_PENDING)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    sale: Mapped[Sale] = relationship()
    recorded_by: Mapped[User] = relationship(foreign_keys=[recorded_by_id])
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id])


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
