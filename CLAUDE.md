# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two layers, one seam between them.

1. A **standalone computer-vision pipeline** for retail audience analytics: `frame in → per-person metadata out`. Runs headless on webcam/video and exports CSV.
2. A **web** digital-signage app on top: FastAPI (`server/`) plays a playlist of image/video adverts and counts who actually watched each one; Next.js (`web/`) is the dashboard, the creative library, the admin console and the screen itself. PostgreSQL stores creatives, airings and impressions. Browser only — there is no desktop or mobile client.

The seam is `Pipeline.process(frame) -> list[PersonMeta]`. The app calls only that; nothing inside the pipeline knows the app exists, and nothing in the pipeline may be reshaped to suit it.

**Hard constraint: no model training.** Every model is pretrained; the "intelligence" is in how stages are composed plus geometry (solvePnP) and classic image processing (CLAHE). When adding a stage, reach for a pretrained model or a geometric/classical method — never a training loop, never fine-tuning.

## Commands

Environment is managed by **uv** (Python pinned to 3.12 in `.python-version`; do not use system Python 3.13 — MediaPipe has no 3.13 wheels).

```bash
uv sync                                              # recreate .venv from uv.lock
uv add <pkg>                                         # add a base (real-time branch) dependency
uv run python run_webcam.py                          # live webcam + debug overlay (press q)
uv run python run_video.py --video data/x.mp4 --out outputs/x.csv   # batch → CSV
uv run python -c "import cv2,numpy,pandas,mediapipe,torch,ultralytics"  # smoke-check env
```

Signage app — **this is the product surface**; `run_webcam.py` / `run_video.py` are
debug tools for the pipeline, not a second way to ship it. Needs PostgreSQL
(`docker compose up -d`, or a local brew install):

```bash
./run_web.sh                                         # Postgres check + API + dashboard
```

or the two halves separately when debugging one of them:

```bash
createdb signage                                     # once
uv run uvicorn server.main:app --reload --port 8000  # REST + /ws/live + MJPEG
cd web && npm install && npm run dev                 # dashboard on :3000
```

`DATABASE_URL` (default `postgresql://localhost:5432/signage`) and
`NEXT_PUBLIC_API_BASE` are the only knobs needed to move either half; see
`.env.example`. Tables are created on startup by `server/db.py` — there is no
migration tool, so schema changes go in `SCHEMA` and are re-applied idempotently.

There is no test framework yet. To sanity-check a single module, run it under `uv run python` (e.g. import it and exercise the class); `attention.DwellTracker` is deterministic if you pass explicit `now=` timestamps.

VLM branch deps are intentionally **not** in the base env — install only at Phase 6: `uv pip install -r requirements-vlm.txt`.

## Architecture

Flat module layout (no package); entrypoints and stage modules sit at the repo root and import each other by bare name (`from tracker import FaceTracker`). Run entrypoints from the repo root so imports resolve.

**Data flow** (`pipeline.py` glues it): `preprocess` → `FaceTracker.update` (detect+track in one) → per track: `crop_face` → `HeadPoseEstimator.estimate` → `is_attentive` → `DwellTracker.update`, plus throttled `AgeGenderEstimator.estimate`. Output is a list of `PersonMeta` dataclasses; `run_video.py` writes one CSV row per person per frame using `PersonMeta.__annotations__` as the header.

**App-layer decisions to preserve:**

