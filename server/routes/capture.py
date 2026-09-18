"""Camera control + the debug video feed."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from server.settings import SETTINGS
from server.sources import is_browser_source
from server.state import ENGINE

router = APIRouter(prefix="/api/capture", tags=["capture"])


class CaptureStart(BaseModel):
    # "0" = default webcam; "browser" waits for a screen to push frames in over
    # /ws/ingest; anything else is a path/URL replayed as if it were live.
    source: str | None = None
    device_id: str | None = None
    screen_id: int | None = None
    notes: str = ""


@router.get("/config")
def config() -> dict:
    """Capture hints for a browser publisher, so the rate lives in settings
    rather than baked into the page."""
    return {
        "target_fps": SETTINGS.ingest_target_fps,
        "max_width": SETTINGS.ingest_max_width,
        "jpeg_quality": SETTINGS.ingest_jpeg_quality,
        "default_source": SETTINGS.default_source,
    }


@router.get("/state")
def state() -> dict:
    snap = ENGINE.snapshot()
    return {"running": snap["running"], "source": snap["source"],
            "mode": snap["mode"], "fps": snap["fps"], "error": snap["error"],
            "ingest": ENGINE.browser.status()}


@router.post("/start")
def start(body: CaptureStart | None = None) -> dict:
    source = (body.source if body else None) or SETTINGS.default_source
    device_id = (body.device_id if body else None) or "host"
    screen_id = body.screen_id if body else None
    notes = (body.notes if body else "") or ""

    if ENGINE.running:
        snap = ENGINE.snapshot()
        if snap.get("source") != source:
            ENGINE.stop()
    ENGINE.start(source=source, device_id=device_id, screen_id=screen_id, notes=notes)

    if is_browser_source(source):
        # There is nothing to wait for: frames only start once a screen opens
        # /player and grants camera permission, which may be minutes away.
        return state()

    # Surface a source that failed to open as a 400 rather than a silently idle
    # engine: the capture thread reports the error asynchronously, so give it a
    # beat to fail before answering.
    import time as _time
    for _ in range(20):
        snap = ENGINE.snapshot()
        if snap["error"]:
            raise HTTPException(400, snap["error"])
        if snap["frame_index"] > 0:
            break
        _time.sleep(0.1)
    return state()


@router.post("/stop")
def stop() -> dict:
    ENGINE.stop()
    return state()


_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

# A subfolder of data/ is a named set of clips rather than a stray upload, so it
# gets a heading in the picker instead of 35 unlabelled buttons in one row.
_FOLDER_LABELS = {
    "age_kids": "Trẻ em & thiếu niên (kiểm tra ước lượng tuổi)",
    "age_adults": "Người trung niên & cao tuổi (kiểm tra 35-55 / >55)",
    "retail": "Bối cảnh bán lẻ (khách đi ngang, chọn hàng, quầy thu ngân)",
}

# The child/teen set is named by subject prefix — see eval/age_kids/manifest.tsv
# — so a label can say which age band a clip exercises instead of echoing the
# filename. Longest prefix first: "children_" must win over "child_".
_CLIP_PREFIXES = (
    ("children_", "🧒", "Nhiều trẻ em"),
    ("child_", "🧒", "Trẻ em ~2-13"),
    ("baby_", "👶", "Trẻ sơ sinh 0-2"),
    ("teen_", "🧑", "Thiếu niên ~13-25"),
    ("mixed_", "👨‍👧", "Trẻ em + người lớn"),
    ("farfield_", "🔭", "Mặt ở xa (~35-50px)"),
    ("senior_", "🧓", "Cao tuổi >55"),
    ("grandmother_", "🧓", "Cao tuổi >55"),
    ("grandparents_", "🧓", "Cao tuổi + trẻ em"),
    ("two_generations_", "🧓", "Hai thế hệ trong một khung"),
    ("adult_", "🧑‍💼", "Trung niên ~35-55"),
)


def _clip_label(stem: str, filename: str, *, in_folder: bool) -> str:
    """A button caption. `in_folder` clips are already grouped under a heading,
    so they drop the filename and the trailing mixkit id that the top-level
    captions keep — "Browsing Supermarket Items 25438
    (browsing_supermarket_items-25438.mp4)" said the same thing three times."""
    lowered = stem.lower()
    for prefix, emoji, what in _CLIP_PREFIXES:
        if lowered.startswith(prefix):
            rest = stem[len(prefix):].rsplit("-", 1)[0].replace("_", " ")
            return f"{emoji} {what}: {rest}"
    if in_folder:
        return f"🎬 {stem.rsplit('-', 1)[0].replace('_', ' ').replace('-', ' ').capitalize()}"
    if "store" in lowered or "aisle" in lowered:
        return f"🛒 Video mẫu: TTTM / Siêu thị ({filename})"
    if "walking" in lowered:
        return f"🚶 Video mẫu: Người đi lại ({filename})"
    if "pose" in lowered:
        return f"👤 Video mẫu: Hướng nhìn khuôn mặt ({filename})"
    return f"🎬 Video test: {stem.replace('-', ' ').replace('_', ' ').title()} ({filename})"


