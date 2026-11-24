import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StrictBool, StrictInt, field_validator

from app.phone import normalize_phone
from app.usernames import normalize_username

Role = Literal["manager", "clerk", "payment_officer"]
Grade = Literal["A", "B", "C"]
Method = Literal["cash", "momo"]

MAX_KG = Decimal("100000")
MAX_RWF = 2_000_000_000

# ---------- what the API accepts ----------
# Every request body is checked three ways: the JSON type must be the right one (a number is not "true" and not
# the text "1000"), only the listed fields may be present, and text must match a pattern for its kind.
# Digits are always 0-9 written out: `\d` would also match digits from other scripts.

_PERSON = re.compile(r"[^\W\d_](?:[^\W\d_]|[ .'\u2019-])*")            # letters, space, . ' -
_PLACE = re.compile(r"[^\W_](?:[^\W_]|[ .,'\u2019()/&-])*")             # letters and digits, space, . , ' ( ) / & -
_REFERENCE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/#-]*")                 # a mobile money transaction reference
_CLIENT_ID = re.compile(r"[A-Za-z0-9-]{8,64}")
_ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_KG = re.compile(r"[0-9]{1,6}(?:\.[0-9]{1,3})?")


class Body(BaseModel):
    """Base for everything a client sends. Unknown fields are refused instead of silently ignored."""

    model_config = ConfigDict(extra="forbid")


def _one_line(v: str, rx: re.Pattern, what: str, min_len: int, max_len: int, rule: str) -> str:
    v = " ".join(v.split())
    if not min_len <= len(v) <= max_len:
        raise ValueError(f"{what} must be {min_len} to {max_len} characters.")
    if not rx.fullmatch(v):
        raise ValueError(f"{what} can only use {rule}.")
    return v


def person_name(v: str, what: str = "A name") -> str:
    return _one_line(v, _PERSON, what, 2, 150, "letters, spaces, apostrophes, dots and hyphens")


def place_name(v: str, what: str = "This") -> str:
    return _one_line(v, _PLACE, what, 2, 150, "letters, digits, spaces and . , ' ( ) / & -")


def free_text(v: str, what: str = "This") -> str:
    """Reasons and notes: any characters except control codes (a line break is fine)."""
    v = v.strip()
    if any(unicodedata.category(c).startswith("C") and c not in "\n\t" for c in v):
        raise ValueError(f"{what} contains characters that are not allowed.")
    return v


def normalize_national_id(value: str) -> str:
    """A Rwandan national ID is 16 digits, 0-9 only. Spaces and dashes are ignored."""
    digits = re.sub(r"[\s-]", "", value)
    if not re.fullmatch(r"[0-9]{16}", digits):
        raise ValueError("A national ID has 16 digits.")
    return digits


def _iso_date(v):
    """A date must arrive as the text YYYY-MM-DD. A number (which would be read as a timestamp) is refused."""
    if v is None:
        return None
    if not isinstance(v, str) or not _ISO_DATE.fullmatch(v):
        raise ValueError("Write the date as YYYY-MM-DD.")
    return v


IsoDate = Annotated[date | None, BeforeValidator(_iso_date)]   # optional in every place it is used


def _kg_in(v):
    """A weight is a plain decimal number with at most three decimals. No exponents, no NaN, no true/false."""
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        raise ValueError("Enter the weight as a number of kilograms.")
    text = format(Decimal(str(v)), "f") if not isinstance(v, str) else v.strip()
    if not _KG.fullmatch(text):
        raise ValueError("Enter the weight as a number, for example 12.5, with at most three decimals.")
    return Decimal(text)


Kg = Annotated[Decimal, BeforeValidator(_kg_in)]
OptKg = Annotated[Decimal | None, BeforeValidator(_kg_in)]

# Whole numbers only: JSON true/false, "1000" and 12.0 are not accepted.
Id = Annotated[StrictInt, Field(ge=1)]
Rwf = Annotated[StrictInt, Field(gt=0, le=MAX_RWF)]
PricePerKg = Annotated[StrictInt, Field(gt=0, le=1_000_000)]


def _kg(v: Decimal) -> Decimal:
    if v <= 0:
        raise ValueError("Weight must be more than 0.")
    if v > MAX_KG:
        raise ValueError("That is more than 100,000 kg. Check the weight.")
    return v


def _client_id(v: str | None) -> str | None:
    if v is not None and not _CLIENT_ID.fullmatch(v):
        raise ValueError("The submission id must be 8 to 64 letters, digits or dashes.")
    return v


def _password(v: str) -> str:
    if any(unicodedata.category(c).startswith("C") for c in v):
        raise ValueError("A password cannot contain control characters.")
    return v


# ---------- auth and staff ----------

