"""Measure the age head against the child/teen clip set. Measurement only.

    PYTHONPATH=. uv run python eval/age_kids/run_eval.py
    PYTHONPATH=. uv run python eval/age_kids/run_eval.py --ckpt models/model_imdb_cross_person_4.22_99.46.pth.tar

Scores the largest face in each clip against `eval_band` in manifest.tsv, which
is an eyeballed band, not ground truth. So the two numbers it reports mean
different things:

  - Group accuracy is the honest one. A prediction counts as correct when its
    bracket overlaps the brackets the eyeballed band spans — "5-8" legitimately
    spans `<6` and `6-13`, and demanding one of them would be scoring the
    reference's precision rather than the model's.
  - MAE against the band midpoint is indicative only. Quote it to compare two
    checkpoints on this set, never as the model's accuracy.

Why largest-face-per-frame rather than the full Pipeline: this isolates the age
head. Tracking, the vote in `Pipeline._reduce_votes` and the attention gate all
change the number, and folding them in would make a checkpoint swap unreadable.
Run `run_video.py` on a clip to see what the whole pipeline reports instead.

Clips where the largest face is not one person throughout are reported but not
scored — see UNSTABLE_SPREAD_YEARS.
"""

from __future__ import annotations

import argparse
import csv
import statistics
from pathlib import Path

import cv2
import numpy as np

from age_gender import AgeGenderEstimator, map_age_group
from configs import CFG, DATA_DIR
from crop import crop_face
from server.audience import normalize_age_group

HERE = Path(__file__).resolve().parent
CLIPS_DIR = DATA_DIR / "age_kids"
MANIFEST = HERE / "manifest.tsv"


def read_manifest() -> dict[str, tuple[float, float] | None]:
    """file -> (band_low, band_high), or None for NO_STABLE_SUBJECT."""
    rows: dict[str, tuple[float, float] | None] = {}
    with MANIFEST.open() as fh:
        body = (line for line in fh if not line.startswith("#"))
        for row in csv.DictReader(body, delimiter="\t"):
            band = row["eval_band"].strip()
            if band == NO_STABLE_SUBJECT:
                rows[row["file"]] = None
                continue
            low, _, high = band.partition("-")
            rows[row["file"]] = (float(low), float(high))
    return rows


def groups_spanned(low: float, high: float) -> set[str]:
    """Every bracket an eyeballed band touches, in the app's spelling."""
    span = {map_age_group(low), map_age_group(high)}
    # A band can straddle a bracket that neither endpoint lands in only if a
    # bin is narrower than the band; walk the bins to stay correct if someone
    # retunes CFG.age_bins.
    for upper, _ in CFG.age_bins:
        if low < upper <= high:
            span.add(map_age_group(upper))
    return {normalize_age_group(g) or g for g in span}


# Above this, the per-sample ages are too far apart for the median to describe
# one person, and the row gets a "?" — read it as "go and look at the clip",
# not as a verdict. It cannot decide anything on its own: the same wide spread
# comes from a clip that cuts between a child and an adult AND from one child
# held in a hard profile that the model reads badly. children_classroom_
# raising_hands is the second kind and is scored; children_teacher_learning is
# the first kind and is not. Which is which lives in the manifest, because it
# is a property of the clip — deciding it from the model's own jitter would let
# a jumpier checkpoint quietly exclude its own worst clips and be compared on a
# smaller, easier set.
WIDE_SPREAD_YEARS = 12.0

# eval_band for a clip whose largest face is not one person throughout. Printed,
# never scored: there is no single right answer to score it against.
NO_STABLE_SUBJECT = "-"


