"""Playback control + what the screen should render right now."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from server.routes.ads import to_public
from server.schemas import NowPlaying
from server.state import PLAYER

router = APIRouter(prefix="/api/player", tags=["player"])


def _now_playing() -> NowPlaying:
    snap = PLAYER.snapshot()
    creative = snap.get("creative")
    return NowPlaying(
        airing_id=snap["airing_id"],
        creative=to_public(creative) if creative else None,
        started_at=snap["started_at"],
        elapsed=snap["elapsed"],
        remaining=snap["remaining"],
        playing=snap["playing"],
    )


@router.get("/now-playing", response_model=NowPlaying)
def now_playing() -> NowPlaying:
    return _now_playing()


@router.post("/start", response_model=NowPlaying)
def start() -> NowPlaying:
    if not PLAYER.playlist():
        raise HTTPException(400, "Playlist trống — hãy tải lên ít nhất một quảng cáo đang bật.")
    PLAYER.start()
    return _now_playing()


@router.post("/stop", response_model=NowPlaying)
def stop() -> NowPlaying:
    PLAYER.stop()
    return _now_playing()


@router.post("/skip", response_model=NowPlaying)
def skip() -> NowPlaying:
    PLAYER.skip()
    return _now_playing()


@router.post("/play/{creative_id}", response_model=NowPlaying)
def play_creative(creative_id: int) -> NowPlaying:
    creative = PLAYER.play_creative(creative_id)
    if not creative:
        raise HTTPException(404, "Không tìm thấy video/quảng cáo này.")
    return _now_playing()
