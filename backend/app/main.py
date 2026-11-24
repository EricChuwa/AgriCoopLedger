from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app import models  # noqa: F401  (registers the tables on Base)
from app.config import COOKIE_SECURE, SECRET_KEY, SESSION_MAX_AGE_SECONDS
from app.database import Base, engine
from app.routers import audit, auth, cooperative, corrections, deliveries, farmers, payments, produce, public, reports, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates missing tables. Replace with Alembic migrations once the schema settles.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="AgriCoopLedger API", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="agricoop_session",
    max_age=SESSION_MAX_AGE_SECONDS,
    same_site="lax",
    https_only=COOKIE_SECURE,
)

for module in (auth, users, cooperative, farmers, produce, deliveries, corrections, payments, audit, reports, public):
    app.include_router(module.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
