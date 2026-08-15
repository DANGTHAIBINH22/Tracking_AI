import os
import sys
import time
import cv2
import numpy as np

# Thêm thư mục gốc vào path để import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline import Pipeline
from preprocess import preprocess
from tracker import FaceTracker
from head_pose import HeadPoseEstimator
from age_gender import AgeGenderEstimator
from configs import CFG

def benchmark_pipeline(num_frames=100):
    print(f"[EVAL FPS] Bắt đầu benchmark hiệu năng trên {num_frames} khung hình giả lập...")
    
    # Tạo frame giả lập (640x480)
    frame = np.ones((480, 640, 3), dtype=np.uint8) * 128
    # Vẽ mặt giả lập để mô hình có khuôn mặt thực tế xử lý
    cv2.circle(frame, (320, 240), 100, (200, 200, 200), -1)
    cv2.circle(frame, (290, 220), 10, (0, 0, 0), -1)
    cv2.circle(frame, (350, 220), 10, (0, 0, 0), -1)
    cv2.circle(frame, (320, 260), 5, (0, 0, 0), -1)
    
    # Khởi tạo từng cấu phần để đo độc lập
    print("[EVAL FPS] Khởi tạo các cấu phần...")
    t_start = time.time()
    tracker = FaceTracker()
    pose_estimator = HeadPoseEstimator()
    age_gender = AgeGenderEstimator()
    print(f"[EVAL FPS] Thời gian khởi tạo: {round(time.time() - t_start, 2)}s")
    
    # Warmup
    print("[EVAL FPS] Khởi động nguội (Warmup)...")
    frame_prep = preprocess(frame)
    tracks = tracker.update(frame_prep)
    if tracks:
        face_crop = frame_prep[tracks[0].bbox[1]:tracks[0].bbox[3], tracks[0].bbox[0]:tracks[0].bbox[2]]
        if face_crop.size > 0:
            pose_estimator.estimate(face_crop)
            age_gender.estimate(face_crop)
            
    # Bắt đầu đo
    times = {
        "preprocess": 0.0,
        "detection_tracking": 0.0,
        "pose_estimation": 0.0,
        "age_gender_estimation": 0.0,
        "total_pipeline": 0.0
    }
    
    pipeline = Pipeline()
    
    print("[EVAL FPS] Bắt đầu thực thi vòng lặp benchmark...")
    for i in range(num_frames):
        # 1. Đo Preprocess
        t0 = time.perf_counter()
        prep = preprocess(frame)
        times["preprocess"] += time.perf_counter() - t0
        
        # 2. Đo Detection + Tracking
        t0 = time.perf_counter()
        tracks = tracker.update(prep)
        times["detection_tracking"] += time.perf_counter() - t0
        
        # 3. Đo Pose và Age/Gender nếu có mặt
        if tracks:
            t = tracks[0]
            face_bgr = prep[t.bbox[1]:t.bbox[3], t.bbox[0]:t.bbox[2]]
            if face_bgr.size > 0:
                # Pose
                t0 = time.perf_counter()
                pose_estimator.estimate(face_bgr)
                times["pose_estimation"] += time.perf_counter() - t0
                
                # Age/Gender
                t0 = time.perf_counter()
                age_gender.estimate(face_bgr)
                times["age_gender_estimation"] += time.perf_counter() - t0
                
        # 4. Đo toàn bộ Pipeline tích hợp
        t0 = time.perf_counter()
        pipeline.process(prep, now=i/25.0, source_frame=frame)
        times["total_pipeline"] += time.perf_counter() - t0
        
    # Tính toán kết quả trung bình (ms/frame)
    print("\n" + "="*70)
    print(" KẾT QUẢ ĐO HIỆU NĂNG VÀ TỐC ĐỘ XỬ LÝ (FPS BENCHMARK)")
    print("="*70)
    print(f"{'Khâu xử lý':<30} | {'Thời gian TB (ms/frame)':<25} | {'Tỷ lệ (%)':<10}")
    print("-"*70)
    
    total_measured = sum([times["preprocess"], times["detection_tracking"], times["pose_estimation"], times["age_gender_estimation"]])
    
    for stage, t_val in times.items():
        if stage == "total_pipeline":
            continue
        avg_ms = (t_val / num_frames) * 1000
        pct = (t_val / total_measured) * 100 if total_measured > 0 else 0
        print(f"{stage:<30} | {round(avg_ms, 2):<25} | {round(pct, 1):<10}%")
        
    print("-"*70)
    avg_pipeline_ms = (times["total_pipeline"] / num_frames) * 1000
    fps = 1000 / avg_pipeline_ms if avg_pipeline_ms > 0 else 0
    print(f"{'TOÀN BỘ PIPELINE TÍCH HỢP':<30} | {round(avg_pipeline_ms, 2):<25} | FPS: {round(fps, 1)}")
    print("="*70)
    print("[EVAL FPS] Đánh giá hoàn tất.\n")

if __name__ == "__main__":
    benchmark_pipeline()
