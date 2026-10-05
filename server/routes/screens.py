"""Digital Signage Screen Management & Pairing Code flow endpoints."""

from __future__ import annotations

import random
import secrets
import string
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from server import db
from server.auth import fetch_owned, get_current_user, scope
from server.schemas import (
    ScreenPairRequest,
    ScreenPublic,
    ScreenRegisterResponse,
    ScreenStatusResponse,
)

# The TV polls verify-token every few seconds, which stamps last_seen; a screen
# silent for longer than this is off, asleep or has lost the network.
SCREEN_ONLINE_SECONDS = 30.0

router = APIRouter(prefix="/api/screens", tags=["screens"])

# Clean character set omitting confusing glyphs (0/O, 1/I/L)
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LIFETIME = 15 * 60  # 15 minutes


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_CHARS) for _ in range(6))


def _normalize_code(code: str) -> str:
    return code.strip().upper().replace(" ", "").replace("-", "")


@router.post("/register-code", response_model=ScreenRegisterResponse)
def register_screen_code() -> ScreenRegisterResponse:
    """Called by an unactivated /player screen to obtain a pairing code."""
    now = time.time()
    expires_at = now + CODE_LIFETIME

    # Generate unique code
    for _ in range(10):
        code = _generate_code()
        norm = _normalize_code(code)
        existing = db.query_one(
            "SELECT id FROM screens WHERE REPLACE(pairing_code, '-', '') = %s AND code_expires > %s",
            (norm, now),
        )
        if not existing:
            break
    else:
        code = "".join(secrets.choice(CODE_CHARS) for _ in range(6))

    db.insert(
        """INSERT INTO screens (pairing_code, code_expires, status, created_at, last_seen)
           VALUES (%s, %s, 'pending', %s, %s) RETURNING id""",
        (code, expires_at, now, now),
    )

    return ScreenRegisterResponse(
        pairing_code=code,
        expires_in_seconds=CODE_LIFETIME,
        expires_at=expires_at,
    )


@router.get("/check-status", response_model=ScreenStatusResponse)
def check_screen_status(code: str = Query(...)) -> ScreenStatusResponse:
    """Polled by the /player screen to check if Admin has approved the pairing code."""
    norm = _normalize_code(code)
    now = time.time()

    row = db.query_one(
        "SELECT id, status, screen_token, name, location, code_expires FROM screens WHERE REPLACE(pairing_code, '-', '') = %s ORDER BY id DESC LIMIT 1",
        (norm,),
    )
    if not row:
        return ScreenStatusResponse(status="not_found")

    if row["code_expires"] < now and row["status"] == "pending":
        return ScreenStatusResponse(status="expired")

    # Update last_seen
    db.execute("UPDATE screens SET last_seen = %s WHERE id = %s", (now, row["id"]))

    return ScreenStatusResponse(
        status=row["status"],
        screen_token=row["screen_token"] if row["status"] == "paired" else None,
        name=row["name"],
        location=row["location"],
    )


@router.get("/verify-token")
def verify_screen_token(token: str = Query(...)) -> dict:
    """Verify that a screen token is valid and still authorized."""
    now = time.time()
    row = db.query_one(
        """SELECT s.id, s.name, s.location, s.status, s.playlist_id, s.user_id,
                  p.name AS playlist_name, COALESCE(p.is_active, FALSE) AS playlist_on_air,
                  COALESCE(u.full_name, u.username, 'Quản trị viên') AS account_name,
                  u.username AS account_username
           FROM screens s
           LEFT JOIN playlists p ON s.playlist_id = p.id
           LEFT JOIN users u ON s.user_id = u.id
           WHERE s.screen_token = %s""",
        (token.strip(),),
    )
    if not row or row["status"] != "paired":
        return {"valid": False, "status": row["status"] if row else "not_found"}

    db.execute("UPDATE screens SET last_seen = %s WHERE id = %s", (now, row["id"]))
    return {
        "valid": True,
        "id": row["id"],
        "name": row["name"],
        "location": row["location"],
        "playlist_id": row["playlist_id"],
        "playlist_name": row["playlist_name"],
        # Only one playlist is on air system-wide. A screen shows it only when
        # it is the playlist assigned to that screen; otherwise it idles, so an
        # account's screens never display another account's adverts.
        "on_air": bool(row["playlist_on_air"]),
        "user_id": row["user_id"],
        "account_name": row["account_name"],
        "account_username": row["account_username"],
    }


# ---------- Admin Endpoints ----------


