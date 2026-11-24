import os

# Docker Compose sets DATABASE_URL to PostgreSQL. Running without Docker falls back to a local SQLite file.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agricoop.db")

# Signs the session cookie. Set a long random value in any real deployment.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")

# Set to "true" when serving over HTTPS so the cookie is only sent securely (NFR 12).
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

# The cookie itself may live for a working day, but the server ends a session after
# 15 minutes without a request (NFR 13).
SESSION_MAX_AGE_SECONDS = 60 * 60 * 12
SESSION_IDLE_SECONDS = int(os.getenv("SESSION_IDLE_SECONDS", str(15 * 60)))
