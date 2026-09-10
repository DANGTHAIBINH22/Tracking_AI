# Tra cứu: model nhận diện trang phục từ ảnh toàn thân / thân trên

Ngày: 2026-09-09 · Kèm số đo thực tế trên `data/*.mp4` bằng `prototype_apparel.py`.

Câu hỏi: chọn model nào để đọc phong cách ăn mặc của người đứng trước màn hình,
với ràng buộc cứng của đồ án là **không train**.

---

## Kết luận ngắn

**Model không phải nút thắt — chất lượng vùng cắt mới là.** Cùng một model, cùng
một đoạn code: ảnh người đối diện camera cận cảnh cho nhãn đa dạng và hợp lý;
ảnh camera treo cao nhìn từ sau thì mọi người đổ dồn về một nhãn. Đổi từ CLIP gốc
sang FashionCLIP có cải thiện nhưng không xoá được hiện tượng đó.

Nên thứ tự ưu tiên là: **lọc vùng cắt trước, đổi model sau.**

---

## Các ứng viên đã khảo sát

### 1. FashionCLIP — `patrickjohncyh/fashion-clip`

CLIP ViT-B/32 tinh chỉnh trên 800K sản phẩm thời trang của Farfetch (>3K thương
hiệu). 2,1 triệu lượt tải trên HuggingFace.

- **Ưu**: đúng kiến trúc `clip`, thay thẳng vào chỗ CLIP gốc, **không cần thêm
  thư viện nào**.
- **Nhược**: huấn luyện trên ảnh catalog sản phẩm — nền trắng, áo quần chụp
  chính diện. Khác xa ảnh webcam.

### 2. Marqo-FashionSigLIP — `Marqo/marqo-fashionSigLIP`

SigLIP ViT-B-16 (webli) tinh chỉnh bằng Generalized Contrastive Learning trên
mô tả + danh mục + phong cách + màu + chất liệu. 363K lượt tải. Model card báo
cải thiện tới **57% MRR** so với FashionCLIP 2.0 (MRR 0,239 so với 0,165).

- **Ưu**: điểm chuẩn tốt nhất trong nhóm.
- **Nhược**: cần `open_clip` + `ftfy`. Dự án này `uv run` **đồng bộ lại uv.lock
  mỗi lần chạy**, nên cài tay sẽ bị gỡ — phải `uv add` thật sự.
- **Cảnh báo đã gặp**: `CLIPModel.from_pretrained` **không báo lỗi** khi nhận
  trọng số SigLIP. Nó nạp sai kiến trúc một cách im lặng và trả softmax chia đều
  25% cho cả 4 lớp — trông hệt như "model kém". `prototype_apparel.py` giờ đọc
  `model_type` và từ chối thẳng.
- **Điểm chuẩn chỉ đo trên dữ liệu catalog**: Atlas, DeepFashion, Fashion200k,
  KAGL, Polyvore. Model card **không** có số liệu trên ảnh đời thường hay ảnh
  camera giám sát.

### 3. Intel OpenVINO — `person-attributes-recognition-crossroad-0230`

Thiết kế riêng cho camera giám sát, chạy sau bước phát hiện người.

- Đầu vào **160×80** — hợp với vùng cắt nhỏ, không phải upscale như CLIP 224×224.
- **0,174 GFlops / 0,735 MParams** — nhẹ hơn CLIP ViT-B/32 khoảng 25 lần.
- 8 thuộc tính nhị phân: `is_male`, `has_bag`, `has_backpack`, `has_hat`,
  `has_longsleeves`, `has_longpants`, `has_longhair`, `has_coat_jacket`.
- **Nhược nghiêm trọng**: F1 kém đúng ở mấy thuộc tính quần áo —
  `has_longsleeves` **0,21**, `has_hat` 0,64, `has_bag` 0,66. Chỉ `is_male`
  (0,91), `has_longpants` (0,83), `has_longhair` (0,83) là dùng được.
- **Không có nhãn phong cách** — chỉ nói có/không từng món, không nói công sở
  hay thể thao. Muốn ra phong cách phải tự viết luật trên 8 cờ đó.
- Cần thêm runtime `openvino` (Open Model Zoo phát hành IR, không phải ONNX).

### 4. Pedestrian Attribute Recognition (PA-100K / PETA / RAP)

Đây là đúng nhánh học thuật cho bài toán này — PA-100K có 100K ảnh camera giám
sát thật, 26 thuộc tính nhị phân gồm loại áo quần.

