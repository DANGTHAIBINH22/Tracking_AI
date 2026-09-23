"""Unified AI Model and Asset Preparation Script for Smart Digital Signage System.

Runs checks, downloads missing model weights, verifies model integrity,
and prepares all required data assets before starting the main application.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.request
from pathlib import Path

# Paths
ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
DATA_DIR = ROOT / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = ROOT / "outputs"


def download_with_progress(url: str, dest_path: Path, desc: str = "Tải về"):
    """Download a file over HTTP with a live terminal progress indicator."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_suffix(dest_path.suffix + ".tmp")
    print(f"[*] {desc}: {dest_path.name}")
    print(f"    URL: {url}")

    def reporthook(count, block_size, total_size):
        if total_size <= 0:
            return
        downloaded = count * block_size
        percent = min(100.0, downloaded * 100.0 / total_size)
        mb_down = downloaded / (1024 * 1024)
        mb_total = total_size / (1024 * 1024)
        bar_len = 30
        filled_len = int(bar_len * percent / 100)
        bar = "█" * filled_len + "-" * (bar_len - filled_len)
        sys.stdout.write(f"\r    [{bar}] {percent:5.1f}% ({mb_down:5.1f}/{mb_total:5.1f} MB)")
        sys.stdout.flush()

    try:
        urllib.request.urlretrieve(url, str(temp_path), reporthook)
        if temp_path.exists():
            temp_path.replace(dest_path)
        print(f"\n[✓] Hoàn tất tải: {dest_path.name}")
        return True
    except Exception as e:
        print(f"\n[!] Lỗi tải {dest_path.name}: {e}")
        if temp_path.exists():
            temp_path.unlink()
        return False


def check_and_prepare_yolo() -> bool:
    """Check or download YOLOv8-Face weights."""
    weights_path = MODELS_DIR / "yolov8n-face.pt"
    url = "https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt"

    if weights_path.exists() and weights_path.stat().st_size > 1_000_000:
        size_mb = weights_path.stat().st_size / (1024 * 1024)
        print(f"[✓] YOLOv8-Face: Đã sẵn sàng ({size_mb:.1f} MB tại {weights_path})")
        return True

    print("[!] Chưa tìm thấy YOLOv8-Face weights. Đang tiến hành tải tự động...")
    ok = download_with_progress(url, weights_path, desc="Tải YOLOv8-Face")
    return ok and weights_path.exists()


def check_and_prepare_yolo_pets() -> bool:
    """Kiểm tra hoặc tải tự động YOLOv8n COCO weights cho nhận diện Thú cưng (Chó & Mèo)."""
    weights_path = MODELS_DIR / "yolov8n.pt"
    url = "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt"

    if weights_path.exists() and weights_path.stat().st_size > 1_000_000:
        size_mb = weights_path.stat().st_size / (1024 * 1024)
        print(f"[✓] YOLOv8n-COCO (Pets): Đã sẵn sàng ({size_mb:.1f} MB tại {weights_path})")
        return True

    print("[!] Chưa tìm thấy YOLOv8n weights. Đang tiến hành tải tự động...")
    ok = download_with_progress(url, weights_path, desc="Tải YOLOv8n (Pet Detection)")
    return ok and weights_path.exists()



def check_and_prepare_mivolo() -> bool:
    """Kiểm tra mô hình MiVOLO v2 ONNX và tệp dữ liệu trọng số, hoặc tự động xuất từ Hugging Face."""
    onnx_graph = MODELS_DIR / "mivolo_age_gender.onnx"
    onnx_data = MODELS_DIR / "mivolo_age_gender.onnx.data"

    has_graph = onnx_graph.exists() and onnx_graph.stat().st_size > 500_000
    has_data = onnx_data.exists() and onnx_data.stat().st_size > 50_000_000

    if has_graph and has_data:
        # Kiểm tra tính toàn vẹn và suy luận thử nghiệm qua ONNX Runtime
        try:
            import numpy as np
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            sess = ort.InferenceSession(str(onnx_graph), opts, providers=["CPUExecutionProvider"])
            inp_name = sess.get_inputs()[0].name
            test_in = np.zeros((1, 3, 384, 384), dtype=np.float32)
            _ = sess.run(None, {inp_name: test_in})
            size_mb = (onnx_graph.stat().st_size + onnx_data.stat().st_size) / (1024 * 1024)
            print(f"[✓] MiVOLO v2 ONNX: Đã sẵn sàng & kiểm tra suy luận thành công ({size_mb:.1f} MB, Input: {inp_name})")
            return True
        except Exception as e:
            print(f"[!] Cảnh báo kiểm tra ONNX: {e}. Tiến hành xuất lại mô hình...")

    print("[!] Chưa có file MiVOLO v2 ONNX hoặc file bị lỗi. Tiến hành xuất tự động từ Hugging Face...")
    try:
        from export_mivolo_onnx import export_onnx
        ok = export_onnx(str(onnx_graph))
        return ok and onnx_graph.exists() and onnx_data.exists()
    except Exception as e:
        print(f"[!] Lỗi xuất MiVOLO v2 ONNX: {e}")
        print("    👉 Gợi ý: Chạy lệnh độc lập để gỡ lỗi: uv run python export_mivolo_onnx.py")
        return False


