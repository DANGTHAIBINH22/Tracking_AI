"""Entrypoint: run the pipeline over a test video and dump per-person metadata to CSV.

    uv run python run_video.py --video data/test.mp4 --out outputs/test.csv

The CSV (one row per person per frame) is the deliverable of the standalone CV
branch — the stable interface any app layer can consume later.
"""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

import argparse
import csv
from pathlib import Path

import cv2

import time
from configs import OUTPUTS_DIR, CFG
from preprocess import preprocess
from pipeline import PersonMeta
from viz import draw_person, draw_fps

CSV_FIELDS = ["frame", *PersonMeta.__annotations__.keys(), "weather", "crowd_activity", "objects"]


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

    # Tự động tải weights YOLO-face nếu chưa tồn tại
    if not CFG.face_weights.exists():
        print(f"[Video] Không tìm thấy file weights YOLO-face tại: {CFG.face_weights}")
        print("[Video] Đang tải tự động từ Hugging Face (dung lượng khoảng 6MB)...")
        CFG.face_weights.parent.mkdir(parents=True, exist_ok=True)
        import urllib.request
        url = "https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt"
        try:
            urllib.request.urlretrieve(url, str(CFG.face_weights))
            print(f"[Video] Tải thành công! File lưu tại: {CFG.face_weights}")
        except Exception as e:
            print(f"[Video] Lỗi tải tự động: {e}. Vui lòng tự tải tệp tin từ link {url} và lưu vào thư mục models/.")

    from pipeline import Pipeline
    pipe = Pipeline()
    pipe.start()

    try:
        with open(args.out, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
            writer.writeheader()
            frame_idx = 0
            prev_time = time.time()
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                frame_prep = preprocess(frame)
                
                start_frame = time.time()
                metas = pipe.process(frame_prep, now=frame_idx / fps, source_frame=frame)
                
                # Trích xuất bối cảnh VLM
                ctx = pipe.latest_context
                weather = ctx.weather
                crowd_activity = ctx.crowd_activity
                objects_str = "|".join(ctx.objects) if isinstance(ctx.objects, list) else str(ctx.objects)
                
                for m in metas:
                    row = {
                        "frame": frame_idx,
                        **m.as_row(),
                        "weather": weather,
                        "crowd_activity": crowd_activity,
                        "objects": objects_str
                    }
                    writer.writerow(row)
                
                # Vẽ bounding boxes và các thuộc tính lên ảnh
                for m in metas:
                    draw_person(frame_prep, m)
                
                # Đo và vẽ FPS
                now_time = time.time()
                draw_fps(frame_prep, 1.0 / max(now_time - prev_time, 1e-6))
                prev_time = now_time
                
                # Vẽ HUD hiển thị bối cảnh VLM
                if CFG.vlm_enabled:
                    overlay = frame_prep.copy()
                    cv2.rectangle(overlay, (10, 30), (320, 150), (50, 50, 50), -1)
                    cv2.addWeighted(overlay, 0.6, frame_prep, 0.4, 0, frame_prep)
                    cv2.putText(frame_prep, "AMBIENT CONTEXT (VLM):", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
                    cv2.putText(frame_prep, f"Weather: {weather}", (20, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                    cv2.putText(frame_prep, f"Activity: {crowd_activity}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                    cv2.putText(frame_prep, f"Objects: {', '.join(ctx.objects)}", (20, 125), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                
                # Hiển thị màn hình trực quan thời gian thực
                cv2.imshow("Video Test Overlay (Press 'q' to Quit)", frame_prep)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    print("[Video] Dừng xử lý video sớm theo yêu cầu người dùng (nhấn Q).")
                    break
                
                # In log tiến trình xử lý của frame lên console
                duration_ms = (time.time() - start_frame) * 1000
                print(f"[Video] Frame {frame_idx:04d} | Xử lý: {duration_ms:.1f}ms | Đối tượng phát hiện: {len(metas)}")
                for idx, m in enumerate(metas):
                    gender_vn = "Nam" if m.gender == "M" else ("Nữ" if m.gender == "F" else "Chưa rõ")
                    att_str = "Có nhìn" if m.attention else "Không nhìn"
                    yaw_str = f"{m.yaw:.1f}°" if m.yaw is not None else "N/A"
                    pitch_str = f"{m.pitch:.1f}°" if m.pitch is not None else "N/A"
                    age_str = m.age_group if m.age_group else "Chưa rõ"
                    print(f"   └─ [{idx+1}/{len(metas)}] Người #{m.track_id:02d} | Giới tính: {gender_vn} | Tuổi: {age_str} | Góc đầu: Y:{yaw_str} P:{pitch_str} | Trạng thái: {att_str} | Dwell: {m.dwell_time:.1f}s")
                
                frame_idx += 1
    finally:
        pipe.stop()
        cap.release()
        cv2.destroyAllWindows()
    print(f"Successfully processed video and wrote CSV report to: {args.out}")



if __name__ == "__main__":
    main()
