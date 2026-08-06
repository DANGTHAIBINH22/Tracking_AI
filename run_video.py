"""Entrypoint: run the pipeline over a test video and dump per-person metadata to CSV.

    uv run python run_video.py --video data/test.mp4 --out outputs/test.csv

The CSV (one row per person per frame) is the deliverable of the standalone CV
branch — the stable interface any app layer can consume later.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import cv2

from configs import OUTPUTS_DIR
from preprocess import preprocess
from pipeline import PersonMeta

CSV_FIELDS = ["frame", *PersonMeta.__annotations__.keys()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True, help="path to input video")
    ap.add_argument("--out", default=str(OUTPUTS_DIR / "metadata.csv"))
    args = ap.parse_args()

    OUTPUTS_DIR.mkdir(exist_ok=True)
    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open video {args.video}")

    # Dwell must be measured in video time, not in how fast we happen to decode.
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 25.0
        print(f"Video reports no FPS; assuming {fps} for dwell timing.")

    from pipeline import Pipeline
    pipe = Pipeline()

    with open(args.out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        frame_idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_prep = preprocess(frame)
            metas = pipe.process(frame_prep, now=frame_idx / fps, source_frame=frame)
            for m in metas:
                writer.writerow({"frame": frame_idx, **m.as_row()})
            frame_idx += 1
    cap.release()
    print(f"Successfully processed video and wrote CSV report to: {args.out}")



if __name__ == "__main__":
    main()
