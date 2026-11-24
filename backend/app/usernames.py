"""Usernames (FR 1.1): lower case letters, digits, dot, dash and underscore, 3 to 30 characters."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User

_VALID = re.compile(r"[a-z0-9._-]{3,30}")


def normalize_username(value: str) -> str:
    """Trim and lower-case a username, or raise ValueError if it is not allowed."""
    name = value.strip().lower()
    if not _VALID.fullmatch(name):
        raise ValueError("A username has 3 to 30 characters: letters, digits, dot, dash or underscore.")
    return name


def suggest_username(db: Session, full_name: str) -> str:
    """A free username built from a person's name, for when none was given: 'Aline Uwase' -> 'aline.uwase'."""
    words = re.sub(r"[^a-z0-9 ]", "", full_name.lower()).split()
    base = ".".join(words[:2]) or "user"
    base = base[:24].strip(".") or "user"
    if len(base) < 3:
        base = base + "user"
    candidate, n = base, 1
    while db.scalar(select(User.id).where(User.username == candidate)):
        n += 1
        candidate = f"{base}{n}"
    return candidate
