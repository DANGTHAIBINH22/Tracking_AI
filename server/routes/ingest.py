"""Frames pushed in from a browser (getUserMedia) over a websocket.

The screen holds the camera, not the server. `web/lib/useCameraIngest.ts` grabs
the webcam, draws it to a canvas, and sends JPEGs down this socket; here we hand
them to `ENGINE.browser`, the mailbox the analytics thread reads from.

This handler decodes and stores. It never calls `Pipeline` — that stays the
exclusive property of the single analytics thread, which is what keeps ByteTrack
ids meaning one scene.

Protocol, deliberately tiny:

    client -> server   binary  a JPEG frame
    server -> client   {"type": "accepted" | "rejected" | "state", ...}

`state.capture` tells the screen whether anyone is consuming its frames, so a
screen whose engine an operator has stopped drops to a heartbeat instead of
uploading video nobody looks at.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from server.settings import SETTINGS
from server.sources import BROWSER_SOURCE
from server.state import ENGINE

router = APIRouter(tags=["ingest"])


@router.websocket("/ws/ingest")
async def ingest(ws: WebSocket) -> None:
    await ws.accept()
    client = uuid.uuid4().hex[:8]
    source = ENGINE.browser

    if not source.claim(client):
        # Another screen is live. Say so plainly instead of silently mixing two
        # rooms into one set of track ids.
        await ws.send_json({
            "type": "rejected",
            "reason": "Đã có một màn hình khác đang gửi camera lên.",
            "holder": source.status()["client"],
        })
        await ws.close(code=4409)
        return

    await ws.send_json({
        "type": "accepted",
        "client": client,
        "target_fps": SETTINGS.ingest_target_fps,
        "max_width": SETTINGS.ingest_max_width,
        "jpeg_quality": SETTINGS.ingest_jpeg_quality,
    })

    # A screen that just connected should start measuring without anyone opening
    # the admin page — that is the whole point of the camera being on the screen.
    # Only ever auto-start into browser mode; if the host webcam is already
    # running, leave it be and let the operator decide which one wins.
    if not ENGINE.running:
        ENGINE.start(BROWSER_SOURCE)

    capture_on: bool | None = None
    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break

            data = message.get("bytes")
            if data:
                # Drop the frame on the floor while the engine is stopped: no
                # decode, no copy. The client throttles itself once it sees the
                # state message below.
                if ENGINE.running:
                    source.publish(client, data)

            running = ENGINE.running and ENGINE.mode == "browser"
            if running != capture_on:
                capture_on = running
                await ws.send_json({"type": "state", "capture": running})
    except WebSocketDisconnect:
        pass
    except Exception:
        # A screen that vanished mid-frame is normal; nothing to recover.
        pass
    finally:
        source.release(client)
