"""Playlists management: create, manage items from media library, and broadcast to homescreen."""

from __future__ import annotations

import shutil
import time
import uuid
from pathlib import Path
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from server import db
from server.audience import normalize_target_age
from server.routes.ads import IMAGE_EXT, VIDEO_EXT, _video_duration, to_public
from server.schemas import (
    PlaylistActivateRequest,
    PlaylistCreate,
    PlaylistItemAdd,
    PlaylistItemOrder,
    PlaylistItemPublic,
    PlaylistPublic,
    PlaylistUpdate,
)
from server.settings import MEDIA_DIR, SETTINGS

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


def _to_playlist_item(row: dict) -> PlaylistItemPublic:
    creative_data = {
        "id": row["creative_id"],
        "name": row["creative_name"],
        "filename": row["creative_filename"],
        "kind": row["creative_kind"],
        "duration": row["creative_duration"],
        "position": row["creative_position"],
        "enabled": bool(row["creative_enabled"]),
        "created_at": row["creative_created_at"],
        "url": f"/media/{row['creative_filename']}",
        "target_age_group": row.get("target_age_group") or "all",
        "target_gender": row.get("target_gender") or "all",
        "target_crowd": row.get("target_crowd") or "all",
        "target_weather": row.get("target_weather") or "all",
        "category": row.get("category") or "Chung",
        "description": row.get("description") or "",
    }
    return PlaylistItemPublic(
        id=row["id"],
        playlist_id=row["playlist_id"],
        creative_id=row["creative_id"],
        position=row["position"],
        duration=row["duration"] if row["duration"] is not None else row["creative_duration"],
        creative=to_public(creative_data),
    )


def _get_playlist_items(playlist_id: int) -> list[PlaylistItemPublic]:
    rows = db.query(
        """SELECT pi.id, pi.playlist_id, pi.creative_id, pi.position, pi.duration,
                  c.name AS creative_name, c.filename AS creative_filename,
                  c.kind AS creative_kind, c.duration AS creative_duration,
                  c.position AS creative_position, c.enabled AS creative_enabled,
                  c.created_at AS creative_created_at, c.target_age_group,
                  c.target_gender, c.target_crowd, c.target_weather,
                  c.category, c.description
           FROM playlist_items pi
           JOIN creatives c ON pi.creative_id = c.id
           WHERE pi.playlist_id = %s
           ORDER BY pi.position ASC, pi.id ASC""",
        (playlist_id,),
    )
    return [_to_playlist_item(r) for r in rows]


def _to_playlist_public(row: dict, load_items: bool = False) -> PlaylistPublic:
    pid = row["id"]
    items = _get_playlist_items(pid) if load_items else []
    
    # Calculate item count and total duration
    if load_items:
        item_count = len(items)
        total_duration = sum(item.duration for item in items)
    else:
        stats = db.query_one(
            """SELECT COUNT(pi.id) AS cnt,
                      COALESCE(SUM(COALESCE(pi.duration, c.duration)), 0.0) AS total_dur
               FROM playlist_items pi
               JOIN creatives c ON pi.creative_id = c.id
               WHERE pi.playlist_id = %s""",
            (pid,),
        ) or {}
        item_count = stats.get("cnt", 0)
        total_duration = float(stats.get("total_dur", 0.0))

    assigned_screens = db.query(
        "SELECT id, name FROM screens WHERE playlist_id = %s AND status = 'paired' ORDER BY id ASC",
        (pid,),
    )
    assigned_screen_ids = [s["id"] for s in assigned_screens]
    assigned_screen_names = [s["name"] or f"Thiết bị #{s['id']}" for s in assigned_screens]

    is_active = bool(row.get("is_active", False))
    if assigned_screens:
        if len(assigned_screens) == 1:
            publish_status = f"Đang phát ở: {assigned_screen_names[0]}"
        else:
            publish_status = f"Đang phát ở {len(assigned_screens)} thiết bị"
    else:
        publish_status = "Chưa chọn thiết bị phát" if not is_active else "Chưa có thiết bị kết nối"

    return PlaylistPublic(
        id=pid,
        name=row["name"],
        description=row.get("description") or "",
        is_active=is_active,
        kind=row.get("kind") or "default",
        aspect_ratio=row.get("aspect_ratio") or "FullHD Nghiêng",
        sync_playback=bool(row.get("sync_playback", False)),
        fit_screen=bool(row.get("fit_screen", False)),
        publish_status=publish_status,
        created_at=row["created_at"],
        item_count=item_count,
        total_duration=round(total_duration, 2),
        items=items,
        assigned_screen_ids=assigned_screen_ids,
        assigned_screen_names=assigned_screen_names,
    )


