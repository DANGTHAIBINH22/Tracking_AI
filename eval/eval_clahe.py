import os
import sys
import cv2
import numpy as np

# Thêm thư mục gốc vào path để import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from preprocess import apply_clahe
from detector import FaceDetector
from configs import CFG

def generate_mock_backlit_image():
    """Tạo ảnh giả lập ngược sáng để làm kiểm thử."""
    img = np.ones((480, 640, 3), dtype=np.uint8) * 200
    
    # Khuôn mặt giả lập
    cv2.circle(img, (320, 240), 100, (220, 220, 220), -1)  # Đầu
    cv2.circle(img, (280, 210), 15, (50, 50, 50), -1)      # Mắt trái
    cv2.circle(img, (360, 210), 15, (50, 50, 50), -1)      # Mắt phải
    cv2.circle(img, (320, 260), 8, (30, 30, 30), -1)       # Mũi
    cv2.ellipse(img, (320, 300), (40, 15), 0, 0, 180, (0, 0, 0), 3)  # Miệng
    
    # Áp dụng bóng tối ngược sáng bằng gradient
    rows, cols = img.shape[:2]
    mask = np.zeros((rows, cols), dtype=np.float32)
    cv2.circle(mask, (320, 240), 220, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (201, 201), 0)
    
    backlit_img = img.astype(np.float32)
    for c in range(3):
        backlit_img[:, :, c] = backlit_img[:, :, c] * (1.0 - 0.75 * mask)
        
    return np.clip(backlit_img, 0, 255).astype(np.uint8)

def run_evaluation(image_path=None):
    print("[EVAL CLAHE] Bắt đầu đánh giá hiệu năng tiền xử lý chống ngược sáng...")
    
    if image_path and os.path.exists(image_path):
        img_bgr = cv2.imread(image_path)
        print(f"[EVAL CLAHE] Sử dụng ảnh thực tế: {image_path}")
    else:
        img_bgr = generate_mock_backlit_image()
        print("[EVAL CLAHE] Sử dụng ảnh giả lập ngược sáng tự động.")
        
    # Áp dụng CLAHE
    img_clahe = apply_clahe(img_bgr)
    
    # Nhận diện mặt (Ngưỡng tin cậy thấp để dễ kiểm chứng độ nhạy)
    CFG.conf_threshold = 0.3
    detector = FaceDetector()
    
    rgb_no_clahe = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    rgb_clahe = cv2.cvtColor(img_clahe, cv2.COLOR_BGR2RGB)
    
    faces_no_clahe = detector.detect(rgb_no_clahe)
    faces_clahe = detector.detect(rgb_clahe)
    
    # Đo độ tương phản (Độ lệch chuẩn std của kênh L)
    l_no_clahe = cv2.split(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB))[0]
    l_clahe = cv2.split(cv2.cvtColor(img_clahe, cv2.COLOR_BGR2LAB))[0]
    contrast_no_clahe = np.std(l_no_clahe)
    contrast_clahe = np.std(l_clahe)
    
    # Hiển thị bảng
    print("\n" + "="*60)
    print(" BẢNG KIỂM THỬ THỰC NGHIỆM TIỀN XỬ LÝ CHỐNG NGƯỢC SÁNG (CLAHE)")
    print("="*60)
    print(f"{'Tiêu chí đánh giá':<25} | {'Ảnh Gốc (Ngược Sáng)':<22} | {'Ảnh Sau CLAHE':<15}")
    print("-"*60)
    print(f"{'Số khuôn mặt phát hiện':<25} | {len(faces_no_clahe):<22} | {len(faces_clahe):<15}")
    
    score_no_clahe = round(faces_no_clahe[0].confidence, 4) if faces_no_clahe else 0.0
    score_clahe = round(faces_clahe[0].confidence, 4) if faces_clahe else 0.0
    print(f"{'Độ tự tin tối đa (Conf)':<25} | {score_no_clahe:<22} | {score_clahe:<15}")
    print(f"{'Độ tương phản (Std Dev)':<25} | {round(contrast_no_clahe, 2):<22} | {round(contrast_clahe, 2):<15}")
    print("="*60)
    print("[EVAL CLAHE] Đánh giá hoàn tất.\n")

if __name__ == "__main__":
    img_arg = sys.argv[1] if len(sys.argv) > 1 else None
    run_evaluation(img_arg)
