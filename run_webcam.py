"""Entrypoint: read the webcam, run the pipeline, show the debug overlay.

    uv run python run_webcam.py

Phase 1 milestone: this shows YOLO-face boxes live and prints the raw FPS.
Stages light up as later phases land. Press 'q' to quit.
"""

from __future__ import annotations

import time
import math
import cv2
import numpy as np

from configs import CFG, OUTPUTS_DIR
from pipeline import Pipeline
from preprocess import preprocess
from viz import draw_person, draw_fps

def create_mock_frame(t: float) -> np.ndarray:
    """Tạo frame giả lập có khuôn mặt chuyển động tròn và thay đổi hướng nhìn."""
    frame = np.ones((480, 640, 3), dtype=np.uint8) * 128
    
    # Tính tọa độ tâm mặt di chuyển theo hình tròn
    cx = int(320 + 120 * math.cos(t * 0.8))
    cy = int(240 + 60 * math.sin(t * 1.2))
    
    # Hướng quay đầu thay đổi liên tục (phục vụ test solvePnP)
    yaw = 30 * math.sin(t * 1.5)
    pitch = 20 * math.cos(t * 1.1)
    
    # Vẽ đầu
    cv2.circle(frame, (cx, cy), 80, (220, 220, 220), -1)
    
    # Tính độ lệch mắt/mũi/miệng dựa trên góc quay đầu yaw và pitch
    dx = int(yaw * 0.8)
    dy = int(pitch * 0.8)
    
    # Vẽ các thành phần khuôn mặt bị lệch đi theo góc quay
    cv2.circle(frame, (cx - 25 + dx, cy - 15 + dy), 12, (50, 50, 50), -1) # Mắt trái
    cv2.circle(frame, (cx + 25 + dx, cy - 15 + dy), 12, (50, 50, 50), -1) # Mắt phải
    cv2.circle(frame, (cx + dx, cy + 10 + dy), 6, (30, 30, 30), -1)       # Mũi
    cv2.ellipse(frame, (cx + dx, cy + 35 + dy), (25, 10), 0, 0, 180, (0, 0, 0), 2) # Miệng
    
    return frame

def open_camera():
    """Thử mở camera với các chỉ số và backend khác nhau.
    
    Nếu không mở được, trả về None để chạy luồng giả lập.
    """
    backends = [None, cv2.CAP_AVFOUNDATION]
    indices = [CFG.camera_index, 0, 1, 2]
    # Loại bỏ chỉ số trùng lặp
    indices = list(dict.fromkeys(indices))
    
    for backend in backends:
        for idx in indices:
            try:
                if backend is not None:
                    cap = cv2.VideoCapture(idx, backend)
                else:
                    cap = cv2.VideoCapture(idx)
                    
                if cap.isOpened():
                    # Thử đọc 1 frame để đảm bảo camera hoạt động thực sự
                    ok, _ = cap.read()
                    if ok:
                        print(f"[Webcam] Mở camera thành công: Index {idx} (Backend: {backend})")
                        return cap
                    cap.release()
            except Exception:
                pass
    return None

def main() -> None:
    # Tự động tải weights YOLO-face nếu chưa tồn tại
    if not CFG.face_weights.exists():
        print(f"[Webcam] Không tìm thấy file weights YOLO-face tại: {CFG.face_weights}")
        print("[Webcam] Đang tải tự động từ Hugging Face (dung lượng khoảng 6MB)...")
        CFG.face_weights.parent.mkdir(parents=True, exist_ok=True)
        import urllib.request
        url = "https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt"
        try:
            urllib.request.urlretrieve(url, str(CFG.face_weights))
            print(f"[Webcam] Tải thành công! File lưu tại: {CFG.face_weights}")
        except Exception as e:
            print(f"[Webcam] Lỗi tải tự động: {e}. Vui lòng tự tải tệp tin từ link {url} và lưu vào thư mục models/.")

    print("[Webcam] Đang khởi động luồng đọc camera...")
    cap = open_camera()
    use_mock = False
    
    if cap is None:
        print("[Webcam] CẢNH BÁO: Không mở được bất kỳ camera vật lý nào (có thể do quyền AVFoundation của MacOS).")
        print("[Webcam] TỰ ĐỘNG CHUYỂN SANG LUỒNG MOCK KHUÔN MẶT GIẢ LẬP ĐỂ TEST PIPELINE.")
        use_mock = True

    pipe = Pipeline()
    pipe.start()
    prev = time.time()
    start_time = time.time()
    
    try:
        while True:
            if use_mock:
                t = time.time() - start_time
                frame = create_mock_frame(t)
            else:
                ok, frame = cap.read()
                if not ok:
                    print("[Webcam] Lỗi đọc frame từ camera.")
                    break

            # Tiền xử lý
            frame_prep = preprocess(frame)
            metas = pipe.process(frame_prep, source_frame=frame)
            for m in metas:
                draw_person(frame_prep, m)

            now = time.time()
            draw_fps(frame_prep, 1.0 / max(now - prev, 1e-6))
            prev = now

            # Vẽ bảng bối cảnh VLM nếu bật
            if CFG.vlm_enabled:
                context = pipe.latest_context
                overlay = frame_prep.copy()
                cv2.rectangle(overlay, (10, 30), (320, 150), (50, 50, 50), -1)
                cv2.addWeighted(overlay, 0.6, frame_prep, 0.4, 0, frame_prep)
                cv2.putText(frame_prep, "AMBIENT CONTEXT (VLM):", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
                cv2.putText(frame_prep, f"Weather: {context.weather}", (20, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                cv2.putText(frame_prep, f"Activity: {context.crowd_activity}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                cv2.putText(frame_prep, f"Objects: {', '.join(context.objects)}", (20, 125), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

            window_name = "tracking-cv (webcam - Demo)"
            if use_mock:
                window_name += " [MOCK IMAGE STREAM]"
                
            cv2.imshow(window_name, frame_prep)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        pipe.stop()
        if cap is not None:
            cap.release()
        cv2.destroyAllWindows()
        print("[Webcam] Giải phóng tài nguyên camera.")

        # Lưu báo cáo
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
