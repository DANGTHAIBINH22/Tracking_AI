"""Account management for the /admin console. Every endpoint is admin-only.

Two invariants are enforced here rather than trusted to the UI:
  - an admin cannot lock, demote or delete their own account, and
  - the last active admin cannot be locked, demoted or deleted by anyone,
so no sequence of clicks can leave the system with nobody able to manage it.
"""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from server import db
from server.auth import ROLES, hash_password, require_admin, validate_new_password
from server.routes.auth import to_public
from server.schemas import UserCreate, UserPublic, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

_COLUMNS = "id, username, full_name, role, is_active, created_at, last_login"


def _get(user_id: int) -> dict:
    row = db.query_one(f"SELECT {_COLUMNS} FROM users WHERE id = %s", (user_id,))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản.")
    return row


def _check_role(role: str) -> None:
    if role not in ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vai trò không hợp lệ. Chọn một trong: {', '.join(ROLES)}.",
        )


def _is_last_active_admin(target: dict) -> bool:
    if target["role"] != "admin" or not target["is_active"]:
        return False
    row = db.query_one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active")
    return (row["n"] if row else 0) <= 1


def _forbid(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@router.get("", response_model=list[UserPublic])
def list_users(_: Annotated[dict, Depends(require_admin)]) -> list[UserPublic]:
    rows = db.query(f"SELECT {_COLUMNS} FROM users ORDER BY id")
    return [to_public(r) for r in rows]


@router.post("", response_model=UserPublic, status_code=201)
def create_user(body: UserCreate, _: Annotated[dict, Depends(require_admin)]) -> UserPublic:
    _check_role(body.role)
    validate_new_password(body.password)
    username = body.username.strip()
    if db.query_one("SELECT id FROM users WHERE username = %s", (username,)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Tên đăng nhập '{username}' đã tồn tại.")

    row = db.query_one(
        f"""INSERT INTO users (username, password_hash, full_name, role, created_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING {_COLUMNS}""",
        (username, hash_password(body.password), body.full_name.strip() or username, body.role, time.time()),
    )
    return to_public(row)


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    body: UserUpdate,
    admin: Annotated[dict, Depends(require_admin)],
) -> UserPublic:
    target = _get(user_id)
    is_self = target["id"] == admin["id"]
    demoting = body.role is not None and body.role != "admin"
    locking = body.is_active is False

    if body.role is not None:
        _check_role(body.role)
    if is_self and (demoting or locking):
        raise _forbid("Không thể tự khóa hoặc tự hạ quyền tài khoản đang đăng nhập.")
    if (demoting or locking) and _is_last_active_admin(target):
        raise _forbid("Đây là quản trị viên cuối cùng đang hoạt động — không thể khóa hoặc hạ quyền.")

    sets: list[str] = []
    params: list = []
    if body.full_name is not None:
        sets.append("full_name = %s")
        params.append(body.full_name.strip() or target["username"])
    if body.role is not None:
        sets.append("role = %s")
        params.append(body.role)
    if body.is_active is not None:
        sets.append("is_active = %s")
        params.append(body.is_active)
    if body.password is not None:
        validate_new_password(body.password)
        # password_changed_at signs the account out of every existing session.
        sets.append("password_hash = %s")
        sets.append("password_changed_at = %s")
        params.extend([hash_password(body.password), time.time()])

    if sets:
        db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = %s", (*params, user_id))
    return to_public(_get(user_id))


@router.delete("/{user_id}")
def delete_user(user_id: int, admin: Annotated[dict, Depends(require_admin)]) -> dict:
    target = _get(user_id)
    if target["id"] == admin["id"]:
        raise _forbid("Không thể xóa tài khoản đang đăng nhập.")
    if _is_last_active_admin(target):
        raise _forbid("Đây là quản trị viên cuối cùng đang hoạt động — không thể xóa.")
    # Hand everything the account owned to the admin deleting it, so its
    # adverts, playlists, screens and history stay managed by someone. (The FKs
    # are ON DELETE SET NULL as a backstop; init_db re-homes any NULLs.)
    for table in ("creatives", "playlists", "screens", "tracking_sessions"):
        db.execute(f"UPDATE {table} SET user_id = %s WHERE user_id = %s", (admin["id"], user_id))
    db.execute("DELETE FROM users WHERE id = %s", (user_id,))
    return {"ok": True, "deleted_id": user_id}