def check_and_prepare_vlm(skip_vlm: bool = False) -> bool:
    """Pre-cache Moondream2 VLM model from Hugging Face Hub."""
    if skip_vlm:
        print("[-] Moondream2 VLM: Đã bỏ qua theo tùy chọn (--skip-vlm).")
        return True

    # Check if einops is installed first
    try:
        import einops
    except ImportError:
        print("[!] Moondream2 VLM: Chưa cài đặt thư viện 'einops'.")
        print("    👉 Để cài đặt đầy đủ VLM, vui lòng chạy: uv pip install -r requirements-vlm.txt")
        print("    👉 Hoặc chạy với cờ bỏ qua VLM nếu chỉ test camera: uv run python prepare_models.py --skip-vlm")
        return False

    print("[*] Đang kiểm tra / nạp trước mô hình Moondream2 VLM (~1.6 GB)...")
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, PreTrainedModel

        # Vá lỗi tương thích cho transformers >= 5.x với Moondream2 remote code
        if not hasattr(PreTrainedModel, "all_tied_weights_keys"):
            def _get_tied_keys(self):
                if not hasattr(self, "_all_tied_weights_keys_storage"):
                    self._all_tied_weights_keys_storage = {}
                return self._all_tied_weights_keys_storage

            def _set_tied_keys(self, val):
                self._all_tied_weights_keys_storage = val

            PreTrainedModel.all_tied_weights_keys = property(_get_tied_keys, _set_tied_keys)

        model_id = "vikhyatk/moondream2"
        print(f"    Nạp Tokenizer từ {model_id}...")
        _ = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        print(f"    Nạp Model weights từ {model_id}...")
        _ = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True)
        print("[✓] Moondream2 VLM: Đã tải và lưu vào cache Hugging Face thành công!")
        return True
    except Exception as e:
        print(f"[!] Lỗi nạp Moondream2 VLM: {e}")
        print("    (Gợi ý: Kiểm tra kết nối Internet hoặc chạy với cờ --skip-vlm)")
        return False


def check_demo_assets() -> int:
    """Verify demo advertising video assets in data/uploads/ or media/."""
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    target_dir = UPLOADS_DIR if (UPLOADS_DIR.exists() and list(UPLOADS_DIR.glob("*.mp4"))) else (ROOT / "media")
    target_dir.mkdir(parents=True, exist_ok=True)

    mp4_files = list(target_dir.glob("*.mp4"))
    count = len(mp4_files)
    if count >= 10:
        print(f"[✓] Kho Quảng cáo Demo: Đã có đủ {count} video H.264 tại {target_dir}")
    elif count > 0:
        print(f"[✓] Kho Quảng cáo Demo: Hiện có {count} video tại {target_dir}")
    else:
        print(f"[!] Chưa có video trong {target_dir}.")
    return count


def main():
    parser = argparse.ArgumentParser(
        description="Script chuẩn bị và kiểm tra toàn bộ AI Models & Assets cho hệ thống Standee AI."
    )
    parser.add_argument(
        "--skip-vlm",
        action="store_true",
        help="Bỏ qua việc tải trước mô hình Moondream2 VLM (tiết kiệm băng thông ~1.6 GB khi chỉ test camera).",
    )
    args = parser.parse_args()

    print("=" * 66)
    print("🚀 BẮT ĐẦU CHUẨN BỊ TOÀN BỘ AI MODELS & ASSETS (SMART STANDEE)")
    print("=" * 66)
    t0 = time.perf_counter()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    status_yolo = check_and_prepare_yolo()
    print("-" * 66)
    status_pets = check_and_prepare_yolo_pets()
    print("-" * 66)
    status_mivolo = check_and_prepare_mivolo()
    print("-" * 66)
    status_vlm = check_and_prepare_vlm(skip_vlm=args.skip_vlm)
    print("-" * 66)
    ad_count = check_demo_assets()

    elapsed = time.perf_counter() - t0
    print("=" * 66)
    print("📊 BẢNG TỔNG HỢP TRẠNG THÁI HỆ THỐNG (READINESS CHECKLIST)")
    print("=" * 66)
    print(f"  1. YOLOv8-Face (Detection):       {'[✓] SẴN SÀNG' if status_yolo else '[❌] THIẾU'}")
    print(f"  2. YOLOv8n-COCO (Pet Tracking):   {'[✓] SẴN SÀNG' if status_pets else '[❌] THIẾU'}")
    print(f"  3. MiVOLO v2 ONNX (Age & Gender): {'[✓] SẴN SÀNG' if status_mivolo else '[❌] THIẾU'}")
    print(f"  4. Moondream2 (Ambient VLM):      {'[✓] SẴN SÀNG / SKIP' if status_vlm else '[!] CHƯA TẢI'}")
    print(f"  5. Video Clips Quảng Cáo Demo:    {'[✓] ' + str(ad_count) + ' VIDEOS' if ad_count > 0 else '[❌] THIẾU'}")
    print("=" * 66)

    if status_yolo and status_mivolo and status_pets:
        print(f"🎉 TẤT CẢ TÀI NGUYÊN CỐT LÕI ĐÃ SẴN SÀNG! (Thời gian kiểm tra: {elapsed:.2f}s)")
        print("👉 Bây giờ bạn có thể khởi chạy ứng dụng:")
        print("   - Khởi động Backend: uv run python run_server.py")
        print("   - Khởi động Frontend Web: cd web && npm run dev")
    else:
        print("⚠️ Vẫn còn một số trọng số chưa được thiết lập đầy đủ. Vui lòng kiểm tra lại log bên trên.")


if __name__ == "__main__":
    main()
