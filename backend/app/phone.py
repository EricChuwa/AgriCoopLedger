import re

# Rwandan mobile numbers: 07X XXX XXX (MTN 78 and 79, Airtel 72 and 73).
# Must stay in step with frontend/src/lib/validation.js.
_MOBILE = re.compile(r"7[2389][0-9]{7}")  # 0-9 only, not digits of other scripts


def normalize_phone(value: str) -> str:
    """Return the number as +2507XXXXXXXX, or raise ValueError if it is not a Rwandan mobile number."""
    digits = re.sub(r"[\s-]", "", value)
    digits = re.sub(r"^(\+?250|0)", "", digits)
    if not _MOBILE.fullmatch(digits):
        raise ValueError("Enter a Rwandan mobile number, for example 788 123 456.")
    return f"+250{digits}"
