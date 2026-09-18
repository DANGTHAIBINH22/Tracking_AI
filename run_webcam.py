"""Entrypoint: read the webcam, run the pipeline, show the debug overlay.

    uv run python run_webcam.py

Phase 1 milestone: this shows YOLO-face boxes live and prints the raw FPS.
Stages light up as later phases land. Press 'q' to quit.
"""

from __future__ import annotations

import warnings

warnings.filterwarnings("ignore")

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
    cv2.circle(frame, (cx - 25 + dx, cy - 15 + dy), 12, (50, 50, 50), -1)  # Mắt trái
    cv2.circle(frame, (cx + 25 + dx, cy - 15 + dy), 12, (50, 50, 50), -1)  # Mắt phải
    cv2.circle(frame, (cx + dx, cy + 10 + dy), 6, (30, 30, 30), -1)  # Mũi
    cv2.ellipse(
        frame, (cx + dx, cy + 35 + dy), (25, 10), 0, 0, 180, (0, 0, 0), 2
    )  # Miệng

    return frame


import threading


class CameraStream:
    """Đọc camera trong background thread độc lập để luôn giữ frame mới nhất.
    Loại bỏ hoàn toàn hiện tượng dồn hàng đợi (buffer queue) của OpenCV trên macOS
    khiến hình ảnh bị trễ (lag/delay) sau vài giây chạy.
    """

    def __init__(self, cap: cv2.VideoCapture):
        self.cap = cap
        self.lock = threading.Lock()
        self.running = True
        self.frame = None
        self.ok = False
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()
        # Đợi frame đầu tiên sẵn sàng
        for _ in range(50):
            with self.lock:
                if self.ok and self.frame is not None:
                    break
            time.sleep(0.02)

    def _worker(self):
        while self.running:
            ok, frame = self.cap.read()
            if ok:
                with self.lock:
                    self.frame = frame
                    self.ok = True
            else:
                with self.lock:
                    self.ok = False
                break
            time.sleep(0.002)

    def read(self) -> tuple[bool, np.ndarray | None]:
        with self.lock:
            if self.frame is not None:
                return self.ok, self.frame.copy()
            return self.ok, None

    def release(self):
        self.running = False
        if self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self.cap.release()


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
                    # Đặt độ phân giải phần cứng trực tiếp về 640x480 để tránh chuyển tải ảnh 1080p nặng
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    cap.set(cv2.CAP_PROP_FPS, 30)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    # Thử đọc 1 frame để đảm bảo camera hoạt động thực sự
                    ok, _ = cap.read()
                    if ok:
                        print(
                            f"[Webcam] Mở camera thành công: Index {idx} (Backend: {backend})"
                        )
                        return cap
                    cap.release()
            except Exception:
                pass
    return None


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Real-time Audience Tracking CV Pipeline")
    parser.add_argument(
        "--source",
        default=None,
        help="Camera index (e.g. '0') or video file path (e.g. 'data/store-aisle-detection.mp4').",
    )
    args = parser.parse_args()

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
            print(
                f"[Webcam] Lỗi tải tự động: {e}. Vui lòng tự tải tệp tin từ link {url} và lưu vào thư mục models/."
            )

    is_file_source = False
    cap = None
    stream = None
    use_mock = False
    video_fps = 30.0

    if args.source and not args.source.isdigit():
        # Source là đường dẫn video file
        print(f"[Video] Đang mở tệp video: {args.source}")
        cap = cv2.VideoCapture(args.source)
        if not cap.isOpened():
            print(f"[Video] Không thể mở tệp: {args.source}. Chuyển sang tìm webcam...")
            cap = None
        else:
            is_file_source = True
            vf = cap.get(cv2.CAP_PROP_FPS)
            if vf and vf > 0:
                video_fps = vf
            print(f"[Video] Mở video thành công ({video_fps:.1f} FPS, tự động lặp lại)")

    if not is_file_source:
        print("[Webcam] Đang khởi động luồng đọc camera...")
        cap = open_camera()
        if cap is None:
            print(
                "[Webcam] CẢNH BÁO: Không mở được bất kỳ camera vật lý nào (có thể do quyền AVFoundation của MacOS)."
            )
            print(
                "[Webcam] TỰ ĐỘNG CHUYỂN SANG LUỒNG MOCK KHUÔN MẶT GIẢ LẬP ĐỂ TEST PIPELINE."
            )
            use_mock = True
        else:
            stream = CameraStream(cap)

    pipe = Pipeline()
    pipe.start()
    prev = time.time()
    start_time = time.time()

    try:
        while True:
            t_frame_start = time.perf_counter()
            if use_mock:
                t = time.time() - start_time
                frame = create_mock_frame(t)
            elif is_file_source:
                ok, frame = cap.read()
                if not ok or frame is None:
                    # Tua lại đầu video để phát lặp liên tục
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    pipe.reset()
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        time.sleep(0.01)
                        continue
            else:
                ok, frame = stream.read()
                if not ok or frame is None:
                    time.sleep(0.005)
                    continue

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
                cv2.putText(
                    frame_prep,
                    "AMBIENT CONTEXT (VLM):",
                    (20, 50),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 255, 255),
                    1,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    frame_prep,
                    f"Weather: {context.weather}",
                    (20, 75),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    frame_prep,
                    f"Activity: {context.crowd_activity}",
                    (20, 100),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    frame_prep,
                    f"Objects: {', '.join(context.objects)}",
                    (20, 125),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA,
                )

            window_name = "tracking-cv (webcam - Demo)"
            if use_mock:
                window_name += " [MOCK IMAGE STREAM]"

            cv2.imshow(window_name, frame_prep)
            wait_ms = 1
            if is_file_source:
                time_spent = time.perf_counter() - t_frame_start
                wait_ms = max(1, int(((1.0 / video_fps) - time_spent) * 1000))
            if cv2.waitKey(wait_ms) & 0xFF == ord("q"):
                break

    finally:
        pipe.stop()
        if stream is not None:
            stream.release()
        elif cap is not None:
            cap.release()
        cv2.destroyAllWindows()
        print("[Webcam] Giải phóng tài nguyên camera.")

        # Lưu báo cáo
        if pipe._age_cache:
            out_csv = OUTPUTS_DIR / "webcam_report.csv"
            out_csv.parent.mkdir(exist_ok=True)
            import csv

            # _age_cache holds (age, age_group, gender) per track — unpacking two
            # of the three raised "too many values to unpack" on exit from any
            # session that had aged at least one face, i.e. the report was never
            # written. Age is a column of its own here because the bucket alone
            # throws away what the estimator actually said.
            fields = ["track_id", "age", "age_group", "gender"]
            with open(out_csv, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(fields)
                for tid, (age, age_grp, g) in pipe._age_cache.items():
                    writer.writerow([tid, age, age_grp, g])
            print(f"Saved live webcam session report to: {out_csv}")


if __name__ == "__main__":
    main()
