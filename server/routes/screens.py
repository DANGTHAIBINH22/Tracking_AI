"""Digital Signage Screen Management & Pairing Code flow endpoints."""

from __future__ import annotations

import random
import secrets
import string
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from server import db
from server.auth import get_current_user
from server.schemas import (
    ScreenPairRequest,
    ScreenPublic,
    ScreenRegisterResponse,
    ScreenStatusResponse,
)

router = APIRouter(prefix="/api/screens", tags=["screens"])

# Clean character set omitting confusing glyphs (0/O, 1/I/L)
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LIFETIME = 15 * 60  # 15 minutes


def _generate_code() -> str:
    part1 = "".join(random.choices(CODE_CHARS, k=3))
    part2 = "".join(random.choices(CODE_CHARS, k=3))
    return f"{part1}-{part2}"


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
        code = f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"

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
        "SELECT id, name, location, status FROM screens WHERE screen_token = %s",
        (token.strip(),),
    )
    if not row or row["status"] != "paired":
        return {"valid": False, "status": row["status"] if row else "not_found"}

    db.execute("UPDATE screens SET last_seen = %s WHERE id = %s", (now, row["id"]))
    return {"valid": True, "name": row["name"], "location": row["location"]}


# ---------- Admin Endpoints ----------


@router.get("", response_model=list[ScreenPublic])
def list_screens() -> list[ScreenPublic]:
    """List all registered screens."""
    rows = db.query("SELECT * FROM screens ORDER BY id DESC")
    return [
        ScreenPublic(
            id=r["id"],
            name=r["name"],
            location=r["location"],
            status=r["status"],
            pairing_code=r["pairing_code"],
            last_seen=r["last_seen"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post("/pair", response_model=ScreenPublic)
def pair_screen(body: ScreenPairRequest) -> ScreenPublic:
    """Admin enters pairing code displayed on the TV to authorize the screen."""
    norm = _normalize_code(body.pairing_code)
    now = time.time()

    row = db.query_one(
        "SELECT id, status, code_expires FROM screens WHERE REPLACE(pairing_code, '-', '') = %s ORDER BY id DESC LIMIT 1",
        (norm,),
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy màn hình với mã kết nối '{body.pairing_code}'. Vui lòng kiểm tra lại mã trên màn hình TV.",
        )

    if row["code_expires"] < now and row["status"] != "paired":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã kết nối này đã hết hạn. Hãy bấm 'Làm mới mã' trên màn hình TV.",
        )

    screen_token = secrets.token_urlsafe(32)
    name = body.name.strip() if body.name.strip() else "Màn hình TV"
    location = body.location.strip() if body.location else None

    db.execute(
        """UPDATE screens
           SET screen_token = %s, name = %s, location = %s, status = 'paired', last_seen = %s
           WHERE id = %s""",
        (screen_token, name, location, now, row["id"]),
    )

    updated = db.query_one("SELECT * FROM screens WHERE id = %s", (row["id"],))
    return ScreenPublic(
        id=updated["id"],
        name=updated["name"],
        location=updated["location"],
        status=updated["status"],
        pairing_code=updated["pairing_code"],
        last_seen=updated["last_seen"],
        created_at=updated["created_at"],
    )


@router.delete("/{screen_id}")
def delete_screen(screen_id: int) -> dict:
    """Revoke or delete a screen."""
    db.execute("DELETE FROM screens WHERE id = %s", (screen_id,))
    return {"ok": True, "deleted_id": screen_id}