@router.get("/sources")
def list_available_sources() -> list[dict]:
    """Preset hardware plus every test video under data/, one subfolder deep.

    Recursing was not optional once the clips stopped being a flat handful:
    `data/age_kids/` holds the child/teen set that eval/age_kids/fetch.sh pulls
    down, and a top-level-only scan left all of it unreachable from /admin even
    though the engine takes the path happily. Depth is capped at one level so a
    stray folder of frames cannot flood the picker.
    """
    from pathlib import Path

    results = [
        {
            "value": "0",
            "label": "📹 Webcam máy tính (cục bộ)",
            "type": "webcam",
            "group": "",
            "description": "Camera gắn trực tiếp trên máy chạy server",
        },
        {
            "value": "browser",
            "label": "🌐 Webcam màn hình Kiosk (Browser)",
            "type": "browser",
            "group": "",
            "description": "Camera từ trình duyệt mở trang /screen hoặc /homescreen",
        },
    ]

    data_dir = Path("data")
    if not (data_dir.exists() and data_dir.is_dir()):
        return results

    def add_clips(folder: Path, group: str) -> None:
        for f in sorted(folder.iterdir()):
            if not (f.is_file() and f.suffix.lower() in _VIDEO_EXTS):
                continue
            rel = f.relative_to(data_dir).as_posix()
            results.append({
                "value": f"data/{rel}",
                "label": _clip_label(f.stem, f.name, in_folder=bool(group)),
                "type": "file",
                "group": group,
                "description": f"Video giả lập luồng camera từ file {rel}",
            })

    add_clips(data_dir, "")
    for sub in sorted(p for p in data_dir.iterdir() if p.is_dir() and not p.name.startswith(".")):
        add_clips(sub, _FOLDER_LABELS.get(sub.name, sub.name))

    return results


@router.post("/upload-test-video")
async def upload_test_video(file: UploadFile = File(...)) -> dict:
    """Upload a test video file (e.g. mall footage) into data/ for AI testing."""
    import shutil
    import uuid
    from pathlib import Path

    data_dir = Path("data")
    data_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        raise HTTPException(400, "Định dạng file không hỗ trợ. Vui lòng chọn file .mp4, .mov, .avi hoặc .webm")

    clean_name = Path(file.filename or "test_video.mp4").name
    dest = data_dir / clean_name
    if dest.exists():
        dest = data_dir / f"{dest.stem}_{uuid.uuid4().hex[:6]}{dest.suffix}"

    with dest.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "source": f"data/{dest.name}",
        "filename": dest.name,
        "message": f"Tải lên video test thành công: data/{dest.name}",
    }


@router.get("/stream.mjpg")
async def stream() -> StreamingResponse:
    """Annotated frames as multipart MJPEG — fully async with per-client queues."""

    async def frames():
        boundary = b"--frame\r\n"
        q = ENGINE.subscribe_stream()
        try:
            init_frame = ENGINE.latest_jpeg(timeout=0.05)
            if init_frame:
                yield boundary + b"Content-Type: image/jpeg\r\n\r\n" + init_frame + b"\r\n"

            while ENGINE.running:
                try:
                    jpeg = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield boundary + b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                except asyncio.TimeoutError:
                    if not ENGINE.running:
                        break
        finally:
            ENGINE.unsubscribe_stream(q)

    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame")
