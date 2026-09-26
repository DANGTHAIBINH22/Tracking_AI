"""Creative library: upload, retune, reorder, delete."""

from __future__ import annotations

import shutil
import time
import uuid
from dataclasses import asdict
from pathlib import Path

import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from server import db
from server.audience import normalize_target_age
from server.schemas import (
    Creative,
    CreativeAddUrl,
    CreativeProfileResult,
    CreativeUpdate,
    PlaylistOrder,
    TargetSuggestion,
)
from server.settings import MEDIA_DIR, SETTINGS

router = APIRouter(prefix="/api/ads", tags=["ads"])


def _invalidate_player_cache() -> None:
    try:
        from server.state import PLAYER
        if PLAYER:
            PLAYER.invalidate_playlist_cache()
    except Exception:
        pass

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}


def to_public(row: dict) -> Creative:
    url = row["filename"] if row["kind"] == "web" else f"/media/{row['filename']}"
    return Creative(
        id=row["id"],
        name=row["name"],
        filename=row["filename"],
        kind=row["kind"],
        duration=row["duration"],
        position=row["position"],
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
        url=url,
        target_age_group=row.get("target_age_group") or "all",
        target_gender=row.get("target_gender") or "all",
        target_crowd=row.get("target_crowd") or "all",
        target_weather=row.get("target_weather") or "all",
        target_pet=row.get("target_pet") or "all",
        target_clothing=row.get("target_clothing") or "all",
        target_style=row.get("target_style") or "all",
        category=row.get("category") or "Chung",
        description=row.get("description") or "",
    )



def _video_duration(path: Path) -> float:
    """Read a video's real length so the playlist clock matches the playback.

    A creative whose scheduled slot is shorter than the file cuts the advert off
    mid-way; longer, and the screen freezes on the last frame while analytics
    keep crediting the airing.
    """
    cap = cv2.VideoCapture(str(path))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if fps and fps > 0 and frames and frames > 0:
            return round(frames / fps, 2)
    finally:
        cap.release()
    return SETTINGS.default_image_seconds


@router.get("", response_model=list[Creative])
def list_ads() -> list[Creative]:
    rows = db.query("SELECT * FROM creatives ORDER BY position ASC, id ASC")
    return [to_public(r) for r in rows]