- **Frames arrive through `server/sources.py`, never straight into the engine.** `LocalCameraSource` is OpenCV on the API host; `BrowserSource` is a one-slot mailbox that `/ws/ingest` fills with JPEGs from a screen's own webcam (`web/lib/useCameraIngest.ts`). The two are exclusive, and the ingest websocket accepts **one publisher at a time** — two screens pushing their own room into one engine is the same corruption two capture threads would cause. The websocket only decodes and stores; the analytics thread is still the only thing that touches `Pipeline`.
- **Browser capture needs a secure context.** `getUserMedia` does not exist over plain http on a LAN address, so a screen served from anything but `localhost` or HTTPS silently has no camera. `useCameraIngest` reports that as its own `insecure` phase rather than letting it look like a denied permission.
- **`/admin` is the only page that changes anything.** The dashboard reports, `/player` renders, `/ads` curates. Two pages able to start and stop the same engine is how one operator stops capture a colleague started a second earlier.
- **`/player` runs the camera invisibly.** The video element is in the document at 1px and zero opacity — not `display:none`, which stops some browsers painting and would feed the pipeline frozen frames. The HUD is off by default; a shop window is not a dashboard.
- **The backend owns the playlist clock** (`server/player.py`), not the browser. Analytics attribute every measured face to whatever `current_airing()` returns, so a reloaded tab, a paused video or a second screen cannot re-attribute people to the wrong advert. `web/app/player/page.tsx` is a dumb renderer.
- **One capture thread, ever** (`server/engine.py`). Two threads pushing frames into `Pipeline` would interleave two scenes into one set of ByteTrack ids and silently corrupt every dwell time and unique count.
- **reach ≠ impressions** (`server/reports.py`): reach counts people who walked past while an advert ran; an impression is one who actually looked, for at least `SETTINGS.min_attention_seconds`. `attention_rate` is the ratio. Keep the two columns apart — collapsing them turns an attention metric back into footfall.
- **Airings overlap, never gap.** `PlaylistPlayer._open_airing` puts the next advert on air *before* `_end_airing` closes the previous one. Closing first left ~40ms per cut in which `current_airing()` returned None and every face measured was attributed to nothing and dropped.
- **`_flush` sources `creative_id` from the airings row** (`INSERT ... SELECT ... FROM airings WHERE id = %s`), so deleting a creative that is on air makes the write a no-op instead of inserting NULL and killing the capture loop.
- **`server/settings.py` is service tuning, `configs.py` is model tuning.** Neither file should grow the other's knobs.

**Key design decisions to preserve:**

- **`configs.py` is the single source of all tuning** — thresholds, model paths, margins, device. `CFG` is a module-level singleton; read `from configs import CFG` everywhere. `CFG.device` auto-selects `mps` on Apple Silicon, else `cpu` (steers torch/YOLO/MiVOLO; MediaPipe uses its own backend). Experiments (CLAHE on/off, detect-every-N) are toggled here, not by editing stage code.
- **`detector.py` vs `tracker.py` are intentionally separate.** `FaceDetector.detect()` is a plain per-frame detector kept for the detection eval; the real pipeline uses `FaceTracker.update()`, which drives ultralytics `model.track(persist=True)` (YOLOv8-face + built-in ByteTrack = IoU + Kalman + Hungarian). Don't collapse them.
- **Head pose is geometry, not ML** (`head_pose.py`): MediaPipe Face Mesh 2D landmarks + a fixed 3D reference face (`MODEL_POINTS_3D`, `LANDMARK_IDS`) → `cv2.solvePnP` → `cv2.Rodrigues` → Euler yaw/pitch/roll. Camera intrinsics are approximated from frame size.
- **Dwell = per-`track_id` state machine** (`attention.py`, the one fully-implemented stage): attention 0→1 opens a gaze session, 1→0 or track disappearing closes it and accumulates time; temporal smoothing requires N consecutive attentive frames. Correct dwell depends on stable track ids — tracking is the backbone, not an afterthought.
- **BGR vs RGB**: OpenCV frames are BGR. Convert with `preprocess.to_rgb` before any MediaPipe/MiVOLO call. Getting this wrong silently corrupts results.
- **Async VLM branch** (`scene_vlm.py`, optional): must run in its own thread and never block the real-time loop; the main loop reads the latest `SceneContext` through a lock. Use closed VQA prompts, not free-form captions.

## Implementation status

Every real-time stage is implemented and running end to end (`detector`, `tracker`, `head_pose`, `age_gender`, `attention`, `Pipeline.process`); `crop.align_by_eyes` is the one remaining `NotImplementedError`, and it is optional. Two stages degrade instead of failing: `age_gender` returns `None` without `models/mivolo_age_gender.onnx`, and `scene_vlm` returns an empty `SceneContext` without the Phase-6 deps. **Neither invents a value** — `CFG.allow_mock_attributes` is the only way to get synthetic data, and it exists for UI smoke tests only. **`PLAN.md` is the source of truth** for the phased build order, each phase's Definition of Done, and the challenge→technique mapping — read it before implementing a stage, and follow the phase order (detection → tracking → head pose → age/gender → attention+dwell → VLM → evaluation).

Model weights, `data/`, and `outputs/` are git-ignored and must be downloaded/produced locally (see `PLAN.md` per phase). Datasets under `eval/` are for **measurement only, never training**.
