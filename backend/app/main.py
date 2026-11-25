import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import models  # noqa: F401  (registers the tables on Base)
from app.config import COOKIE_SECURE, SECRET_KEY, SESSION_MAX_AGE_SECONDS
from app.database import Base, engine
from app.routers import audit, auth, batches, cooperative, corrections, buyers, deliveries, disputes, farmers, payments, produce, public, reports, users


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

for module in (auth, users, cooperative, farmers, produce, deliveries, corrections, disputes, buyers, payments, batches, audit, reports, public):
    app.include_router(module.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Hosted single-service deployment (Render): when the built React app is present, serve it from the same
# origin as the API, so the session cookie works without any cross-site settings. In development the
# folder does not exist and Vite serves the frontend instead.
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parent.parent / "static")).resolve()
if (STATIC_DIR / "index.html").is_file():
    if (STATIC_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        target = (STATIC_DIR / path).resolve()
        if path and target.is_file() and STATIC_DIR in target.parents:
            return FileResponse(target)
        return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})