class RegisterIn(Body):
    full_name: str
    username: str | None = None
    phone: str
    # A new name starts a cooperative and makes the person its Manager. A name that already exists sends a
    # request to that cooperative's Manager instead.
    cooperative_name: str
    # What the person is signing up as. "manager" starts a new cooperative (its name must be unused). "clerk" and
    # "payment_officer" ask to join an existing one, and its Manager approves (and may change) the role.
    # Left out, the name alone decides, as before.
    account_type: Literal["manager", "clerk", "payment_officer"] | None = None
    password: str = Field(min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return person_name(v, "Your name")

    @field_validator("cooperative_name")
    @classmethod
    def check_coop(cls, v: str) -> str:
        return place_name(v, "The cooperative name")

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return normalize_phone(v)

    @field_validator("username")
    @classmethod
    def check_username(cls, v: str | None) -> str | None:
        return None if not v or not v.strip() else normalize_username(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _password(v)


class LoginIn(Body):
    # A username, or the phone number the account was created with.
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    full_name: str
    username: str
    phone: str
    role: str
    cooperative_id: int
    cooperative_name: str
    approval: str = "approved"  # "pending" right after asking to join an existing cooperative


class ChangePasswordIn(Body):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _password(v)


class StaffOut(BaseModel):
    id: int
    full_name: str
    username: str
    phone: str
    role: str
    is_active: bool
    approval: str = "approved"


class StaffCreateIn(Body):
    full_name: str
    username: str | None = None
    phone: str
    role: Role
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return person_name(v, "The name")

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return normalize_phone(v)

    @field_validator("username")
    @classmethod
    def check_username(cls, v: str | None) -> str | None:
        return None if not v or not v.strip() else normalize_username(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str | None) -> str | None:
        return None if v is None else _password(v)


class StaffUpdateIn(Body):
    full_name: str | None = None
    username: str | None = None
    phone: str | None = None
    role: Role | None = None
    is_active: StrictBool | None = None

    @field_validator("full_name")
    @classmethod
    def check_name(cls, v: str | None) -> str | None:
        return None if v is None else person_name(v, "The name")

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return None if v is None else normalize_phone(v)

    @field_validator("username")
    @classmethod
    def check_username(cls, v: str | None) -> str | None:
        return None if v is None else normalize_username(v)


class ApproveIn(Body):
    role: Role  # the Manager decides the role when letting someone in


class StaffCreatedOut(StaffOut):
    temp_password: str


class TempPasswordOut(BaseModel):
    temp_password: str


class CooperativeOut(BaseModel):
    id: int
    name: str
    district: str
    phone: str


class CooperativeUpdateIn(Body):
    name: str
    district: str = Field(default="", max_length=100)
    phone: str = ""

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return place_name(v, "The cooperative name")

    @field_validator("district")
    @classmethod
    def check_district(cls, v: str) -> str:
        return place_name(v, "The district") if v.strip() else ""

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return normalize_phone(v) if v.strip() else ""


# ---------- farmers ----------

class FarmerIn(Body):
    full_name: str
    national_id: str
    phone: str = ""
    village: str = Field(default="", max_length=100)
    member_since: IsoDate = None

    @field_validator("full_name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return person_name(v, "The name")

    @field_validator("national_id")
    @classmethod
    def check_id(cls, v: str) -> str:
        return normalize_national_id(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return normalize_phone(v) if v.strip() else ""

    @field_validator("village")
    @classmethod
    def check_village(cls, v: str) -> str:
        return place_name(v, "The village") if v.strip() else ""


class FarmerOut(BaseModel):
    id: int
    full_name: str
    national_id: str
    phone: str
    village: str
    member_since: date
    is_active: bool
    balance: int
    last_delivery_date: date | None = None


# ---------- produce and prices ----------

class PriceIn(Body):
    grade: Grade
    price_per_kg: PricePerKg
    effective_from: IsoDate = None


class PriceOut(BaseModel):
    id: int
    grade: str
    price_per_kg: int
    effective_from: date
    set_by: str


class ProduceIn(Body):
    name: str
    prices: list[PriceIn] = Field(min_length=1, max_length=3)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return place_name(v, "The produce name")


class ProduceUpdateIn(Body):
    name: str | None = None
    is_active: StrictBool | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str | None) -> str | None:
        return None if v is None else place_name(v, "The produce name")


class ProduceOut(BaseModel):
    id: int
    name: str
    is_active: bool
    prices: list[PriceOut]  # every price ever set, newest first (FR 3.3)


# ---------- deliveries and corrections ----------

class DeliveryIn(Body):
    farmer_id: Id
    produce_id: Id
    grade: Grade
    weight_kg: Kg
    delivery_date: IsoDate = None
    # A random id the browser makes once per form submission. Sending it twice never records twice.
    client_id: str | None = Field(default=None, min_length=8, max_length=64)

    @field_validator("weight_kg")
    @classmethod
    def check_weight(cls, v: Decimal) -> Decimal:
        return _kg(v)

    @field_validator("client_id")
    @classmethod
    def check_client_id(cls, v: str | None) -> str | None:
        return _client_id(v)


class Reason(Body):
    reason: str = Field(min_length=5, max_length=500)

    @field_validator("reason")
    @classmethod
    def check_reason(cls, v: str) -> str:
        v = free_text(v, "The reason")
        if len(v) < 5:
            raise ValueError("Give a reason of at least 5 characters.")
        return v


class CorrectIn(Reason):
    weight_kg: OptKg = None
    grade: Grade | None = None

    @field_validator("weight_kg")
    @classmethod
    def check_weight(cls, v: Decimal | None) -> Decimal | None:
        return None if v is None else _kg(v)


class CorrectionRequestIn(CorrectIn):
    delivery_id: Id


class DecisionIn(Body):
    note: str = Field(default="", max_length=500)

    @field_validator("note")
    @classmethod
    def check_note(cls, v: str) -> str:
        return free_text(v, "The note")


class VoidInfo(BaseModel):
    by: str
    reason: str
    at: datetime


class DeliveryOut(BaseModel):
    id: int
    receipt_no: str
    farmer_id: int
    farmer_name: str
    produce_id: int
    produce_name: str
    grade: str
    weight_kg: float
    price_per_kg: int
    value: int
    delivery_date: date
    recorded_by: str
    created_at: datetime
    voided: VoidInfo | None
    corrected: bool
    pending_correction: bool


class CorrectionOut(BaseModel):
    id: int
    delivery_id: int
    receipt_no: str
    farmer_name: str
    produce_name: str
    status: str
    reason: str
    requested_by: str
    created_at: datetime
    # The delivery as it was, and as it will be or now is.
    old_weight_kg: float | None
    old_grade: str | None
    old_value: int | None
    new_weight_kg: float | None
    new_grade: str | None
    new_value: int | None
    decided_by: str | None
    decided_at: datetime | None
    decision_note: str | None


# ---------- payments ----------

class PaymentIn(Body):
    farmer_id: Id
    amount: Rwf
    method: Method
    reference: str = Field(default="", max_length=60)
    payment_date: IsoDate = None
    client_id: str | None = Field(default=None, min_length=8, max_length=64)

    @field_validator("reference")
    @classmethod
    def check_reference(cls, v: str) -> str:
        v = v.strip()
        if v and not _REFERENCE.fullmatch(v):
            raise ValueError("A reference can only use letters, digits and . _ / # -")
        return v

    @field_validator("client_id")
    @classmethod
    def check_client_id(cls, v: str | None) -> str | None:
        return _client_id(v)


class PaymentOut(BaseModel):
    id: int
    receipt_no: str
    farmer_id: int
    farmer_name: str
    amount: int
    method: str
    reference: str
    payment_date: date
    recorded_by: str
    created_at: datetime
    voided: VoidInfo | None


# ---------- paged lists, statements, reports, dashboard ----------

class DeliveryPage(BaseModel):
    items: list[DeliveryOut]
    total: int  # rows matching the filters, voided included
    page: int
    page_size: int
    live_count: int  # the figures below ignore voided rows, across every page of the filter
    live_kg: float
    live_value: int


class PaymentPage(BaseModel):
    items: list[PaymentOut]
    total: int
    page: int
    page_size: int
    live_count: int
    live_amount: int


class StatementRow(BaseModel):
    key: str
    date: date
    kind: int  # 0 delivery, 1 payment
    id: int
    receipt: str
    description: str
    owed: int
    paid: int
    balance: int


class StatementOut(BaseModel):
    rows: list[StatementRow]
    opening: int
    balance: int
    voided_count: int
    show_opening: bool
    delivered_kg: float  # whole history, live entries only
    delivered_value: int
    paid_total: int
    payment_count: int


class SummaryProduceRow(BaseModel):
    key: str
    name: str
    count: int
    kg: float
    value: int


class SummaryFarmerRow(BaseModel):
    id: int
    name: str
    kg: float
    delivered: int
    paid: int
    owed_now: int


class SummaryOut(BaseModel):
    deliveries: int
    kg: float
    delivered: int
    paid: int
    by_produce: list[SummaryProduceRow]
    by_farmer: list[SummaryFarmerRow]


class WeekDay(BaseModel):
    date: date
    kg: float


class ProduceShare(BaseModel):
    name: str
    kg: float


class ProduceMixOut(BaseModel):
    period: str
    label: str
    date_from: date
    date_to: date
    total_kg: float
    items: list[ProduceShare]


class LargestBalance(BaseModel):
    id: int
    name: str
    owed: int


class DashboardOut(BaseModel):
    total_owed: int
    farmers_owed: int
    delivered_today_kg: float
    deliveries_today: int
    paid_today: int
    farmers_this_week: int
    pending_corrections: int
    week: list[WeekDay]
    produce_week: list[ProduceShare] = []
    largest_balances: list[LargestBalance]
    recent_deliveries: list[DeliveryOut]
    recent_payments: list[PaymentOut]


# ---------- audit ----------

class AuditOut(BaseModel):
    id: int
    user_name: str
    action: str
    entity_type: str
    entity_id: int
    summary: str
    created_at: datetime


class PublicStatsOut(BaseModel):
    """Counts across every cooperative, for the landing page. Totals only, nothing about a person."""
    cooperatives: int
    farmers: int
    deliveries: int
    total_kg: float
