# Tracking-CV: Lõi Thị giác máy tính phân tích tương tác Standee quảng cáo thông minh

Mã nguồn xử lý lõi Thị giác máy tính (`CV Core Pipeline`) thuộc đồ án tốt nghiệp: *"Xây dựng hệ thống màn hình quảng cáo thông minh nhận biết ngữ cảnh và phân tích tương tác bằng Thị giác máy tính"*.

Dự án được thực hiện bởi nhóm sinh viên **Đặng Thái Bình** & **Lương Thế Tài**, dưới sự hướng dẫn của giảng viên **ThS. Cáp Phạm Đình Thăng** (UIT).

---

## I. System Architecture & Business Flow (Kiến trúc Hệ thống & Luồng Nghiệp vụ)

### 1. Sơ đồ Luồng Tổng Thể (System Architecture & Pipeline Chart)

```mermaid
graph TD
    A[Camera / Webcam] -->|Luồng BGR Frame| B(Edge AI Preprocessing)
    B -->|Resize & CLAHE| C{Phát phân nhánh}
  
    C -->|Real-time Branch: Mỗi frame| D[YOLOv8-Face & ByteTrack]
    D -->|Crop Face với 30% margin| E[Estimators]
    E -->|ONNX MiVOLO| F[Age & Gender]
    E -->|MediaPipe mesh + solvePnP| G[Head Pose & Attention Classifier]
    F & G -->|Bỏ phiếu & làm mịn| H[Metadata người dùng: M_user]
  
    C -->|Periodic Branch: Mỗi 1-2 phút| I[Asynchronous VLM Thread]
    I -->|Moondream VLM VQA| K[Weather, Activity, Objects]
    K -->|Regex Parser| L[Metadata bối cảnh: M_env]
  
    H & L -->|Socket/FastAPI Request| M[FastAPI Backend - CARE Engine]
    M -->|Chấm điểm Weighted Scoring| N[Ad Player Interface Next.js]
    M -->|Lưu log tương tác L| O[(PostgreSQL Database)]
    O -->|Đọc số liệu| P[CMS Dashboard ECharts]
```

### 2. Sơ đồ mô tả Input và Output bài toán (Input/Output Diagram)

![system_input_output](images/system_input_output_vietnamese.jpg)

### 3. Sơ đồ Quy trình xử lý chi tiết (Pipeline Flowchart)

![system_pipeline_detailed](images/system_pipeline_detailed.jpg)

### 4. Cơ cấu Cơ sở dữ liệu (Database Construction)

Cơ sở dữ liệu PostgreSQL lưu trữ dữ liệu log tương tác (`L = {timestamp, M_user, M_env, v*}`) phục vụ trực quan hóa lên CMS Dashboard:

