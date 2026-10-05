"""Admin authentication: password hashing, JWT sessions, and the route guards.

Two guards, used as FastAPI dependencies:
  - `get_current_user` — any signed-in, active account.
  - `require_admin`    — an account whose role is "admin" (account management).

Every request re-reads the user row rather than trusting the token's claims, so
deleting an account, disabling it or demoting it takes effect on its next
request instead of when its 7-day token happens to expire. Changing a password
does the same for sessions opened before the change (`password_changed_at`).
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status

from server import db

ROLES = ("admin", "operator")
MIN_PASSWORD_LENGTH = 8

JWT_ALGORITHM = "HS256"
TOKEN_LIFETIME = 7 * 86400

_PBKDF2_ITERATIONS = 390_000
_PBKDF2_PREFIX = "pbkdf2_sha256"

# Hashes written before per-user salts: sha256(password + ":" + this salt).
# Still accepted so existing accounts can sign in; login rewrites them as PBKDF2.
_LEGACY_SALT = os.environ.get("AUTH_SALT", "signage_secret_salt_2026")

# Tokens logged out before they expired. In memory only: a restart forgets it,
# which is acceptable for a 7-day admin session on a single API process.
_REVOKED_TOKENS: set[str] = set()

_jwt_secret: str | None = None


# ---------- passwords ----------


def hash_password(password: str) -> str:
    """PBKDF2-SHA256 with a random per-password salt, self-describing format."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), _PBKDF2_ITERATIONS)
    return f"{_PBKDF2_PREFIX}${_PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time check against either the PBKDF2 or the legacy format."""
    if hashed_password.startswith(_PBKDF2_PREFIX + "$"):
        try:
            _, iterations, salt, expected = hashed_password.split("$", 3)
            digest = hashlib.pbkdf2_hmac(
                "sha256", plain_password.encode("utf-8"), salt.encode("ascii"), int(iterations)
            )
        except ValueError:
            return False
        return hmac.compare_digest(digest.hex(), expected)
    legacy = hashlib.sha256(f"{plain_password}:{_LEGACY_SALT}".encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy, hashed_password)


def needs_rehash(hashed_password: str) -> bool:
    return not hashed_password.startswith(f"{_PBKDF2_PREFIX}${_PBKDF2_ITERATIONS}$")


def validate_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mật khẩu phải có ít nhất {MIN_PASSWORD_LENGTH} ký tự.",
        )


# ---------- tokens ----------


def _secret() -> str:
    """JWT signing key: JWT_SECRET from the environment, else one kept in the DB.

    The key used to be a literal in this file, i.e. published with the repo —
    anyone could mint an admin token. Generating one per process would log
    every admin out on each restart (and on every `--reload`), so it is
    generated once and stored in app_state, which only the server can read.
    """
    global _jwt_secret
    if _jwt_secret is None:
        env = os.environ.get("JWT_SECRET", "").strip()
        if env:
            _jwt_secret = env
        else:
            db.execute(
                "INSERT INTO app_state (key, value) VALUES ('jwt_secret', %s) ON CONFLICT (key) DO NOTHING",
                (secrets.token_urlsafe(48),),
            )
            row = db.query_one("SELECT value FROM app_state WHERE key = 'jwt_secret'")
            _jwt_secret = row["value"]
    return _jwt_secret


def create_access_token(user_id: int, username: str, role: str = "admin") -> str:
    now = time.time()
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": now,
        "exp": int(now + TOKEN_LIFETIME),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def revoke_token(token: str) -> None:
    _REVOKED_TOKENS.add(token)


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


# ---------- guards ----------


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    """The signed-in account behind the Bearer token, or 401."""
    token = bearer_token(authorization)
    if token is None:
        raise _unauthorized("Vui lòng đăng nhập để tiếp tục.")
    if token in _REVOKED_TOKENS:
        raise _unauthorized("Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _unauthorized("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.")

    user = db.query_one(
        """SELECT id, username, full_name, role, is_active, created_at, last_login,
                  password_changed_at
           FROM users WHERE id = %s""",
        (user_id,),
    )
    if user is None or not user["is_active"]:
        raise _unauthorized("Tài khoản không tồn tại hoặc đã bị khóa.")
    if (user["password_changed_at"] or 0) > float(payload.get("iat", 0)):
        raise _unauthorized("Mật khẩu đã được đổi. Vui lòng đăng nhập lại.")
    return user


def require_admin(user: Annotated[dict, Depends(get_current_user)]) -> dict:
    if user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ quản trị viên mới có quyền thực hiện thao tác này.",
        )
    return user


def get_optional_user(authorization: Annotated[str | None, Header()] = None) -> dict | None:
    """The signed-in account if a valid token came with the request, else None.

    For endpoints a paired screen also calls without an admin session (capture
    start), where a session only decides who owns what gets created.
    """
    if bearer_token(authorization) is None:
        return None
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None


# ---------- ownership ----------
#
# creatives, playlists, screens and tracking_sessions each carry a user_id.
# Admins see and manage every row; everyone else only their own. Someone else's
# row answers 404, not 403, so ids cannot be probed for what exists.


def is_admin(user: dict) -> bool:
    return user.get("role") == "admin"


def scope(user: dict, column: str = "user_id") -> tuple[str, tuple]:
    """SQL condition (and its params) limiting a query to rows `user` may see."""
    if is_admin(user):
        return "TRUE", ()
    return f"{column} = %s", (user["id"],)


def fetch_owned(table: str, row_id: int, user: dict, not_found: str) -> dict:
    """SELECT * of one row the user may manage, or 404."""
    cond, params = scope(user)
    row = db.query_one(f"SELECT * FROM {table} WHERE id = %s AND {cond}", (row_id, *params))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found)
    return row
