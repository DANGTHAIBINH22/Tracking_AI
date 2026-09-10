"""PROTOTYPE — vứt đi được. Không phải code sản phẩm, không import vào Pipeline.

Câu hỏi cần trả lời: nhận diện phong cách trang phục của người xem bằng
CLIP zero-shot có đủ tin cậy để trở thành một trục mới trong bộ chấm điểm
quảng cáo không?

    uv run python prototype_apparel.py

Cách làm: YOLOv8-person (COCO pretrained) cắt người ra khỏi khung -> CLIP
zero-shot chấm bốn phong cách -> màu chủ đạo bằng k-means. Không train gì cả,
đúng ràng buộc cứng của đồ án.

Không có nhãn thật nên KHÔNG đo được accuracy. Ba thứ đo được và đủ để quyết:

  1. Độ ổn định theo thời gian — cùng một người (một track id) qua nhiều khung
     phải ra cùng một nhãn. Nhãn nhảy loạn nghĩa là không dùng được, bất kể nó
     "đúng" bao nhiêu lần.
  2. Biên tin cậy — khoảng cách giữa lựa chọn số 1 và số 2. Sát nhau nghĩa là
     model đang tung đồng xu.
  3. Chi phí — mất bao nhiêu ms mỗi người, và còn lại bao nhiêu FPS.

Cũng so luôn hai kiểu cắt (cả người vs chỉ thân trên) vì chưa rõ cái nào hợp.
"""

from __future__ import annotations

import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np
import torch

from configs import CFG

# Đổi model bằng: uv run python prototype_apparel.py <model_id>
# So CLIP gốc với một model đã tinh chỉnh riêng cho thời trang.
MODEL_ID = sys.argv[1] if len(sys.argv) > 1 else "openai/clip-vit-base-patch32"

# Prompt bằng tiếng Anh vì CLIP được huấn luyện trên caption tiếng Anh; nhãn
# hiển thị bằng tiếng Việt cho báo cáo.
STYLES = [
    ("Công sở",  "a person wearing a business suit, shirt and office formal clothing"),
    ("Thể thao", "a person wearing sportswear, a tracksuit or athletic clothing"),
    ("Dạo phố",  "a person wearing casual streetwear, a t-shirt and jeans"),
    ("Dự tiệc",  "a person wearing an elegant evening dress or a formal gown"),
]
LABELS = [vi for vi, _ in STYLES]
PROMPTS = [en for _, en in STYLES]

FRAMES_PER_VIDEO = 60
MIN_BOX_PX = 60          # crop nhỏ hơn thế này thì CLIP chỉ thấy nhiễu


def dominant_color(bgr: np.ndarray, k: int = 3) -> tuple[int, int, int]:
    """Màu áo chủ đạo bằng k-means — thuần xử lý ảnh cổ điển, không ML."""
    pixels = bgr.reshape(-1, 3).astype(np.float32)
    if len(pixels) < k:
        return tuple(int(v) for v in pixels.mean(axis=0))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    biggest = Counter(labels.flatten()).most_common(1)[0][0]
    return tuple(int(v) for v in centers[biggest])


