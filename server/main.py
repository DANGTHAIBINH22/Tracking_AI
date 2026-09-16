"""FastAPI entrypoint.

    uv run uvicorn server.main:app --reload --port 8000

Serves three things: the creative library (/media), the JSON API the Next.js app
talks to, and an MJPEG debug feed of what the camera is actually seeing.
"""

from __future__ import annotations

import warnings

warnings.filterwarnings("ignore")

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server import db
from server.routes import ads, analytics, auth, capture, ingest, live_ws, player, playlists, screens, sessions
from server.settings import MEDIA_DIR, SETTINGS
from server.state import ENGINE, PLAYER


@asynccontextmanager
async def lifespan(app: FastAPI):
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    db.init_db()
    PLAYER.load_state()
    ENGINE.set_event_loop(asyncio.get_running_loop())
    yield
    # Both own OS resources (a camera handle, a thread) that a reload would leak.
    ENGINE.stop()
    PLAYER.stop()
    db.close_db()


app = FastAPI(
    title="Retail Signage Analytics",
    version="0.1.0",
    description="Ad playout + audience counting on top of the standalone CV pipeline.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(SETTINGS.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(screens.router)
app.include_router(ads.router)
app.include_router(playlists.router)
app.include_router(player.router)
app.include_router(capture.router)
app.include_router(analytics.router)
app.include_router(live_ws.router)
app.include_router(ingest.router)
app.include_router(sessions.router)

MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")


@app.get("/api/health")
def health() -> dict:
    from configs import CFG
    return {
        "ok": True,
        "device": CFG.device,
        "face_weights": str(CFG.face_weights),
        "face_weights_present": CFG.face_weights.exists(),
        "age_model_present": CFG.mivolo_weights.exists() or CFG.mivolo_ckpt.exists(),
        "vlm_enabled": CFG.vlm_enabled,
    }
