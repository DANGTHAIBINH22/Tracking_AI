# Hướng dẫn Tải và Thiết lập các Trọng số Mô hình (Model Weights Guide)

Tài liệu này hướng dẫn chi tiết cách chuẩn bị các tệp trọng số (model weights) cần thiết để chạy lõi AI Pipeline của đồ án tốt nghiệp.

---

## I. Bảng Tổng Hợp Trọng Số Mô Hình

| Tên Mô Hình | Tệp Tin Chỉ Định | Dung Lượng | Vị Trí Lưu Trữ | Vai Trò Trong Hệ Thống |
| :--- | :--- | :--- | :--- | :--- |
| **YOLOv8-Face** | `yolov8n-face.pt` | ~6.1 MB | `models/yolov8n-face.pt` | Phát hiện khuôn mặt (Face Detection) |
| **YOLOv8n (COCO)** | `yolov8n.pt` | ~6.2 MB | `models/yolov8n.pt` | Phát hiện Thú cưng (Chó, Mèo) và ghép cặp không gian |
| **MiVOLO v2 (Lagenda)** | `mivolo_v2_lagenda.pth.tar` | ~115 MB | `models/mivolo_v2_lagenda.pth.tar` | Ước lượng Tuổi & Giới tính từ vùng mặt (**mặc định**, tuổi 0-122) |
| **MiVOLO ONNX (tuỳ chọn)** | `mivolo_age_gender.onnx` | ~92.2 MB | `models/mivolo_age_gender.onnx` | Đường dẫn ONNX thay thế — xem cảnh báo ở mục 3 |
| **Moondream VLM** | `vikhyat/moondream2` | ~1.6 GB | Cache mặc định (`~/.cache/huggingface`) | Nhận diện bối cảnh (Thời tiết, Đám đông, Vật thể) |

*Lưu ý: Tất cả các tệp trong thư mục `models/` đã được cấu hình tự động bỏ qua (ignored) bởi Git để tránh làm nặng kho lưu trữ mã nguồn.*

---

## II. Quy Trình Chuẩn Bị Tự Động 1-Lệnh Cho Giám Khảo (Khuyên Dùng)

Trên một máy tính hoàn toàn mới (fresh clone), thư mục `models/` ban đầu sẽ hoàn toàn trống vì trọng số đã được cấu hình `.gitignore`. 

Để thiết lập đầy đủ tất cả mô hình AI chỉ với **1 câu lệnh duy nhất**, Giám khảo chỉ cần đứng tại thư mục gốc dự án và thực hiện:

```bash
# 1. Cài đặt và đồng bộ toàn bộ thư viện cần thiết:
uv sync

# 2. Tự động tải và chuẩn bị toàn bộ mô hình AI & assets (YOLOv8-Face, YOLOv8n Pets, MiVOLO v2 ONNX, Video Demo):
uv run python prepare_models.py --skip-vlm
```

> **Ghi chú về cờ `--skip-vlm`:**
> - Nếu chỉ chạy camera tương tác trực tiếp (Face Detection, Tracking, Pet Tracking, Age & Gender, Head Pose & Attention Dwell), sử dụng cờ `--skip-vlm` để script hoàn tất chỉ sau **~15 giây** (tiết kiệm băng thông tải 1.6 GB của mô hình bối cảnh nền Moondream2).
> - Nếu muốn chạy toàn diện cả nhánh phân tích bối cảnh nền VLM, hãy bỏ cờ `--skip-vlm`: `uv run python prepare_models.py`.

Script sẽ tự động:
1. Tải trọng số `yolov8n-face.pt` (~6.1 MB) từ Hugging Face.
2. Tải trọng số `yolov8n.pt` (~6.2 MB) từ Ultralytics GitHub Release phục vụ nhận diện Thú cưng (chó & mèo).
3. Tự động nạp kiến trúc MiVOLO v2 và xuất sang cặp file nhị phân chuẩn ONNX `models/mivolo_age_gender.onnx` (~2.5 MB) & `.data` (~110 MB).
4. Tự động chạy thử một lượt suy luận giả lập (smoke inference) bằng `onnxruntime` để kiểm tra độ tin cậy.
5. Kiểm tra kho video quảng cáo và in bảng báo cáo trạng thái hoàn tất (Readiness Checklist).

---

## III. Hướng Dẫn Tải & Thiết Lập Thủ Công (Chi Tiết)

### 1. YOLOv8-Face (`yolov8n-face.pt`)
*   **Cơ chế tự động:** Khi bạn chạy hệ thống lần đầu thông qua `run_webcam.py`, `run_video.py` hoặc `run_server.py`, hệ thống sẽ tự động phát hiện nếu file bị thiếu và tải trực tiếp từ Hugging Face về thư mục `models/` cho bạn.
*   **Tải thủ công:**
    *   **Link tải trực tiếp:** [Hugging Face - YOLOv8-Face](https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt)
    *   **Vị trí đặt:** `models/yolov8n-face.pt` (~6.1 MB)

### 2. YOLOv8n COCO Cho Thú Cưng (`yolov8n.pt`)
*   **Cơ chế tự động:** Tự động tải thông qua `prepare_models.py` hoặc khi khởi tạo `PetTracker`.
*   **Tải thủ công:**
    *   **Link tải trực tiếp:** [Ultralytics Releases - YOLOv8n](https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt)
    *   **Vị trí đặt:** `models/yolov8n.pt` (~6.2 MB)

---

### 3. MiVOLO v2 — Lagenda (`mivolo_v2_lagenda.pth.tar`)

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

1.  Cài đặt các thư viện bổ sung cần thiết phục vụ quá trình xuất ONNX:
    ```bash
    uv pip install setuptools timm==1.0.28 transformers==5.16.1 onnxscript
    ```
2.  Chạy script xuất có sẵn trong dự án — script tải checkpoint MiVOLO v2 chính
    thức từ Hugging Face rồi ghi ra `models/mivolo_age_gender.onnx`:
    ```bash
    uv run python export_mivolo_onnx.py
    ```

---

### 4. Moondream VLM (`vikhyat/moondream2`)
*   **Cơ chế:** Mô hình VLM được tải trực tiếp bằng thư viện `transformers` và được cache tự động bởi hệ thống tại thư mục của người dùng (user cache).
*   **Cách kích hoạt:**
    1.  Mở tệp cấu hình `configs.py` và đặt cờ `vlm_enabled = True`.
    2.  Cài đặt các thư viện VLM bổ sung:
        ```bash
        uv pip install -r requirements-vlm.txt
        ```
