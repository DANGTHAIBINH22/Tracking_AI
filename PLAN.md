# tracking-cv — Build Plan

Standalone Computer-Vision pipeline. **Frame in → per-person metadata out.** No app
(no NestJS, no React Native) until the CV branch runs well and exports correct CSV.
No model training — pretrained models + geometry + classic image processing only.

## Goal (recap)

Per frame, for each person:
`{ track_id, bbox, age_group, gender, yaw, pitch, roll, attention, dwell_time }`
and periodically `context = { weather, crowd_activity, objects[] }` (optional VLM).

Success for this stage = runs on webcam/video, **exports correct metadata to CSV**,
and **each stage is measurable** (eval/). App integration comes AFTER.

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Location | dedicated `Tracking/` folder, own venv |
| 2 | Python & tooling | `uv` + **Python 3.12** (avoids MediaPipe 3.13 wheel trap) |
| 3 | VLM/Moondream branch | final phase, optional, deps in `requirements-vlm.txt` |
| 4 | Detection + tracking | `ultralytics` (YOLOv8-face + built-in ByteTrack), MPS on M3 |
| 5 | Input & data | webcam + self-recorded video first; eval datasets later |
| 6 | This session | scaffold + base deps + this plan (no MiVOLO/Moondream yet) |
| 7 | Timeline | ~8–10 weeks → 7 phases |

## Environment

- Managed by `uv`; Python pinned in `.python-version` (3.12).
- Base deps (real-time branch): `opencv-python`, `numpy`, `pandas`, `ultralytics`
  (pulls `torch`/`torchvision` with MPS), `mediapipe`.
- `uv sync` recreates `.venv` from `uv.lock`. VLM deps stay separate.
- Compute: `CFG.device` auto-selects `mps` on this M3, else `cpu`.

---

## Phases

Order follows the source doc's "mastery order". Each phase has a **Definition of
Done** = a thing you can see/measure, and the **report concepts** it yields.

### Phase 0 — Foundation ✅ (this session)
- `Tracking/` project, uv venv (Py 3.12), base deps, scaffold (`configs.py`,
  `preprocess.py`, `detector.py`, `tracker.py`, `crop.py`, `age_gender.py`,
  `head_pose.py`, `attention.py`, `scene_vlm.py`, `pipeline.py`, `viz.py`,
  `run_webcam.py`, `run_video.py`, `eval/`), `.gitignore`, this plan.
- **DoD:** `uv run python -c "import cv2, numpy, ultralytics, mediapipe, pandas"` OK;
  `run_webcam.py` opens the camera and shows raw FPS.

### Phase 1 — Preprocess + YOLO-face (~1 week)
- Download `models/yolov8n-face.pt`. Implement `preprocess()` + `FaceDetector.detect()`.
- Draw boxes in `run_webcam.py`; measure **baseline FPS**.
- Experiment: detection accuracy **with vs without CLAHE** on back-lit shots.
- **DoD:** live face boxes; a small CLAHE on/off table.
- **Concepts:** one-stage CNN detector, conf/iou (NMS), CLAHE.

### Phase 2 — ByteTrack (~1 week)
- Implement `FaceTracker.update()` via `model.track(persist=True)`.
- Show stable `track_id`; test **ID switches** when two people cross.
- **DoD:** ids stay stable through occlusion/turn; no id explosion.
- **Concepts:** IoU, Kalman filter, Hungarian algorithm, data association.

### Phase 3 — Head pose (MediaPipe + solvePnP) (~1.5 weeks)
- `HeadPoseEstimator`: FaceMesh landmarks → `cv2.solvePnP` → `cv2.Rodrigues` →
  yaw/pitch/roll. Draw a head-direction arrow.
- **Calibrate** `yaw/pitch` thresholds by turning your head at the looking/not-looking
  boundary; record the whole procedure (this is *your* experiment/contribution).
- **DoD:** arrow tracks head; calibrated thresholds written into `configs.py`.
- **Concepts:** Face Mesh (468 pts), Perspective-n-Point, Rodrigues, Euler angles,
  camera intrinsics.

### Phase 4 — Age / gender (MiVOLO) (~1.5 weeks)
- Install MiVOLO (own weights); implement `AgeGenderEstimator.estimate()` +
  `map_age_group()`. Print age/gender on boxes. **Throttle**: estimate once per new
  track and cache (don't run every frame).
- Run on UTKFace → first **age-group accuracy + confusion matrix**.
- **DoD:** age/gender on overlay; an accuracy table; limitations stated honestly.
- **Concepts:** ViT age estimation, continuous→bucket mapping, cross-domain MAE 5–8y.

### Phase 5 — Attention + dwell + async/FPS (~1.5 weeks)
- Wire `is_attentive()` + `DwellTracker` into `pipeline.process()`; finish
  `run_video.py` CSV export. Add temporal smoothing.
- Measure **total FPS** with everything on; if <20, enable `detect_every_n`
  (detect every N frames, track in between) and/or lower resolution.
- **DoD:** correct per-`track_id` dwell in CSV; real-time FPS ≥ 20 (or documented plan).
- **Concepts:** state machine, temporal smoothing, detection/tracking cost trade-off.

### Phase 6 — VLM scene branch (Moondream) (~1 week, OPTIONAL)
- `uv pip install -r requirements-vlm.txt`. Implement `SceneVLM` in its **own thread**
  (never blocks real-time), reading latest via lock.
- ⚠️ **Validate first**: run Moondream on 10–15 target-like images and inspect real
  output BEFORE writing the parser. Use **closed VQA**, not free captions.
- **DoD:** `context` updates every 1–2 min without dropping real-time FPS.
- **Concepts:** VLM, VQA vs captioning, async shared-state.

### Phase 7 — Evaluation + report (~1.5 weeks)
- Download eval datasets (measure only). Fill `eval/` scripts; produce the Results
  tables: detection P/R, age confusion matrix, head-pose MAE, tracking ID-switches,
  FPS with detection every-frame vs every-N, CLAHE on/off.
- **DoD:** every module has numbers; "Methods" + "Results" chapters are defensible.

---

## Challenge → technique map (report-ready)

| Challenge | Stage | Technique |
|-----------|-------|-----------|
| Lighting / back-light | 2.1, 2.2 | CLAHE, conf tuning |
| Glasses / mask / head turn | 2.6, 2.7 | head pose from landmarks, not pupils |
| Double-counting people | 2.3 | ByteTrack (IoU + Kalman + Hungarian) |
| FPS drop from many models | mucs 4 | detect every-N frames, async threads |
| Age error | 2.5 | group accuracy + confusion matrix, state limits |
| Messy VLM output | 3 | closed VQA instead of free captions |

## Handoff to the app layer (later, not now)

Once CSV output is trusted, the app calls exactly one seam: `Pipeline.process(frame)
-> [PersonMeta]`. Nothing above changes whether the consumer is NestJS today or
on-device ML Kit later.
