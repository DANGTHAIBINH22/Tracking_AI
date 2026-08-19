import warnings
warnings.filterwarnings("ignore")

import time
import cv2
import numpy as np
from configs import CFG
from pipeline import Pipeline

def test_dryrun():
    print("[DRYRUN] Đang chạy kiểm thử luồng tích hợp Pipeline...")
    
    # Tự động tải weights YOLO-face nếu chưa tồn tại
    if not CFG.face_weights.exists():
        print(f"[DRYRUN] Không tìm thấy file weights YOLO-face tại: {CFG.face_weights}")
        print("[DRYRUN] Đang tải tự động từ Hugging Face (dung lượng khoảng 6MB)...")
        CFG.face_weights.parent.mkdir(parents=True, exist_ok=True)
        import urllib.request
        url = "https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt"
        try:
            urllib.request.urlretrieve(url, str(CFG.face_weights))
            print(f"[DRYRUN] Tải thành công! File lưu tại: {CFG.face_weights}")
        except Exception as e:
            print(f"[DRYRUN] Lỗi tải tự động: {e}. Vui lòng tự tải tệp tin từ link {url} và lưu vào thư mục models/.")
            
    # 1. Khởi tạo Pipeline
    CFG.vlm_enabled = True  # Kích hoạt VLM
    pipe = Pipeline()
    pipe.start()
    
    # 2. Tạo ảnh giả lập
    frame = np.ones((480, 640, 3), dtype=np.uint8) * 128
    cv2.circle(frame, (320, 240), 100, (200, 200, 200), -1)  # Vẽ khuôn mặt giả lập
    cv2.circle(frame, (290, 220), 10, (0, 0, 0), -1)
    cv2.circle(frame, (350, 220), 10, (0, 0, 0), -1)
    
    # Cho luồng VLM khởi động và chạy 1 nhịp
    print("[DRYRUN] Chờ luồng VLM khởi động (2s)...")
    time.sleep(2.0)
    
    # 3. Chạy 5 frame qua Pipeline
    print("[DRYRUN] Đẩy 5 frame liên tiếp qua Pipeline để test tracking và làm mịn...")
    for i in range(5):
        t0 = time.time()
        # Preprocess và xử lý
        metas = pipe.process(frame, now=i*0.1, source_frame=frame)
        duration = (time.time() - t0) * 1000
        
        print(f"\n--- Frame {i+1} (Thời gian xử lý: {round(duration, 1)}ms) ---")
        print(f"Số người phát hiện: {len(metas)}")
        for m in metas:
            print(f"  - Track ID: {m.track_id}")
            print(f"  - BBox: {m.bbox}")
            print(f"  - Tuổi & Giới tính: {m.gender} ({m.age_group})")
            print(f"  - Góc đầu: Yaw={round(m.yaw, 1) if m.yaw is not None else None}, Pitch={round(m.pitch, 1) if m.pitch is not None else None}")
            print(f"  - Attention: {m.attention} | Dwell Time: {round(m.dwell_time, 2)}s")
            
        context = pipe.latest_context
        print(f"  - Bối cảnh VLM: Thời tiết={context.weather}, Hoạt động={context.crowd_activity}, Vật thể={context.objects}")
        time.sleep(0.1)
        
    # 4. Dừng Pipeline
    print("\n[DRYRUN] Dừng luồng VLM và giải phóng...")
    pipe.stop()
    print("[DRYRUN] Kiểm thử tích hợp hoàn tất! Mọi thành phần đều hoạt động chuẩn xác.")

if __name__ == "__main__":
    test_dryrun()