def measure(video: Path, est: AgeGenderEstimator, samples: int) -> tuple[list[float], int]:
    """Predicted age of the largest face in each of `samples` frames."""
    from ultralytics import YOLO

    global _DET
    try:
        _DET
    except NameError:
        _DET = YOLO(str(CFG.face_weights))

    cap = cv2.VideoCapture(str(video))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ages: list[float] = []
    biggest = 0
    for frame_no in (int(total * p) for p in np.linspace(0.08, 0.92, samples)):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ok, frame = cap.read()
        if not ok:
            continue
        result = _DET.predict(frame, conf=0.4, verbose=False)[0]
        boxes = result.boxes.xyxy.cpu().numpy() if result.boxes is not None else np.empty((0, 4))
        if len(boxes) == 0:
            continue
        idx = int(np.argmax((boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])))
        box = tuple(boxes[idx].astype(int))
        biggest = max(biggest, int(max(box[2] - box[0], box[3] - box[1])))
        face = crop_face(frame, box)
        if face is None or min(face.shape[:2]) < CFG.min_face_px_for_age:
            continue
        out = est.estimate(face)
        if out:
            ages.append(out.age)
    cap.release()
    return ages, biggest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default=str(CFG.mivolo_ckpt), help="checkpoint to score (default: CFG.mivolo_ckpt)")
    ap.add_argument("--samples", type=int, default=8, help="frames sampled per clip")
    args = ap.parse_args()

    manifest = read_manifest()
    clips = sorted(CLIPS_DIR.glob("*.mp4"))
    if not clips:
        print(f"Không có clip nào trong {CLIPS_DIR} — chạy `bash eval/age_kids/fetch.sh` trước.")
        return 1

    # weights=None skips the ONNX branch so --ckpt is honoured even when an ONNX
    # export happens to be on disk; see the precedence note in configs.py.
    est = AgeGenderEstimator(weights=None, ckpt=args.ckpt)

    print(f"checkpoint: {args.ckpt}")
    print(f"bins      : {' '.join(label for _, label in CFG.age_bins)}\n")
    header = f"{'clip':42} {'px':>4} {'band':>7} {'pred':>6} {'spread':>6} {'group':>7} {'expected':>16}  ok"
    print(header)
    print("-" * len(header))

    # One pass, then every summary is computed from it. Re-running `measure`
    # per summary would triple a run that is already minutes long.
    results: list[tuple[str, float, str, set[str], float]] = []
    wide: list[tuple[str, float, float, bool]] = []

    for clip in clips:
        if clip.name not in manifest:
            print(f"{clip.name[:42]:42} {'':>4} {'—':>7}  (không có trong manifest)")
            continue
        meta = manifest[clip.name]
        ages, px = measure(clip, est, args.samples)
        band = f"{meta[0]:g}-{meta[1]:g}" if meta else NO_STABLE_SUBJECT
        expected = groups_spanned(*meta) if meta else set()
        exp_txt = "/".join(sorted(expected)) if expected else "—"
        if not ages:
            print(f"{clip.name[:42]:42} {px:>4} {band:>7} {'—':>6} {'—':>6} {'—':>7} {exp_txt:>16}  -")
            continue

        age = statistics.median(ages)
        spread = max(ages) - min(ages)
        group = normalize_age_group(map_age_group(age)) or map_age_group(age)
        if meta is None:
            mark = "—"
        else:
            results.append((clip.name, age, group, expected, sum(meta) / 2))
            mark = "✓" if group in expected else "✗"
        if spread > WIDE_SPREAD_YEARS:
            wide.append((clip.name, min(ages), max(ages), meta is not None))
            mark += "?"
        print(f"{clip.name[:42]:42} {px:>4} {band:>7} {age:>6.1f} {spread:>6.1f} {group:>7} {exp_txt:>16}"
              f"  {mark}")

    graded = results
    if not graded:
        print("\nKhông chấm được clip nào.")
        return 1
    hits = sum(1 for _, _, g, exp, _ in graded if g in exp)
    print(f"\nGroup accuracy : {hits}/{len(graded)} = {hits / len(graded):.0%}")
    print(f"MAE (chỉ thị)  : {statistics.mean(abs(a - mid) for _, a, _, _, mid in graded):.2f} "
          f"năm so với trung điểm band ước lượng bằng mắt")

    # Per-prefix, because the set is deliberately unbalanced: the farfield_
    # clips exist to fail, and averaging them in hides how the near-field
    # brackets actually do.
    print("\nTheo nhóm clip:")
    for prefix in ("baby_", "child_", "children_", "teen_", "mixed_", "farfield_"):
        sub = [r for r in graded if r[0].startswith(prefix)]
        if sub:
            print(f"  {prefix:11} {sum(1 for _, _, g, exp, _ in sub if g in exp)}/{len(sub)}")

    misses = [(n, a, g, exp) for n, a, g, exp, _ in graded if g not in exp]
    if misses:
        print("\nSai:")
        for name, age, group, expected in misses:
            print(f"  {name} — kỳ vọng {'/'.join(sorted(expected))}, đo được {group} ({age:.1f}y)")

    skipped = [n for n, m in manifest.items() if m is None]
    if skipped:
        print(f"\nKhông chấm ({NO_STABLE_SUBJECT} trong manifest — mặt lớn nhất đổi người giữa clip):")
        for name in sorted(skipped):
            print(f"  {name}")

    if wide:
        print(f"\nChênh lệch giữa các mẫu > {WIDE_SPREAD_YEARS:g} năm — nên xem lại clip:")
        for name, lo, hi, was_scored in wide:
            note = "" if was_scored else "  (đã bỏ qua)"
            print(f"  {name} — {lo:.1f}y .. {hi:.1f}y{note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
