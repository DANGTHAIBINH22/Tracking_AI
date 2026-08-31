# Hướng dẫn Tải và Thiết lập các Trọng số Mô hình (Model Weights Guide)

Tài liệu này hướng dẫn chi tiết cách chuẩn bị các tệp trọng số (model weights) cần thiết để chạy lõi AI Pipeline của đồ án tốt nghiệp.

---

## I. Bảng Tổng Hợp Trọng Số Mô Hình

| Tên Mô Hình | Tệp Tin Chỉ Định | Dung Lượng | Vị Trí Lưu Trữ | Vai Trò Trong Hệ Thống |
| :--- | :--- | :--- | :--- | :--- |
| **YOLOv8-Face** | `yolov8n-face.pt` | ~6.1 MB | `models/yolov8n-face.pt` | Phát hiện khuôn mặt (Face Detection) |
| **MiVOLO ONNX (Real)** | `mivolo_age_gender.onnx` | ~92.2 MB | `models/mivolo_age_gender.onnx` | Ước lượng Tuổi & Giới tính từ vùng mặt |
| **Moondream VLM** | `vikhyat/moondream2` | ~1.6 GB | Thư mục cache mặc định của HF Hub | Nhận diện bối cảnh (Thời tiết, Đám đông, Vật thể) |

*Lưu ý: Tất cả các tệp trong thư mục `models/` đã được cấu hình tự động bỏ qua (ignored) bởi Git để tránh làm nặng kho lưu trữ mã nguồn.*

---

## II. Hướng Dẫn Tải Chi Tiết

### 1. YOLOv8-Face (`yolov8n-face.pt`)
*   **Cơ chế tự động:** Khi bạn chạy hệ thống lần đầu thông qua `run_webcam.py`, `run_video.py` hoặc `test_pipeline_dryrun.py`, hệ thống sẽ tự động phát hiện nếu file bị thiếu và tải trực tiếp từ Hugging Face về thư mục `models/` cho bạn.
*   **Tải thủ công:** Nếu máy chạy offline hoặc mạng bị chặn, bạn có thể tải thủ công theo liên kết dưới đây và đặt vào thư mục `models/`:
    *   **Link tải trực tiếp:** [Hugging Face - YOLOv8-Face](https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt)

---

### 2. MiVOLO ONNX (`mivolo_age_gender.onnx`)
Do tệp trọng số ONNX chính thức được bọc cấu trúc tùy biến và không được phân phối trực tiếp dạng file tĩnh trên internet, bạn thực hiện xuất mô hình chính gốc sang ONNX bằng script đã chuẩn bị sẵn theo các bước sau:

**Các bước tự tạo file ONNX thật từ Hugging Face:**
1.  Đảm bảo môi trường ảo đã được kích hoạt:
    ```bash
    source .venv/bin/activate
    ```
2.  Cài đặt các thư viện bổ sung cần thiết phục vụ quá trình xuất ONNX:
    ```bash
    uv pip install setuptools timm==1.0.28 transformers==5.16.1 onnxscript
    ```
3.  Chạy script trích xuất mô hình được chuẩn bị sẵn:
    ```bash
    PYTHONPATH=. python -c "import urllib.request; urllib.request.urlretrieve('https://raw.githubusercontent.com/binhdang/UIT/main/test_wrapper_export.py', 'test_wrapper_export.py'); import subprocess; subprocess.run(['python', 'test_wrapper_export.py'])"
    ```
    *Script này sẽ tự động tải checkpoint MiVOLO v2 chính thức từ Hugging Face, bọc ảnh mặt đầu vào 3 kênh, giải quyết lỗi lệch tham số do nâng cấp thư viện và xuất ra tệp ONNX chuẩn đặt tại `models/mivolo_age_gender.onnx`.*

---

### 3. Moondream VLM (`vikhyat/moondream2`)
*   **Cơ chế:** Mô hình VLM được tải trực tiếp bằng thư viện `transformers` và được cache tự động bởi hệ thống tại thư mục của người dùng (user cache).
*   **Cách kích hoạt:**
    1.  Mở tệp cấu hình `configs.py` và đặt cờ `vlm_enabled = True`.
    2.  Cài đặt các thư viện VLM bổ sung:
        ```bash
        uv pip install -r requirements-vlm.txt
        ```
    3.  Đảm bảo máy tính có kết nối mạng Internet ở lần chạy đầu tiên. Hệ thống sẽ tự động tải xuống và nạp mô hình tối ưu theo phần cứng biên của bạn (sử dụng MPS trên Apple Silicon, CUDA trên GPU Nvidia hoặc FP32 trên CPU).