def main() -> None:
    from transformers import CLIPModel, CLIPProcessor
    from ultralytics import YOLO

    device = CFG.device
    print(f"model: {MODEL_ID}   thiết bị: {device}\n")

    t0 = time.perf_counter()
    person = YOLO("yolov8n.pt")                       # COCO, lớp 0 = person
    # CLIPModel.from_pretrained KHÔNG báo lỗi khi nhận trọng số SigLIP — nó nạp
    # sai kiến trúc một cách im lặng và trả softmax chia đều 25% cho mọi lớp,
    # trông y hệt "model kém". Chặn từ đầu bằng cách đọc model_type.
    from transformers import AutoConfig
    cfg = AutoConfig.from_pretrained(MODEL_ID)
    if getattr(cfg, "model_type", "") != "clip":
        raise SystemExit(
            f"{MODEL_ID} là kiến trúc {cfg.model_type!r}, không phải 'clip'.\n"
            f"Nạp bằng CLIPModel sẽ ra kết quả rác. Cần open_clip + ftfy cho model này."
        )
    clip = CLIPModel.from_pretrained(MODEL_ID).to(device).eval()
    proc = CLIPProcessor.from_pretrained(MODEL_ID)
    print(f"nạp model: {time.perf_counter() - t0:.1f}s\n")

    # Dùng thẳng forward pass thay vì get_*_features: transformers 5.x trả về
    # object chứ không phải tensor, còn logits_per_image thì ổn định qua mọi bản.
    # SigLIP đòi padding="max_length"; thiếu nó thì mọi vector văn bản ra giống
    # hệt nhau và softmax chia đều 25% cho cả 4 lớp — trông như "model kém"
    # nhưng thật ra là lỗi tiền xử lý.
    try:
        text = proc(text=PROMPTS, return_tensors="pt", padding="max_length")
    except Exception:
        text = proc(text=PROMPTS, return_tensors="pt", padding=True)

    def classify(crops: list[np.ndarray]) -> list[tuple[int, float, float]]:
        """-> [(chỉ số nhãn, xác suất top1, biên top1-top2)]"""
        if not crops:
            return []
        rgb = [cv2.cvtColor(c, cv2.COLOR_BGR2RGB) for c in crops]
        img = proc(images=rgb, return_tensors="pt")
        batch = {**{k: v.to(device) for k, v in text.items()},
                 **{k: v.to(device) for k, v in img.items()}}
        with torch.no_grad():
            probs = clip(**batch).logits_per_image.softmax(dim=-1).cpu().numpy()
        out = []
        for p in probs:
            order = p.argsort()[::-1]
            out.append((int(order[0]), float(p[order[0]]), float(p[order[0]] - p[order[1]])))
        return out

    videos = sorted(Path("data").glob("*.mp4"))
    if not videos:
        print("Không có video nào trong data/.")
        return

    for video in videos:
        print("=" * 72)
        print(f"{video.name}")
        print("=" * 72)
        cap = cv2.VideoCapture(str(video))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        step = max(1, total // FRAMES_PER_VIDEO)

        # nhãn theo từng track, cho hai kiểu cắt
        seen: dict[str, dict[int, list[tuple[int, float, float]]]] = {
            "cả người": defaultdict(list), "thân trên": defaultdict(list)}
        colors: dict[int, list[tuple[int, int, int]]] = defaultdict(list)
        sheets: list[tuple[np.ndarray, str, float]] = []
        clip_ms: list[float] = []
        frames_used = boxes_seen = 0

        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step:
                idx += 1
                continue
            idx += 1
            frames_used += 1

            res = person.track(frame, persist=True, classes=[0], verbose=False)[0]
            if res.boxes is None or res.boxes.id is None:
                continue

            full, torso, tids = [], [], []
            for box, tid in zip(res.boxes.xyxy.cpu().numpy(), res.boxes.id.cpu().numpy()):
                x1, y1, x2, y2 = (int(v) for v in box)
                if (x2 - x1) < MIN_BOX_PX or (y2 - y1) < MIN_BOX_PX:
                    continue
                h = y2 - y1
                a = frame[y1:y2, x1:x2]
                # bỏ đầu và chân: quần áo nằm ở khoảng giữa
                b = frame[y1 + int(0.20 * h):y1 + int(0.75 * h), x1:x2]
                if a.size == 0 or b.size == 0:
                    continue
                full.append(a); torso.append(b); tids.append(int(tid))
                colors[int(tid)].append(dominant_color(b))
            boxes_seen += len(tids)
            if not tids:
                continue

            for kind, crops in (("cả người", full), ("thân trên", torso)):
                t = time.perf_counter()
                results = classify(crops)
                for tid, r in zip(tids, results):
                    seen[kind][tid].append(r)
                clip_ms.append((time.perf_counter() - t) * 1000 / len(crops))
                if kind == "cả người" and len(sheets) < 32:
                    for crop, (li, conf, _) in zip(crops, results):
                        sheets.append((crop, LABELS[li], conf))
        cap.release()

        print(f"  đọc {frames_used} khung, thấy {boxes_seen} lượt người, "
              f"{len(seen['thân trên'])} track riêng biệt")
        if not boxes_seen:
            print("  → không phát hiện được người nào (video có thể chỉ quay cận mặt)\n")
            continue

        for kind in ("cả người", "thân trên"):
            per_track = seen[kind]
            tracks = [v for v in per_track.values() if len(v) >= 3]
            if not tracks:
                print(f"  [{kind}] không đủ dữ liệu\n")
                continue
            # ổn định = tỷ lệ khung mà track giữ đúng nhãn phổ biến nhất của nó
            stab = [Counter(l for l, _, _ in t).most_common(1)[0][1] / len(t) for t in tracks]
            margins = [m for t in tracks for _, _, m in t]
            confs = [c for t in tracks for _, c, _ in t]
            votes = Counter(Counter(l for l, _, _ in t).most_common(1)[0][0] for t in tracks)
            spread = ", ".join(f"{LABELS[i]}×{n}" for i, n in votes.most_common())
            print(f"  [{kind}]  ổn định {statistics.mean(stab)*100:5.1f}%  "
                  f"tin cậy {statistics.mean(confs)*100:5.1f}%  "
                  f"biên {statistics.mean(margins)*100:5.1f}%   {spread}")

        if clip_ms:
            ms = statistics.mean(clip_ms)
            print(f"  chi phí CLIP: {ms:.1f} ms/người "
                  f"(1 người → trần {1000/ms:.0f} fps, 3 người → {1000/(ms*3):.0f} fps)")
        # Số liệu ổn định không nói được model có PHÂN BIỆT được không — nó có
        # thể tự tin đều đặn mà vẫn trả cùng một nhãn cho mọi người. Xuất crop
        # kèm nhãn ra ảnh để nhìn tận mắt.
        if sheets:
            cell, cols = 160, 8
            rows = (len(sheets) + cols - 1) // cols
            sheet = np.full((rows * (cell + 22), cols * cell, 3), 30, np.uint8)
            for i, (crop, label, conf) in enumerate(sheets[: rows * cols]):
                r, c = divmod(i, cols)
                y, x = r * (cell + 22), c * cell
                sheet[y : y + cell, x : x + cell] = cv2.resize(crop, (cell, cell))
                cv2.putText(sheet, f"{label} {conf*100:.0f}%", (x + 3, y + cell + 15),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
            tag = MODEL_ID.split("/")[-1]
            out = f"outputs/apparel_{tag}_{video.stem}.jpg"
            Path("outputs").mkdir(exist_ok=True)
            cv2.imwrite(out, sheet)
            print(f"  bảng ảnh: {out}")

        for tid, cs in list(colors.items())[:3]:
            b, g, r = (int(statistics.median(c[i] for c in cs)) for i in range(3))
            print(f"  track #{tid} màu áo chủ đạo ≈ RGB({r},{g},{b})")
        print()


if __name__ == "__main__":
    main()
