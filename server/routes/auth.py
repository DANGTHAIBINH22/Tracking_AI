"""Authentication endpoints for Admin login, logout and session verification."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status

from server import db
from server.auth import (
    create_access_token,
    get_current_user,
    revoke_token,
    verify_password,
)
from server.schemas import TokenResponse, UserLogin, UserPublic

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin) -> TokenResponse:
    user = db.query_one(
        "SELECT id, username, password_hash, full_name, role FROM users WHERE username = %s",
        (body.username.strip(),),
    )
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác.",
        )

    token = create_access_token(user["id"], user["username"], user["role"])
    return TokenResponse(
        access_token=token,
        token_type="Bearer",
        user=UserPublic(
            id=user["id"],
            username=user["username"],
            full_name=user["full_name"],
            role=user["role"],
        ),
    )


@router.get("/me", response_model=UserPublic)
def get_me(user: Annotated[dict, Depends(get_current_user)]) -> UserPublic:
    return UserPublic(
        id=user["id"],
        username=user["username"],
        full_name=user["full_name"],
        role=user["role"],
    )


@router.post("/logout")
def logout(authorization: Annotated[str | None, Header()] = None) -> dict:
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            revoke_token(parts[1])
    return {"ok": True}
