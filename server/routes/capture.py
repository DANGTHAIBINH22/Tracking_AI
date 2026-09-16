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


@router.get("/sources")
def list_available_sources() -> list[dict]:
    """List preset hardware and all test video files in data/ directory."""
    import os
    from pathlib import Path

    results = [
        {
            "value": "0",
            "label": "📹 Webcam máy tính (cục bộ)",
            "type": "webcam",
            "description": "Camera gắn trực tiếp trên máy chạy server",
        },
        {
            "value": "browser",
            "label": "🌐 Webcam màn hình Kiosk (Browser)",
            "type": "browser",
            "description": "Camera từ trình duyệt mở trang /screen hoặc /homescreen",
        },
    ]

    data_dir = Path("data")
    if data_dir.exists() and data_dir.is_dir():
        video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
        for f in sorted(data_dir.iterdir()):
            if f.is_file() and f.suffix.lower() in video_exts:
                name_clean = f.stem.replace("-", " ").replace("_", " ").title()
                if "store" in f.stem.lower() or "aisle" in f.stem.lower():
                    label = f"🛒 Video mẫu: TTTM / Siêu thị ({f.name})"
                elif "walking" in f.stem.lower():
                    label = f"🚶 Video mẫu: Người đi lại ({f.name})"
                elif "pose" in f.stem.lower():
                    label = f"👤 Video mẫu: Hướng nhìn khuôn mặt ({f.name})"
                else:
                    label = f"🎬 Video test: {name_clean} ({f.name})"

                results.append({
                    "value": f"data/{f.name}",
                    "label": label,
                    "type": "file",
                    "description": f"Video giả lập luồng camera từ file {f.name}",
                })

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