@router.get("", response_model=list[PlaylistPublic])
def list_playlists() -> list[PlaylistPublic]:
    rows = db.query("SELECT * FROM playlists ORDER BY is_active DESC, id ASC")
    return [_to_playlist_public(r, load_items=False) for r in rows]


@router.post("", response_model=PlaylistPublic, status_code=201)
def create_playlist(body: PlaylistCreate) -> PlaylistPublic:
    if body.is_active:
        db.execute("UPDATE playlists SET is_active = FALSE")
    publish_status = "published" if body.is_active else "unpublish"
    new_id = db.insert(
        """INSERT INTO playlists (name, description, is_active, created_at, kind, aspect_ratio, sync_playback, fit_screen, publish_status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (
            body.name.strip(),
            body.description.strip(),
            body.is_active,
            time.time(),
            body.kind,
            body.aspect_ratio,
            body.sync_playback,
            body.fit_screen,
            publish_status,
        ),
    )
    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (new_id,))
    return _to_playlist_public(row, load_items=True)


@router.get("/{playlist_id}", response_model=PlaylistPublic)
def get_playlist(playlist_id: int) -> PlaylistPublic:
    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy playlist")
    return _to_playlist_public(row, load_items=True)


@router.patch("/{playlist_id}", response_model=PlaylistPublic)
def update_playlist(playlist_id: int, patch: PlaylistUpdate) -> PlaylistPublic:
    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy playlist")

    fields = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if "is_active" in fields and fields["is_active"]:
        db.execute("UPDATE playlists SET is_active = FALSE WHERE id != %s", (playlist_id,))

    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)
        db.execute(f"UPDATE playlists SET {sets} WHERE id = %s", (*fields.values(), playlist_id))

    if "is_active" in fields:
        from server.state import PLAYER
        if fields["is_active"]:
            PLAYER.skip()
        else:
            has_active = db.query_one("SELECT id FROM playlists WHERE is_active = TRUE LIMIT 1")
            if not has_active:
                PLAYER.stop()
            else:
                PLAYER.skip()

    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    return _to_playlist_public(row, load_items=True)


@router.delete("/{playlist_id}", status_code=204)
def delete_playlist(playlist_id: int) -> None:
    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy playlist")
    was_active = bool(row.get("is_active", False))
    db.execute("DELETE FROM playlists WHERE id = %s", (playlist_id,))

    from server.state import PLAYER
    if was_active:
        # If the active playlist was deleted, activate another if one exists
        other = db.query_one("SELECT id FROM playlists ORDER BY id ASC LIMIT 1")
        if other:
            db.execute("UPDATE playlists SET is_active = TRUE WHERE id = %s", (other["id"],))
            PLAYER.skip()
        else:
            PLAYER.stop()
    else:
        # Check if currently airing creative belonged to this deleted playlist
        snap = PLAYER.snapshot()
        cur = snap.get("creative")
        if cur and cur.get("playlist_id") == playlist_id:
            PLAYER.skip()


@router.post("/{playlist_id}/activate", response_model=PlaylistPublic)
def activate_playlist(playlist_id: int, body: PlaylistActivateRequest | None = None) -> PlaylistPublic:
    """Set this playlist as the active one broadcasting to Homescreen & selected screens."""
    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy playlist")

    # Set as active playlist
    db.execute("UPDATE playlists SET is_active = FALSE")
    db.execute("UPDATE playlists SET is_active = TRUE WHERE id = %s", (playlist_id,))

    # Update screens assignment
    if body and body.screen_ids:
        sets = ", ".join("%s" for _ in body.screen_ids)
        # Assign selected screens to this playlist
        db.execute(
            f"UPDATE screens SET playlist_id = %s WHERE id IN ({sets}) AND status = 'paired'",
            (playlist_id, *body.screen_ids),
        )
        # Clear this playlist from screens not in the selection
        db.execute(
            f"UPDATE screens SET playlist_id = NULL WHERE playlist_id = %s AND id NOT IN ({sets})",
            (playlist_id, *body.screen_ids),
        )
    else:
        # Default: if no specific screen_ids given, assign all paired screens
        paired_screens = db.query("SELECT id FROM screens WHERE status = 'paired'")
        if paired_screens:
            db.execute("UPDATE screens SET playlist_id = %s WHERE status = 'paired'", (playlist_id,))
        else:
            db.execute("UPDATE screens SET playlist_id = NULL WHERE playlist_id = %s", (playlist_id,))

    # Wake player if currently playing
    from server.state import PLAYER
    if not PLAYER.is_playing:
        PLAYER.start()
    else:
        PLAYER.skip()

    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    return _to_playlist_public(row, load_items=True)


@router.post("/{playlist_id}/deactivate", response_model=PlaylistPublic)
def deactivate_playlist(playlist_id: int) -> PlaylistPublic:
    """Stop playing this playlist and unassign from all screens."""
    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy playlist")

    db.execute("UPDATE playlists SET is_active = FALSE WHERE id = %s", (playlist_id,))
    db.execute("UPDATE screens SET playlist_id = NULL WHERE playlist_id = %s", (playlist_id,))

    from server.state import PLAYER
    has_active = db.query_one("SELECT id FROM playlists WHERE is_active = TRUE LIMIT 1")
    if not has_active:
        PLAYER.stop()
    else:
        PLAYER.skip()

    row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    return _to_playlist_public(row, load_items=True)


@router.post("/{playlist_id}/items", response_model=PlaylistPublic)
def add_item_to_playlist(playlist_id: int, body: PlaylistItemAdd) -> PlaylistPublic:
    """Add a media creative from the Media Library into this playlist."""
    pl_row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not pl_row:
        raise HTTPException(404, "Không tìm thấy playlist")

    cr_row = db.query_one("SELECT * FROM creatives WHERE id = %s", (body.creative_id,))
    if not cr_row:
        raise HTTPException(404, "Không tìm thấy tệp media trong kho")

    duration = body.duration if body.duration is not None and body.duration > 0 else cr_row["duration"]

    if body.position is not None:
        pos = body.position
    else:
        max_pos = (db.query_one("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM playlist_items WHERE playlist_id = %s", (playlist_id,)) or {}).get("p", 0)
        pos = max_pos

    db.insert(
        """INSERT INTO playlist_items (playlist_id, creative_id, position, duration)
           VALUES (%s, %s, %s, %s) RETURNING id""",
        (playlist_id, body.creative_id, pos, duration),
    )

    return _to_playlist_public(pl_row, load_items=True)


@router.delete("/{playlist_id}/items/{item_id}", response_model=PlaylistPublic)
def remove_item_from_playlist(playlist_id: int, item_id: int) -> PlaylistPublic:
    """Remove a media creative from this playlist (file stays safe in Kho Media)."""
    pl_row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not pl_row:
        raise HTTPException(404, "Không tìm thấy playlist")

    db.execute("DELETE FROM playlist_items WHERE id = %s AND playlist_id = %s", (item_id, playlist_id))

    if pl_row.get("is_active"):
        from server.state import PLAYER
        remaining = (db.query_one("SELECT COUNT(*) AS c FROM playlist_items WHERE playlist_id = %s", (playlist_id,)) or {}).get("c", 0)
        if remaining == 0:
            PLAYER.skip()
        else:
            snap = PLAYER.snapshot()
            cur = snap.get("creative")
            if cur and cur.get("playlist_item_id") == item_id:
                PLAYER.skip()

    return _to_playlist_public(pl_row, load_items=True)


@router.put("/{playlist_id}/items/order", response_model=PlaylistPublic)
def reorder_playlist_items(playlist_id: int, order: PlaylistItemOrder) -> PlaylistPublic:
    """Reorder items inside this playlist."""
    pl_row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not pl_row:
        raise HTTPException(404, "Không tìm thấy playlist")

    for position, item_id in enumerate(order.item_ids):
        db.execute(
            "UPDATE playlist_items SET position = %s WHERE id = %s AND playlist_id = %s",
            (position, item_id, playlist_id),
        )

    return _to_playlist_public(pl_row, load_items=True)


@router.patch("/{playlist_id}/items/{item_id}", response_model=PlaylistPublic)
def update_playlist_item(playlist_id: int, item_id: int, duration: float) -> PlaylistPublic:
    """Update duration of an item inside this playlist."""
    pl_row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not pl_row:
        raise HTTPException(404, "Không tìm thấy playlist")

    if duration > 0:
        db.execute(
            "UPDATE playlist_items SET duration = %s WHERE id = %s AND playlist_id = %s",
            (duration, item_id, playlist_id),
        )

    return _to_playlist_public(pl_row, load_items=True)


@router.post("/{playlist_id}/upload", response_model=PlaylistPublic, status_code=201)
async def upload_to_playlist(
    playlist_id: int,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    target_age_group: str = Form("all"),
    target_gender: str = Form("all"),
    target_crowd: str = Form("all"),
    target_weather: str = Form("all"),
    category: str = Form("Chung"),
    description: str = Form(""),
    duration: float | None = Form(None),
) -> PlaylistPublic:
    """Upload media file and automatically attach it to this playlist."""
    pl_row = db.query_one("SELECT * FROM playlists WHERE id = %s", (playlist_id,))
    if not pl_row:
        raise HTTPException(404, "Không tìm thấy playlist")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix in IMAGE_EXT:
        kind = "image"
    elif suffix in VIDEO_EXT:
        kind = "video"
    else:
        raise HTTPException(400, f"Định dạng không hỗ trợ: {suffix or '(không có)'}")

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{suffix}"
    target = MEDIA_DIR / stored
    with target.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    if duration is not None and duration > 0:
        item_dur = duration
    else:
        item_dur = _video_duration(target) if kind == "video" else SETTINGS.default_image_seconds

    next_pos_creative = (
        db.query_one("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM creatives WHERE enabled = TRUE") or {}
    ).get("p", 0)
    display_name = name.strip() if name and name.strip() else Path(file.filename or stored).stem

    new_creative_id = db.insert(
        """INSERT INTO creatives (name, filename, kind, duration, position, enabled, created_at,
                                  target_age_group, target_gender, target_crowd, target_weather, category, description)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (
            display_name,
            stored,
            kind,
            item_dur,
            next_pos_creative,
            True,
            time.time(),
            # Form fields skip the Pydantic validator, so canonicalise here too.
            normalize_target_age(target_age_group),
            target_gender,
            target_crowd,
            target_weather,
            category,
            description,
        ),
    )

    max_item_pos = (
        db.query_one("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM playlist_items WHERE playlist_id = %s", (playlist_id,))
        or {}
    ).get("p", 0)
    db.insert(
        """INSERT INTO playlist_items (playlist_id, creative_id, position, duration)
           VALUES (%s, %s, %s, %s) RETURNING id""",
        (playlist_id, new_creative_id, max_item_pos, item_dur),
    )

    return _to_playlist_public(pl_row, load_items=True)