- **Nhược quyết định**: gần như **không có trọng số pretrained dùng ngay** trên
  HuggingFace. Tìm `person-attribute` chỉ ra vài repo 0 lượt tải. Muốn dùng phải
  lấy code từ GitHub nghiên cứu và tự tải trọng số thủ công — hoặc tự train, mà
  đồ án đã cấm.

### 5. Moondream2 VLM — đã có sẵn trong dự án nhưng **đang hỏng**

`requirements-vlm.txt` ghi rõ: `transformers>=5` làm hỏng đường
`trust_remote_code` của Moondream2, mà hạ cấp thì vướng `timm` ghim
`huggingface-hub` qua `uv.lock`. Chừng nào chưa gỡ được thì nhánh này không dùng
được, dù trọng số đã nằm trong cache.

---

## Số đo thực tế (4 video trong `data/`)

`ổn định` = tỷ lệ khung mà một track giữ nguyên nhãn phổ biến nhất của nó.
`nhãn ra` = nhãn cuối cùng của từng track sau khi bỏ phiếu.

| Video | CLIP gốc | FashionCLIP |
|:--|:--|:--|
| walking-and-pause (đối diện, cận) | 83% · Dạo phố×2, Công sở×2, Thể thao×1 | 83% · Dạo phố×2, Công sở×2, Thể thao×1 |
| walking (đối diện) | 100% · Công sở×1 | 100% · Công sở×1 |
| head-pose-female (đối diện) | 96% · Thể thao×2 | 76% · **Công sở×2** |
| store-aisle (từ sau, nền lộn xộn) | 90% · **Thể thao×6** | 69% · Thể thao×4, Công sở×2 |

Đọc bảng này:

- FashionCLIP **phá được hiện tượng dồn nhãn** ở store-aisle (6/6 → 4/6), nhưng
  đổi lại độ ổn định tụt từ 90% xuống 69% — nó phân biệt nhiều hơn nhưng nhiễu hơn.
- Ở video đối diện camera, hai model gần như ngang nhau. Nghĩa là **lợi ích của
  model chuyên ngành chỉ xuất hiện ở ca khó**, và ở ca khó thì nó vẫn chưa đủ tốt.
- Chi phí gần như y hệt: 17–25 ms/người cho cả hai.

Nhìn tận mắt bảng ảnh trong `outputs/apparel_*.jpg` xác nhận: trên ảnh chính diện
cận cảnh, áo phông trơn → "Dạo phố", sơ mi cài cúc → "Công sở" đều đúng. Trên ảnh
chụp từ sau giữa kệ hàng, cả hai model đều đoán bừa với độ tự tin cao.

---

## Khuyến nghị

1. **Lọc vùng cắt trước khi nghĩ tới đổi model.** Chỉ chấm những crop đủ lớn và
   có mặt hướng về camera. Dữ liệu `yaw` từ `head_pose.py` **đã có sẵn** trong
   `PersonMeta` — dùng luôn, không tốn thêm gì.
2. **Ngưỡng tin cậy → "không rõ".** Bỏ hẳn thói quen ép một nhãn. `age_gender`
   trong dự án đã trả `None` thay vì bịa, làm y như vậy.
3. **Chạy một lần mỗi track**, nhớ kết quả. Trang phục không đổi giữa các khung;
   chạy mỗi khung là lý do FPS tụt.
4. Sau ba bước đó, **FashionCLIP** là lựa chọn mặc định vì đổi sang nó không tốn
   gì. Chỉ cân nhắc `uv add open_clip_torch ftfy` cho Marqo-FashionSigLIP nếu đo
   được rằng FashionCLIP vẫn thiếu.

Điều kiện tối thiểu để coi là dùng được: video store-aisle phải chuyển từ
"Thể thao×6" thành "không rõ×6". Model **biết là mình không biết** quan trọng hơn
model đoán đúng thêm vài phần trăm.

---

## Nguồn

- FashionCLIP: <https://huggingface.co/patrickjohncyh/fashion-clip> ·
  <https://github.com/patrickjohncyh/fashion-clip>
- Marqo-FashionSigLIP: <https://huggingface.co/Marqo/marqo-fashionSigLIP>
- Intel person-attributes-recognition-crossroad-0230:
  <https://github.com/openvinotoolkit/open_model_zoo/blob/master/models/intel/person-attributes-recognition-crossroad-0230/README.md>
- VLM-PAR (khảo sát PAR gần đây): <https://arxiv.org/html/2512.22217>
- PAR benchmark + LLM-augmented framework: <https://arxiv.org/pdf/2408.09720>
