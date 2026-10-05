"""Playback control + what the screen should render right now."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from server import db
from server.auth import fetch_owned, get_current_user, is_admin
from server.routes.ads import to_public
from server.schemas import NextUp, NowPlaying
from server.state import PLAYER

router = APIRouter(prefix="/api/player", tags=["player"])

# /now-playing stays public: paired screens read it without an admin session.
User = Annotated[dict, Depends(get_current_user)]


def _now_playing() -> NowPlaying:
    snap = PLAYER.snapshot()
    creative = snap.get("creative")
    nxt = PLAYER.peek_next() if snap["playing"] else None
    fit = PLAYER.current_fit() if snap["playing"] else None
    return NowPlaying(
        current_fit=round(fit, 1) if fit is not None else None,
        next_up=NextUp(
            creative=to_public(nxt["creative"]),
            mode=nxt["mode"],
            match_score=round(nxt["score"], 1) if nxt["score"] is not None else None,
        ) if nxt else None,
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
def start(_: User) -> NowPlaying:
    if not PLAYER.playlist():
        raise HTTPException(400, "Không có playlist nào đang kích hoạt hoặc playlist đang trống.")
    PLAYER.start()
    return _now_playing()


@router.post("/stop", response_model=NowPlaying)
def stop(_: User) -> NowPlaying:
    PLAYER.stop()
    return _now_playing()


@router.post("/skip", response_model=NowPlaying)
def skip(_: User) -> NowPlaying:
    PLAYER.skip()
    return _now_playing()


@router.post("/play/{creative_id}", response_model=NowPlaying)
def play_creative(creative_id: int, user: User) -> NowPlaying:
    row = fetch_owned("creatives", creative_id, user, "Không tìm thấy video/quảng cáo này.")
    # The screens showing the air right now are those of the active playlist's
    # owner. Cutting in someone else's advert would put it on their screens.
    active = db.query_one("SELECT user_id FROM playlists WHERE is_active = TRUE LIMIT 1")
    if active and active["user_id"] != row.get("user_id") and not is_admin(user):
        raise HTTPException(409, "Playlist đang phát thuộc tài khoản khác — không thể chen quảng cáo của bạn vào.")
    creative = PLAYER.play_creative(creative_id)
    if not creative:
        raise HTTPException(404, "Không tìm thấy video/quảng cáo này.")
    return _now_playing()