@router.post("", response_model=Creative, status_code=201)
async def upload_ad(
    file: UploadFile = File(...),
    name: str | None = Form(None),
    target_age_group: str = Form("all"),
    target_gender: str = Form("all"),
    target_crowd: str = Form("all"),
    target_weather: str = Form("all"),
    target_pet: str = Form("all"),
    target_clothing: str = Form("all"),
    target_style: str = Form("all"),
    category: str = Form("Chung"),
    description: str = Form(""),
    add_to_playlist: bool = Form(True),
) -> Creative:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix in IMAGE_EXT:
        kind = "image"
    elif suffix in VIDEO_EXT:
        kind = "video"
    else:
        raise HTTPException(400, f"Định dạng không hỗ trợ: {suffix or '(không có)'}")

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    # Store under a generated name: two uploads called banner.png must not
    # overwrite each other, and a user-supplied name must never be able to
    # traverse out of MEDIA_DIR.
    stored = f"{uuid.uuid4().hex}{suffix}"
    target = MEDIA_DIR / stored
    with target.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    duration = _video_duration(target) if kind == "video" else SETTINGS.default_image_seconds
    next_pos = (db.query_one("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM creatives WHERE enabled = TRUE") or {}).get("p", 0)
    display_name = name.strip() if name and name.strip() else Path(file.filename or stored).stem
    is_enabled = bool(add_to_playlist)
    new_id = db.insert(
        """INSERT INTO creatives (name, filename, kind, duration, position, enabled, created_at,
                                  target_age_group, target_gender, target_crowd, target_weather,
                                  target_pet, target_clothing, target_style,
                                  category, description)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (display_name, stored, kind, duration, next_pos if is_enabled else 9999, is_enabled, time.time(),
         # Form fields skip the Pydantic validator, so canonicalise here too.
         normalize_target_age(target_age_group), target_gender, target_crowd, target_weather,
         target_pet, target_clothing, target_style,
         category, description),
    )
    return to_public(db.query_one("SELECT * FROM creatives WHERE id = %s", (new_id,)))



@router.post("/url", response_model=Creative, status_code=201)
def add_url_ad(body: CreativeAddUrl) -> Creative:
    """Add web content URL (e.g. live dashboard, financial chart, website) as a creative."""
    next_pos = (db.query_one("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM creatives WHERE enabled = TRUE") or {}).get("p", 0)
    display_name = body.name.strip() if body.name and body.name.strip() else body.url.strip()
    new_id = db.insert(
        """INSERT INTO creatives (name, filename, kind, duration, position, enabled, created_at, category, description)
           VALUES (%s, %s, 'web', %s, %s, TRUE, %s, %s, %s) RETURNING id""",
        (display_name, body.url.strip(), body.duration, next_pos, time.time(), body.category, body.description),
    )
    return to_public(db.query_one("SELECT * FROM creatives WHERE id = %s", (new_id,)))



class SuggestRequest(BaseModel):
    title: str


@router.post("/suggest-target", response_model=TargetSuggestion)
def suggest_target(body: SuggestRequest) -> TargetSuggestion:
    txt = (body.title or "").lower()

    # The under-18 range is three brackets now, so these split too: a nappy
    # advert and a game-console advert used to get the same "<18" suggestion.
    if any(k in txt for k in ["baby", "em bé", "sơ sinh", "tã", "bỉm", "sữa bột", "mầm non", "mẫu giáo"]):
        return TargetSuggestion(
            category="Đồ chơi & Trẻ em",
            target_age_group="<6",
            target_gender="all",
            reason="Sản phẩm cho trẻ sơ sinh và tuổi mầm non",
        )
    if any(k in txt for k in ["kid", "trẻ em", "đồ chơi", "toy", "hoạt hình", "thiếu nhi", "tiểu học"]):
        return TargetSuggestion(
            category="Đồ chơi & Trẻ em",
            target_age_group="6-13",
            target_gender="all",
            reason="Từ khóa sản phẩm dành cho thiếu nhi và phụ huynh có con nhỏ",
        )
    if any(k in txt for k in ["game", "gaming", "playstation", "nintendo", "anime", "manga", "học sinh"]):
        return TargetSuggestion(
            category="Công nghệ & Gaming",
            target_age_group="13-18",
            target_gender="all",
            reason="Nội dung giải trí, game và văn hóa học sinh / thanh thiếu niên",
        )
    if any(k in txt for k in ["son", "mỹ phẩm", "lipstick", "makeup", "váy", "đầm", "nước hoa nữ", "skincare"]):
        return TargetSuggestion(
            category="Thời trang & Làm đẹp",
            target_age_group="18-35",
            target_gender="F",
            reason="Mỹ phẩm và thời trang làm đẹp nhắm đến phụ nữ trẻ hiện đại",
        )
    if any(k in txt for k in ["vest", "giày tây", "đồng hồ nam", "dao cạo", "cà vạt", "nước hoa nam"]):
        return TargetSuggestion(
            category="Thời trang Nam",
            target_age_group="18-35",
            target_gender="M",
            reason="Thời trang và sản phẩm chăm sóc cá nhân cho nam giới trẻ",
        )
    if any(k in txt for k in ["trà sữa", "sneaker", "giày", "áo thun", "hoodie", "genz", "sinh viên", "iphone", "laptop", "tai nghe"]):
        return TargetSuggestion(
            category="Thanh niên & Xu hướng",
            target_age_group="18-35",
            target_gender="all",
            reason="Sản phẩm công nghệ cá nhân và xu hướng giới trẻ (18-35 tuổi)",
        )
    if any(k in txt for k in ["gia đình", "nội thất", "tủ lạnh", "máy giặt", "nhà đất", "bất động sản", "xe hơi", "bảo hiểm", "sữa bột", "nồi chiên", "bếp"]):
        return TargetSuggestion(
            category="Gia đình & Đồ gia dụng",
            target_age_group="35-55",
            target_gender="all",
            reason="Các sản phẩm gia dụng, nhà cửa và tài chính phù hợp nhóm tuổi gia đình trung niên",
        )
    if any(k in txt for k in ["dưỡng lão", "xương khớp", "sức khỏe", "thuốc bổ", "huyết áp", "trà dưỡng sinh", "máy đo", "ghế massage"]):
        return TargetSuggestion(
            category="Sức khỏe & Dưỡng sinh",
            target_age_group=">55",
            target_gender="all",
            reason="Sản phẩm y tế, chăm sóc sức khỏe và thư giãn cho người lớn tuổi",
        )

    return TargetSuggestion(
        category="Tiêu dùng chung",
        target_age_group="all",
        target_gender="all",
        reason="Quảng cáo đại chúng phù hợp với mọi độ tuổi và giới tính",
    )


class SmartTargetingRequest(BaseModel):
    enabled: bool


class TargetingSettingsRequest(BaseModel):
    smart_targeting: bool | None = None
    cut_in_enabled: bool | None = None
    cut_in_min_playback: float | None = None
    lookahead_seconds: float | None = None


@router.get("/smart-targeting")
def get_smart_targeting() -> dict:
    from server.state import PLAYER
    return {"enabled": PLAYER.smart_targeting}


@router.post("/smart-targeting")
def set_smart_targeting(body: SmartTargetingRequest) -> dict:
    from server.state import PLAYER
    PLAYER.set_smart_targeting(body.enabled)
    return {"enabled": PLAYER.smart_targeting}


@router.get("/targeting-settings")
def get_targeting_settings() -> dict:
    from server.state import PLAYER
    return PLAYER.get_targeting_settings()


@router.post("/targeting-settings")
def set_targeting_settings(body: TargetingSettingsRequest) -> dict:
    from server.state import PLAYER
    return PLAYER.update_targeting_settings(
        smart_targeting=body.smart_targeting,
        cut_in_enabled=body.cut_in_enabled,
        cut_in_min_playback=body.cut_in_min_playback,
        lookahead_seconds=body.lookahead_seconds,
    )


@router.post("/{ad_id}/analyze", response_model=CreativeProfileResult)
async def analyze_ad(ad_id: int) -> CreativeProfileResult:
    """Read the advert and propose audience tags for the operator to confirm.

    Deliberately not folded into the upload: this loads models and may call a
    remote API, so an upload would sit there for seconds. It also only ever
    proposes — writing the tags stays with PATCH, i.e. with the human.
    """
    row = db.query_one("SELECT filename FROM creatives WHERE id = %s", (ad_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy quảng cáo")
    path = MEDIA_DIR / row["filename"]
    if not path.exists():
        raise HTTPException(404, "Tệp media không còn trên đĩa")

    from server.creative_profiler import profile_creative

    # Off the event loop: this is seconds of OpenCV decoding plus model
    # inference, and blocking here would freeze every other request.
    profile = await run_in_threadpool(profile_creative, str(path))
    return CreativeProfileResult(**asdict(profile))


@router.patch("/{ad_id}", response_model=Creative)
def update_ad(ad_id: int, patch: CreativeUpdate) -> Creative:
    row = db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy quảng cáo")
    fields = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)
        db.execute(f"UPDATE creatives SET {sets} WHERE id = %s", (*fields.values(), ad_id))
        _invalidate_player_cache()
    return to_public(db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,)))


@router.post("/{ad_id}/add-to-playlist", response_model=Creative)
def add_to_playlist(ad_id: int) -> Creative:
    row = db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy media")
    next_pos = (db.query_one("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM creatives WHERE enabled = TRUE") or {}).get("p", 0)
    db.execute("UPDATE creatives SET enabled = TRUE, position = %s WHERE id = %s", (next_pos, ad_id))
    _invalidate_player_cache()
    return to_public(db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,)))


@router.post("/{ad_id}/remove-from-playlist", response_model=Creative)
def remove_from_playlist(ad_id: int) -> Creative:
    row = db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy media")
    db.execute("UPDATE creatives SET enabled = FALSE WHERE id = %s", (ad_id,))
    _invalidate_player_cache()
    return to_public(db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,)))


@router.post("/{ad_id}/duplicate", response_model=Creative)
def duplicate_ad(ad_id: int) -> Creative:
    row = db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,))
    if not row:
        raise HTTPException(404, "Không tìm thấy media")
    next_pos = (db.query_one("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM creatives WHERE enabled = TRUE") or {}).get("p", 0)
    new_id = db.insert(
        """INSERT INTO creatives (name, filename, kind, duration, position, enabled, created_at,
                                  target_age_group, target_gender, target_crowd, target_weather,
                                  target_pet, target_clothing, target_style,
                                  category, description)
           VALUES (%s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (f"{row['name']} (Bản sao)", row["filename"], row["kind"], row["duration"], next_pos, time.time(),
         row.get("target_age_group") or "all", row.get("target_gender") or "all",
         row.get("target_crowd") or "all", row.get("target_weather") or "all",
         row.get("target_pet") or "all", row.get("target_clothing") or "all",
         row.get("target_style") or "all",
         row.get("category") or "Chung", row.get("description") or ""),
    )
    _invalidate_player_cache()
    return to_public(db.query_one("SELECT * FROM creatives WHERE id = %s", (new_id,)))


@router.put("/order", response_model=list[Creative])
def reorder(order: PlaylistOrder) -> list[Creative]:
    for position, ad_id in enumerate(order.creative_ids):
        db.execute("UPDATE creatives SET position = %s WHERE id = %s", (position, ad_id))
    _invalidate_player_cache()
    return list_ads()


@router.delete("/{ad_id}", status_code=204)
def delete_ad(ad_id: int) -> None:
    row = db.query_one("SELECT * FROM creatives WHERE id = %s", (ad_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy quảng cáo")
    filename = row["filename"]
    db.execute("DELETE FROM creatives WHERE id = %s", (ad_id,))
    _invalidate_player_cache()
    # Only unlink the file if no other creative row references it
    other = db.query_one("SELECT id FROM creatives WHERE filename = %s LIMIT 1", (filename,))
    if not other:
        (MEDIA_DIR / filename).unlink(missing_ok=True)

    from server.state import PLAYER
    snap = PLAYER.snapshot()
    cur = snap.get("creative")
    if cur and cur.get("id") == ad_id:
        PLAYER.skip()
