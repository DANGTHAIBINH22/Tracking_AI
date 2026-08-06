"""Entrypoint: read the webcam, run the pipeline, show the debug overlay.

    uv run python run_webcam.py

Phase 1 milestone: this shows YOLO-face boxes live and prints the raw FPS.
Stages light up as later phases land. Press 'q' to quit.
"""

from __future__ import annotations

import time

import cv2

from configs import CFG, OUTPUTS_DIR
from pipeline import Pipeline
from preprocess import preprocess
from viz import draw_person, draw_fps



def main() -> None:
    cap = cv2.VideoCapture(CFG.camera_index)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open webcam index {CFG.camera_index}")

    pipe = Pipeline()
    prev = time.time()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            # Preprocess scales the frame (e.g. 1920x1080 -> 640x360).
            # Pipeline expects preprocessed frame, and draw_person must draw on the frame matching those bbox coordinates.
            frame_prep = preprocess(frame)
            metas = pipe.process(frame_prep, source_frame=frame)
            for m in metas:
                draw_person(frame_prep, m)

            now = time.time()
            draw_fps(frame_prep, 1.0 / max(now - prev, 1e-6))
            prev = now

            cv2.imshow("tracking-cv (webcam - Phase 2)", frame_prep)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()

        # Save webcam metadata to outputs/webcam_report.csv
        if pipe._age_cache:
            out_csv = OUTPUTS_DIR / "webcam_report.csv"
            out_csv.parent.mkdir(exist_ok=True)
            import csv
            fields = ["track_id", "age_group", "gender"]
            with open(out_csv, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(fields)
                for tid, (age_grp, g) in pipe._age_cache.items():
                    writer.writerow([tid, age_grp, g])
            print(f"Saved live webcam session report to: {out_csv}")



if __name__ == "__main__":
    main()
