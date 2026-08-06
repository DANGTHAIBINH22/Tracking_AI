# tracking-cv

Standalone computer-vision pipeline for retail audience analytics.
**Frame in → per-person metadata out** — no training, only pretrained models +
geometry (solvePnP) + classic image processing (CLAHE). See [`PLAN.md`](PLAN.md)
for the phased build plan and the source document it implements.

Per-person output: `{track_id, bbox, age_group, gender, yaw/pitch/roll, attention, dwell_time}`
plus a periodic scene `context` (optional VLM branch).

## Setup

```bash
# environment is managed by uv (Python 3.12, pinned in .python-version)
uv sync                       # create .venv + install base deps from uv.lock
```

## Run

```bash
uv run python run_webcam.py                                  # live webcam + overlay
uv run python run_video.py --video data/test.mp4 --out outputs/test.csv
```

Download `models/yolov8n-face.pt` before Phase 1 (see PLAN.md). Weights, data and
outputs are git-ignored.

## Layout

| File | Stage |
|------|-------|
| `configs.py` | all thresholds, paths, device |
| `preprocess.py` | 2.1 resize / CLAHE / BGR→RGB |
| `detector.py` | 2.2 YOLOv8-face (standalone detect) |
| `tracker.py` | 2.3 ByteTrack (IoU + Kalman + Hungarian) |
| `crop.py` | 2.4 crop & align face |
| `age_gender.py` | 2.5 MiVOLO age/gender |
| `head_pose.py` | 2.6 + 2.7 MediaPipe Face Mesh + solvePnP |
| `attention.py` | 2.8 + 2.9 attention rule + dwell sessions |
| `scene_vlm.py` | 3 Moondream (own thread, optional) |
| `pipeline.py` | glue → `process(frame) -> [PersonMeta]` |
| `run_webcam.py` / `run_video.py` | entrypoints |
| `eval/` | per-module evaluation scripts |
