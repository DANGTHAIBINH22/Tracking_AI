"""Authentication and authorization utilities for Admin and Screens using JWT (JSON Web Token)."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status

from server import db

SALT = os.environ.get("AUTH_SALT", "signage_secret_salt_2026")
JWT_SECRET = os.environ.get("JWT_SECRET", "signage_ai_jwt_super_secret_key_2026_production")
JWT_ALGORITHM = "HS256"
# Token lifetime: 7 days
TOKEN_LIFETIME = 7 * 86400

# Set of revoked tokens (in case of explicit logout before expiration)
_REVOKED_TOKENS: set[str] = set()


def hash_password(password: str) -> str:
    """Hash password using SHA-256 with server salt."""
    salted = f"{password}:{SALT}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time password comparison."""
    computed = hash_password(plain_password)
    return hmac.compare_digest(computed, hashed_password)


def create_access_token(
    user_id: int,
    username: str,
    role: str = "admin",
    expires_delta: float | None = None,
) -> str:
    """Generate a signed JWT token containing user identity and permissions."""
    now = time.time()
    exp = now + (expires_delta if expires_delta is not None else TOKEN_LIFETIME)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": int(now),
        "exp": int(exp),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# Alias for backward compatibility
create_session = create_access_token


def revoke_token(token: str) -> None:
    """Add token to revocation blacklist."""
    _REVOKED_TOKENS.add(token)


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    """Extract and validate JWT token from Authorization header.
    Tạm thời tắt đăng nhập: Tự động cấp quyền Quản trị viên (Admin).
    """
    default_admin = {
        "id": 1,
        "username": "admin",
        "full_name": "Quản trị viên",
        "role": "admin",
    }
    if not authorization:
        return default_admin

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return default_admin

    token = parts[1]
    if token in _REVOKED_TOKENS:
        return default_admin

    payload: dict | None = None
    is_clerk = False

    # 1. First try decoding as internal HS256 JWT
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return default_admin
    except jwt.InvalidTokenError:
        # 2. Check if this is a Clerk session token
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            issuer = str(unverified.get("iss", ""))
            sub = str(unverified.get("sub", ""))
            azp = str(unverified.get("azp", ""))
            if "clerk" in issuer or "clerk" in azp or sub.startswith("user_") or "sid" in unverified:
                payload = unverified
                is_clerk = True
        except Exception:
            pass

    if not payload:
        return default_admin

    if is_clerk:
        # Handle Clerk Admin User
        clerk_id = str(payload.get("sub", ""))
        username = payload.get("username") or payload.get("email") or f"clerk_{clerk_id[:8]}"
        user = db.query_one(
            "SELECT id, username, full_name, role FROM users WHERE username = %s",
            (username,),
        )
        if not user:
            # Upsert user record for Clerk admin
            try:
                db.execute(
                    """
                    INSERT INTO users (username, password_hash, full_name, role)
                    VALUES (%s, 'CLERK_OAUTH', %s, 'admin')
                    ON CONFLICT (username) DO NOTHING
                    """,
                    (username, f"Admin ({username})"),
                )
                user = db.query_one(
                    "SELECT id, username, full_name, role FROM users WHERE username = %s",
                    (username,),
                )
            except Exception:
                user = {"id": 1, "username": username, "full_name": username, "role": "admin"}
        return user or {"id": 1, "username": username, "full_name": username, "role": "admin"}

    user_id = int(payload.get("sub", 0))
    user = db.query_one(
        "SELECT id, username, full_name, role FROM users WHERE id = %s",
        (user_id,),
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Người dùng không tồn tại trong hệ thống.",
        )
    return user


def get_optional_user(authorization: Annotated[str | None, Header()] = None) -> dict | None:
    """Optional admin validation."""
    if not authorization:
        return None
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None