```sql
-- Bảng lưu thông tin quảng cáo (Advertisements)
CREATE TABLE advertisements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    video_url VARCHAR(512) NOT NULL,
    target_gender VARCHAR(10),       -- M, F, hoặc ALL
    target_age_group VARCHAR(20),    -- 0-18, 18-35, 35-55, 55+
    target_context VARCHAR(100)[],   -- Các tag bối cảnh ví dụ: ['rainy', 'laptops']
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu log tương tác của khách hàng (User Interaction Logs)
CREATE TABLE interaction_logs (
    id SERIAL PRIMARY KEY,
    track_id INT NOT NULL,           -- Sinh ra từ ByteTrack để phân biệt khách hàng
    gender VARCHAR(10),              -- Giới tính nhận diện từ MiVOLO
    age_group VARCHAR(20),           -- Nhóm tuổi nhận diện từ MiVOLO
    yaw FLOAT,                       -- Góc xoay đầu ngang từ solvePnP
    pitch FLOAT,                     -- Góc xoay đầu dọc từ solvePnP
    attention INT DEFAULT 0,         -- 1: Có chú ý nhìn, 0: Không nhìn
    dwell_time FLOAT DEFAULT 0.0,    -- Thời gian nhìn lũy kế (giây)
    ad_played_id INT REFERENCES advertisements(id), -- Quảng cáo đã phát
    weather VARCHAR(50),             -- Bối cảnh thời tiết tại thời điểm t
    crowd_activity VARCHAR(100),     -- Hoạt động bối cảnh đám đông
    objects_detected TEXT,           -- Vật thể bối cảnh phát hiện (phân tách bằng '|')
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5. Luồng Nghiệp vụ Chi tiết (Detailed Workflow)

1. **Camera Input**: Luồng camera liên tục ghi lại BGR frame.
2. **Preprocessing**: Ảnh được resize (cạnh dài 640px) để duy trì tốc độ và cân bằng sáng bằng bộ lọc **CLAHE** chống ngược sáng.
3. **Real-time Branch (Nhánh thời gian thực)**:
   * **YOLOv8-Face** phát hiện mặt, kết hợp thuật toán **ByteTrack** gán `track_id` ổn định.
   * Cắt rộng mặt 30% margin đưa qua **MiVOLO** nhận diện tuổi/giới tính. Lấy trung vị và bỏ phiếu bầu sau 7 mẫu đầu để khóa thuộc tính, chống giật đổi thông số.
   * Dùng **MediaPipe Face Mesh** trích xuất 6 điểm mốc chính, giải bài toán **PnP (Perspective-n-Point)** tìm góc quay đầu. Lọc làm mịn theo thời gian để tính `attention` và cộng dồn `dwell_time`.
4. **Periodic Branch (Nhánh bối cảnh nền)**:
   * Thread riêng chạy bất đồng bộ mỗi 90 giây gửi frame về **Moondream VLM** để chạy VQA câu hỏi đóng nhận biết bối cảnh.
5. **CARE Recommendation Engine & Interface**:
   * API Backend tiếp nhận metadata, tính toán điểm độ phù hợp của quảng cáo dựa trên demographics (tuổi, giới tính) và bối cảnh (thời tiết, hoạt động xung quanh).
   * Ad Player Next.js nhận video chỉ định và phát mượt mà qua cơ chế đệm kép (Double Buffering). Dữ liệu lưu vào database PostgreSQL.

---

## II. Hướng dẫn thiết lập & Chạy thử nghiệm (Setup & Run)

### 1. Cài đặt môi trường

Dự án được quản lý môi trường và thư viện tự động bằng công cụ **`uv`**:

```bash
# Đồng bộ môi trường và tải các thư viện real-time từ uv.lock
uv sync
```

*(Nếu muốn chạy nhánh VLM thật, hãy cài đặt các thư viện bổ sung qua: `uv pip install -r requirements-vlm.txt`)*

### 2. Tải và Thiết lập các File Trọng số (Model Weights Setup)

Để hệ thống hoạt động đầy đủ tính năng suy luận AI, bạn cần thiết lập các tệp tin trọng số mô hình trong thư mục `models/` (đã được cấu hình trong `configs.py` và được bỏ qua trong Git):

#### A. Trọng số YOLOv8-Face (`models/yolov8n-face.pt` - ~6MB)
* **Tự động:** Khi khởi chạy lần đầu qua các lệnh `run_webcam.py`, `run_video.py` hoặc `test_pipeline_dryrun.py`, hệ thống sẽ tự động phát hiện và tải file này từ Hugging Face về thư mục `models/` cho bạn.
* **Thủ công:** Bạn có thể tải trực tiếp từ link [Hugging Face YOLOv8-Face](https://huggingface.co/junjiang/GestureFace/resolve/main/yolov8n-face.pt) và đặt vào thư mục:
  `models/yolov8n-face.pt`

#### B. Trọng số MiVOLO ONNX (`models/mivolo_age_gender.onnx` - ~100MB)
Do tệp trọng số MiVOLO ONNX chính gốc không có liên kết tải trực tiếp chính thức và bị bỏ qua trong Git, bạn có hai cách tiếp cận:
* **Cách 1: Lấy file ONNX trực tiếp từ nhóm thiết kế** (Khuyên dùng). Sao chép tệp `mivolo_age_gender.onnx` do nhóm chuyển giao vào thư mục:
  `models/mivolo_age_gender.onnx`
* **Cách 2: Tự tạo file ONNX nội bộ (Surrogate ONNX model)**: Kích hoạt môi trường ảo và chạy lệnh sau để tự sinh một mô hình ONNX thay thế giúp pipeline chạy thật trên ONNX Runtime:
  ```bash
  # Tải thư viện hỗ trợ xuất ONNX
  uv pip install onnxscript
  
  # Chạy script tự động xuất ONNX mô phỏng
  uv run python -c "import urllib.request; urllib.request.urlretrieve('https://raw.githubusercontent.com/binhdang/UIT/main/generate_mivolo_onnx.py', 'generate_mivolo_onnx.py'); import subprocess; subprocess.run(['python', 'generate_mivolo_onnx.py'])"
  ```

#### C. Trọng số Moondream VLM (`vikhyat/moondream2` - ~1.6GB)
* **Tự động:** Khi bạn bật chế độ VLM (`vlm_enabled: bool = True` trong `configs.py`), luồng chạy nền sẽ tự động tải Moondream2 thông qua thư viện `transformers` của Hugging Face và lưu vào thư mục cache của hệ thống.
* **Yêu cầu:** Máy tính cần có kết nối mạng Internet ở lần khởi chạy đầu tiên. Thư viện sẽ tự động phân phối trọng số tối ưu (định dạng `float16` trên Apple Silicon/CUDA, `float32` trên CPU) với cờ `trust_remote_code=True`.

### 3. Chạy thử nghiệm Demo

* **Chạy nhận dạng camera/webcam trực tiếp hiển thị giao diện overlay:**
  ```bash
  uv run python run_webcam.py
  ```
* **Chạy phân tích video test có sẵn và xuất log ra CSV:**
  ```bash
  uv run python run_video.py --video data/test.mp4 --out outputs/test.csv
  ```

### 4. Chạy thực nghiệm lấy số liệu báo cáo đồ án

Chúng ta chạy các script đánh giá độc lập nằm trong thư mục `eval/`:

* **Đo tương phản và tỉ lệ phát hiện khuôn mặt ngược sáng có vs không có CLAHE:**
  ```bash
  uv run python eval/eval_clahe.py
  ```
* **Đo FPS chi tiết từng khâu để tối ưu tài nguyên phần cứng biên:**
  ```bash
  uv run python eval/eval_fps.py
  ```
