"""Sign-in, sign-out, "who am I", and changing one's own password."""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status

from server import db
from server.auth import (
    bearer_token,
    create_access_token,
    get_current_user,
    hash_password,
    needs_rehash,
    revoke_token,
    validate_new_password,
    verify_password,
)
from server.schemas import PasswordChange, TokenResponse, UserLogin, UserPublic

router = APIRouter(prefix="/api/auth", tags=["auth"])

_BAD_CREDENTIALS = "Tên đăng nhập hoặc mật khẩu không chính xác."


def to_public(user: dict) -> UserPublic:
    return UserPublic(
        id=user["id"],
        username=user["username"],
        full_name=user["full_name"],
        role=user["role"],
        is_active=user.get("is_active", True),
        created_at=user.get("created_at"),
        last_login=user.get("last_login"),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin) -> TokenResponse:
    user = db.query_one(
        """SELECT id, username, password_hash, full_name, role, is_active, created_at
           FROM users WHERE username = %s""",
        (body.username.strip(),),
    )
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_BAD_CREDENTIALS)
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản này đã bị khóa. Liên hệ quản trị viên.",
        )

    now = time.time()
    # Upgrade a legacy unsalted hash now that we briefly hold the plain password.
    if needs_rehash(user["password_hash"]):
        db.execute(
            "UPDATE users SET password_hash = %s, last_login = %s WHERE id = %s",
            (hash_password(body.password), now, user["id"]),
        )
    else:
        db.execute("UPDATE users SET last_login = %s WHERE id = %s", (now, user["id"]))
    user["last_login"] = now

    token = create_access_token(user["id"], user["username"], user["role"])
    return TokenResponse(access_token=token, token_type="Bearer", user=to_public(user))


@router.get("/me", response_model=UserPublic)
def get_me(user: Annotated[dict, Depends(get_current_user)]) -> UserPublic:
    return to_public(user)


@router.post("/logout")
def logout(authorization: Annotated[str | None, Header()] = None) -> dict:
    token = bearer_token(authorization)
    if token:
        revoke_token(token)
    return {"ok": True}


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    body: PasswordChange,
    user: Annotated[dict, Depends(get_current_user)],
) -> TokenResponse:
    """Change one's own password. Other sessions are signed out; this one gets a new token."""
    row = db.query_one("SELECT password_hash FROM users WHERE id = %s", (user["id"],))
    if not row or not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng.")
    validate_new_password(body.new_password)

    db.execute(
        "UPDATE users SET password_hash = %s, password_changed_at = %s WHERE id = %s",
        (hash_password(body.new_password), time.time(), user["id"]),
    )
    token = create_access_token(user["id"], user["username"], user["role"])
    return TokenResponse(access_token=token, token_type="Bearer", user=to_public(user))