@router.get("", response_model=list[ScreenPublic])
def list_screens(user: Annotated[dict, Depends(get_current_user)]) -> list[ScreenPublic]:
    """The screens this account manages (all of them, for an admin).

    Only paired screens: a pending row is a code reservation that the TV keeps
    alive by polling /check-status, so its last_seen would read as "Online"
    for a device nobody has connected yet.
    """
    cond, params = scope(user, "s.user_id")
    rows = db.query(
        """SELECT s.*, p.name AS playlist_name, COALESCE(p.is_active, FALSE) AS playlist_on_air,
                  COALESCE(u.full_name, u.username, 'Quản trị viên') AS account_name,
                  u.username AS account_username
           FROM screens s
           LEFT JOIN playlists p ON s.playlist_id = p.id
           LEFT JOIN users u ON s.user_id = u.id
           WHERE {cond} AND s.status = 'paired'
           ORDER BY s.id DESC""".format(cond=cond),
        params,
    )
    return [
        ScreenPublic(
            id=r["id"],
            name=r["name"],
            location=r["location"],
            status=r["status"],
            pairing_code=r["pairing_code"],
            last_seen=r["last_seen"],
            created_at=r["created_at"],
            playlist_id=r.get("playlist_id"),
            playlist_name=r.get("playlist_name"),
            playlist_on_air=bool(r.get("playlist_on_air")),
            online=bool(r["last_seen"] and time.time() - r["last_seen"] < SCREEN_ONLINE_SECONDS),
            user_id=r.get("user_id"),
            account_name=r.get("account_name"),
            account_username=r.get("account_username"),
        )
        for r in rows
    ]


@router.post("/pair", response_model=ScreenPublic)
def pair_screen(
    body: ScreenPairRequest,
    user: Annotated[dict, Depends(get_current_user)],
) -> ScreenPublic:
    """Admin enters pairing code displayed on the TV to authorize the screen."""
    norm = _normalize_code(body.pairing_code)
    now = time.time()

    row = db.query_one(
        "SELECT id, status, code_expires, user_id FROM screens WHERE REPLACE(pairing_code, '-', '') = %s ORDER BY id DESC LIMIT 1",
        (norm,),
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy màn hình với mã kết nối '{body.pairing_code}'. Vui lòng kiểm tra lại mã trên màn hình TV.",
        )

    # A paired screen keeps its old code, and that code never expires for it.
    # Without this, anyone who once saw the code could re-pair the screen and
    # take it over from the account that owns it.
    if row["status"] == "paired" and row["user_id"] not in (None, user["id"]) and user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Màn hình này đã được ghép với tài khoản khác.",
        )

    if row["code_expires"] < now and row["status"] != "paired":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã kết nối này đã hết hạn. Hãy bấm 'Làm mới mã' trên màn hình TV.",
        )

    screen_token = secrets.token_urlsafe(32)
    name = body.name.strip() if body.name.strip() else "Màn hình Kiosk"
    location = body.location.strip() if body.location else None
    user_id = user.get("id")

    db.execute(
        """UPDATE screens
           SET screen_token = %s, name = %s, location = %s, status = 'paired', last_seen = %s, user_id = %s
           WHERE id = %s""",
        (screen_token, name, location, now, user_id, row["id"]),
    )

    # A screen paired while this account has a playlist on air joins it at
    # once. Left unassigned, a new screen sat on its idle picture until someone
    # thought to publish the playlist again.
    active = db.query_one(
        "SELECT id FROM playlists WHERE is_active = TRUE AND user_id IS NOT DISTINCT FROM %s LIMIT 1",
        (user_id,),
    )
    if active:
        db.execute("UPDATE screens SET playlist_id = %s WHERE id = %s", (active["id"], row["id"]))

    updated = db.query_one(
        """SELECT s.*, p.name AS playlist_name, COALESCE(p.is_active, FALSE) AS playlist_on_air,
                  COALESCE(u.full_name, u.username, 'Quản trị viên') AS account_name,
                  u.username AS account_username
           FROM screens s
           LEFT JOIN playlists p ON s.playlist_id = p.id
           LEFT JOIN users u ON s.user_id = u.id
           WHERE s.id = %s""",
        (row["id"],),
    )
    return ScreenPublic(
        id=updated["id"],
        name=updated["name"],
        location=updated["location"],
        status=updated["status"],
        pairing_code=updated["pairing_code"],
        last_seen=updated["last_seen"],
        created_at=updated["created_at"],
        playlist_id=updated.get("playlist_id"),
        playlist_name=updated.get("playlist_name"),
        playlist_on_air=bool(updated.get("playlist_on_air")),
        online=True,
        user_id=updated.get("user_id"),
        account_name=updated.get("account_name"),
        account_username=updated.get("account_username"),
    )


@router.delete("/{screen_id}")
def delete_screen(screen_id: int, user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Revoke or delete a screen."""
    fetch_owned("screens", screen_id, user, "Không tìm thấy thiết bị.")
    db.execute("DELETE FROM screens WHERE id = %s", (screen_id,))
    return {"ok": True, "deleted_id": screen_id}
