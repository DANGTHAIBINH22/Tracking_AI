# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **standalone computer-vision pipeline** for retail audience analytics: `frame in → per-person metadata out`. It runs headless on webcam/video and exports CSV — there is deliberately **no app layer** (NestJS / React Native) yet. The app will later call one seam, `Pipeline.process(frame) -> list[PersonMeta]`, and nothing inside needs to change.

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

There is no test framework yet. To sanity-check a single module, run it under `uv run python` (e.g. import it and exercise the class); `attention.DwellTracker` is deterministic if you pass explicit `now=` timestamps.

VLM branch deps are intentionally **not** in the base env — install only at Phase 6: `uv pip install -r requirements-vlm.txt`.

## Architecture

Flat module layout (no package); entrypoints and stage modules sit at the repo root and import each other by bare name (`from tracker import FaceTracker`). Run entrypoints from the repo root so imports resolve.

**Data flow** (`pipeline.py` glues it): `preprocess` → `FaceTracker.update` (detect+track in one) → per track: `crop_face` → `HeadPoseEstimator.estimate` → `is_attentive` → `DwellTracker.update`, plus throttled `AgeGenderEstimator.estimate`. Output is a list of `PersonMeta` dataclasses; `run_video.py` writes one CSV row per person per frame using `PersonMeta.__annotations__` as the header.

**Key design decisions to preserve:**

- **`configs.py` is the single source of all tuning** — thresholds, model paths, margins, device. `CFG` is a module-level singleton; read `from configs import CFG` everywhere. `CFG.device` auto-selects `mps` on Apple Silicon, else `cpu` (steers torch/YOLO/MiVOLO; MediaPipe uses its own backend). Experiments (CLAHE on/off, detect-every-N) are toggled here, not by editing stage code.
- **`detector.py` vs `tracker.py` are intentionally separate.** `FaceDetector.detect()` is a plain per-frame detector kept for the detection eval; the real pipeline uses `FaceTracker.update()`, which drives ultralytics `model.track(persist=True)` (YOLOv8-face + built-in ByteTrack = IoU + Kalman + Hungarian). Don't collapse them.
- **Head pose is geometry, not ML** (`head_pose.py`): MediaPipe Face Mesh 2D landmarks + a fixed 3D reference face (`MODEL_POINTS_3D`, `LANDMARK_IDS`) → `cv2.solvePnP` → `cv2.Rodrigues` → Euler yaw/pitch/roll. Camera intrinsics are approximated from frame size.
- **Dwell = per-`track_id` state machine** (`attention.py`, the one fully-implemented stage): attention 0→1 opens a gaze session, 1→0 or track disappearing closes it and accumulates time; temporal smoothing requires N consecutive attentive frames. Correct dwell depends on stable track ids — tracking is the backbone, not an afterthought.
- **BGR vs RGB**: OpenCV frames are BGR. Convert with `preprocess.to_rgb` before any MediaPipe/MiVOLO call. Getting this wrong silently corrupts results.
- **Async VLM branch** (`scene_vlm.py`, optional): must run in its own thread and never block the real-time loop; the main loop reads the latest `SceneContext` through a lock. Use closed VQA prompts, not free-form captions.

## Implementation status

Most stages are **skeletons that raise `NotImplementedError`**, tagged with the phase that implements them. `attention.py` (dwell/attention), `preprocess.py`, `crop.py`, `configs.py`, and `viz.py` are functional; `detector`, `tracker`, `head_pose`, `age_gender`, `scene_vlm`, and `Pipeline.process` are stubs. **`PLAN.md` is the source of truth** for the phased build order, each phase's Definition of Done, and the challenge→technique mapping — read it before implementing a stage, and follow the phase order (detection → tracking → head pose → age/gender → attention+dwell → VLM → evaluation).

Model weights, `data/`, and `outputs/` are git-ignored and must be downloaded/produced locally (see `PLAN.md` per phase). Datasets under `eval/` are for **measurement only, never training**.
