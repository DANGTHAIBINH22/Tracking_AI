# eval/ — per-module evaluation (report chapter "Results")

Evaluate each stage in isolation so you know which one is weak — not just the whole
system. Datasets here are used to **measure only, never to train**.

| Module | Dataset | Metrics | Script (to add) |
|--------|---------|---------|-----------------|
| Face detection (2.2) | self-labelled / WIDER FACE | Precision, Recall, misses under back-light | `eval_detection.py` |
| Age/gender (2.5) | UTKFace / FairFace | age-group accuracy, confusion matrix, gender acc | `eval_age_gender.py` |
| Head pose / attention (2.6-2.8) | self-labelled videos / AFLW2000-3D / BIWI | attention accuracy, yaw/pitch MAE | `eval_headpose.py` |
| Tracking (2.3) | multi-person test video | ID switches, count correctness | `eval_tracking.py` |
| VLM (3) | your own frames | parse-correctness rate | `eval_vlm.py` |
| Performance | Mac M3 | real-time FPS (>=20), Moondream time (<2s?) | `eval_fps.py` |

Value experiments: CLAHE on/off on back-lit images; detection every-frame vs every-N.
