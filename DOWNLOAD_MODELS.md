# Hướng dẫn Tải và Thiết lập các Trọng số Mô hình (Model Weights Guide)

Tài liệu này hướng dẫn chi tiết cách chuẩn bị các tệp trọng số (model weights) cần thiết để chạy lõi AI Pipeline của đồ án tốt nghiệp.

---

## I. Bảng Tổng Hợp Trọng Số Mô Hình

| Tên Mô Hình | Tệp Tin Chỉ Định | Dung Lượng | Vị Trí Lưu Trữ | Vai Trò Trong Hệ Thống |
| :--- | :--- | :--- | :--- | :--- |
| **YOLOv8-Face** | `yolov8n-face.pt` | ~6.1 MB | `models/yolov8n-face.pt` | Phát hiện khuôn mặt (Face Detection) |
| **MiVOLO v2 (Lagenda)** | `mivolo_v2_lagenda.pth.tar` | ~115 MB | `models/mivolo_v2_lagenda.pth.tar` | Ước lượng Tuổi & Giới tính từ vùng mặt (**mặc định**, tuổi 0-122) |
| **MiVOLO ONNX (tuỳ chọn)** | `mivolo_age_gender.onnx` | ~92.2 MB | `models/mivolo_age_gender.onnx` | Đường dẫn ONNX thay thế — xem cảnh báo ở mục 2 |
| **Moondream VLM** | `vikhyat/moondream2` | ~1.6 GB | Thư mục cache mặc định của HF Hub | Nhận diện bối cảnh (Thời tiết, Đám đông, Vật thể) |

*Lưu ý: Tất cả các tệp trong thư mục `models/` đã được cấu hình tự động bỏ qua (ignored) bởi Git để tránh làm nặng kho lưu trữ mã nguồn.*

---

## II. Hướng Dẫn Tải Chi Tiết

### 1. YOLOv8-Face (`yolov8n-face.pt`)
*   **Cơ chế tự động:** Khi bạn chạy hệ thống lần đầu thông qua `run_webcam.py`, `run_video.py` hoặc `test_pipeline_dryrun.py`, hệ thống sẽ tự động phát hiện nếu file bị thiếu và tải trực tiếp từ Hugging Face về thư mục `models/` cho bạn.
*   **Tải thủ công:** Nếu máy chạy offline hoặc mạng bị chặn, bạn có thể tải thủ công theo liên kết dưới đây và đặt vào thư mục `models/`:
    *   **Link tải trực tiếp:** [Hugging Face - YOLOv8-Face](https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt)

---

### 2. MiVOLO v2 — Lagenda (`mivolo_v2_lagenda.pth.tar`)

Đây là mô hình tuổi/giới tính **mặc định** (`CFG.mivolo_ckpt`). Chạy một lệnh:

```bash
uv run python fetch_mivolo_v2.py
```

Script tải `model.safetensors` từ [iitolstykh/mivolo_v2](https://huggingface.co/iitolstykh/mivolo_v2),
bóc tiền tố `mivolo.model.` mà lớp bọc HuggingFace thêm vào, gắn metadata dải
tuổi rồi lưu thành `.pth.tar` đúng định dạng mà `mivolo/model/mi_volo.py` đọc.
Không cần `transformers` (repo HF ghim `transformers==4.51`, môi trường này đang
5.x) vì trọng số chính là kiến trúc `mivolo_d1_384` đã có sẵn trong `mivolo/`.
Script tự kiểm tra khớp kiến trúc và dừng nếu lệch, thay vì nạp một nửa.

**Vì sao là v2:** checkpoint v1 (`model_imdb_cross_person_4.22_99.46.pth.tar`)
huấn luyện trên IMDB-cleaned — ảnh người nổi tiếng, gần như không có ai dưới 15
tuổi — nên đọc trẻ em già gấp đôi: bé sơ sinh ra 5-8 tuổi, học sinh tiểu học ra
10-12. Đo trên `eval/age_kids` (chỉ các clip trẻ em): MAE 5.83 năm → **2.05 năm**,
người lớn không đổi. Chi tiết ở `eval/age_kids/README.md`.

Hai checkpoint UTKFace trong README của MiVOLO **không** dùng được: cả hai đều là
`min_age: 21, max_age: 60` (bản chia chỉ người lớn trong bài báo).

#### Đường dẫn ONNX (tuỳ chọn, không bắt buộc)

`AgeGenderEstimator` ưu tiên `CFG.mivolo_weights` (ONNX) **trước** `.pth.tar`.
Nếu bạn tạo file ONNX, hãy chắc chắn nó được xuất từ v2 — xuất từ v1 sẽ âm thầm
đưa sai số trẻ em quay lại mà không có cảnh báo nào.

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
