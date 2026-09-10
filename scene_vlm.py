"""3 - Periodic scene understanding via VLM (Moondream2). OPTIONAL, Phase 6.

Runs in its own thread every 1-2 minutes; never blocks the real-time loop. The main
loop reads the latest result through a lock/shared-state, without waiting.

Core risk: free-form VLM captions are brittle to parse. Mitigation = closed VQA:
    "Is it raining? Answer yes or no."
    "How many people are in the image? Answer a number."
Validate on 10-15 target-like images BEFORE designing the parser (biggest risk).

Dependencies for this branch are intentionally NOT in the base env; install from
requirements-vlm.txt when you reach Phase 6.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
import cv2

from configs import CFG

@dataclass
class SceneContext:
    """Latest ambient context. All fields None/empty until a VQA pass has run.

    The defaults used to be "sunny" / "standing" / ["none"], which meant a run
    with the VLM branch disabled still wrote a confident-looking weather column
    into every CSV row.
    """
    weather: str | None = None
    crowd_activity: str | None = None
    objects: list[str] = field(default_factory=list)


class SceneVLM:
    """Background Moondream worker exposing the latest SceneContext."""

    def __init__(self, period_seconds: float = CFG.vlm_period_seconds):
        self.period_seconds = period_seconds
        self._latest = SceneContext()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._model = None
        self._tokenizer = None
        self._next_frame = None
        self.use_mock = True
        self._load_failed = False
        self.device = "cpu"

    def _ensure_model(self):
        """Lazy load the model in the worker thread to avoid blocking startup."""
        if self._model is not None or self._load_failed:
            return
            
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            
            # Select device
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            if torch.backends.mps.is_available():
                self.device = "mps"

            print(f"[VLM] Đang tải Moondream ({CFG.device}) trên thiết bị {self.device}...")
            self._tokenizer = AutoTokenizer.from_pretrained(
                CFG.vlm_model_id if hasattr(CFG, "vlm_model_id") else "vikhyatk/moondream2",
                trust_remote_code=True
            )
            self._model = AutoModelForCausalLM.from_pretrained(
                CFG.vlm_model_id if hasattr(CFG, "vlm_model_id") else "vikhyatk/moondream2",
                trust_remote_code=True,
                torch_dtype=torch.float16 if self.device != "cpu" else torch.float32
            ).to(self.device)
            
            self.use_mock = False
            print("[VLM] Đã tải Moondream VLM thành công. Hệ thống chạy thật.")
        except Exception as e:
            self._load_failed = True
            self.use_mock = True
            mode = "chế độ giả lập (Mock)" if CFG.allow_mock_attributes else "bối cảnh rỗng (không suy đoán)"
            print(f"[VLM] Không tải được Moondream VLM ({e}). Sử dụng {mode}.")

    @property
    def latest(self) -> SceneContext:
        with self._lock:
            return self._latest

    def submit_frame(self, frame_bgr) -> None:
        """Hand the newest full frame to the worker (downscaled inside).

        Called from the real-time loop on every frame, so it must do as close to
        nothing as possible. Two things it deliberately does NOT do any more:
        hold the lock across a resize+copy (the worker holds the same lock), and
        prepare a frame the worker has not asked for — one pass runs every
        `period_seconds`, so ~30x per second of resizing was pure waste.
        """
        with self._lock:
            if self._next_frame is not None:
                return  # the worker still owes us a pass on the last one

        h, w = frame_bgr.shape[:2]
        scale = 480 / max(h, w)
        if scale < 1.0:
            small = cv2.resize(frame_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        else:
            small = frame_bgr.copy()

        with self._lock:
            self._next_frame = small

    def start(self) -> None:
        """Spawn worker thread running the VQA loop."""
        self._stop.clear()
        self._thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._thread.start()
        print("[VLM] Đã kích hoạt luồng chạy bối cảnh bất đồng bộ.")

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            print("[VLM] Đã dừng luồng bối cảnh.")

    def _worker_loop(self) -> None:
        """Vòng lặp chạy nền VQA."""
        # Tránh khởi tạo mô hình quá nhanh làm chậm khởi động chính
        time.sleep(2.0)
        self._ensure_model()
        
        while not self._stop.is_set():
            frame = None
            with self._lock:
                if self._next_frame is not None:
                    frame = self._next_frame.copy()
                    self._next_frame = None  # tiêu thụ frame
            
            if frame is not None:
                if not self.use_mock:
                    new_context = self._run_moondream_vqa(frame)
                elif CFG.allow_mock_attributes:
                    new_context = self._generate_mock_context()
                else:
                    new_context = SceneContext()  # honest "unknown"

                with self._lock:
                    self._latest = new_context

            # Event.wait returns as soon as stop() fires, at any granularity.
            self._stop.wait(self.period_seconds)

    def _generate_mock_context(self) -> SceneContext:
        """Giả lập bối cảnh ngẫu nhiên."""
        import random
        # Giả lập thời tiết dựa trên giờ thực tế
        current_hour = time.localtime().tm_hour
        if 6 <= current_hour <= 17:
            weather = random.choice(["sunny", "cloudy"])
        else:
            weather = random.choice(["rainy", "cloudy"])
            
        crowd_activity = random.choice(["walking", "standing", "shopping"])
        
        objects = random.choice([
            ["shopping bags", "coffee cups"],
            ["laptops", "documents"],
            ["backpacks", "smartphones"],
            ["none"]
        ])
        
        return SceneContext(weather=weather, crowd_activity=crowd_activity, objects=objects)

    def _run_moondream_vqa(self, frame_bgr) -> SceneContext:
        """Thực thi câu hỏi VQA đóng trên Moondream."""
        try:
            from PIL import Image
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb)
            
            enc_image = self._model.encode_image(pil_image)
            
            ans_weather = self._model.answer_question(enc_image, "Is the weather sunny, cloudy, or rainy? Answer in one word.", self._tokenizer).strip().lower()
            ans_activity = self._model.answer_question(enc_image, "Are people standing, walking, or shopping? Answer in one word.", self._tokenizer).strip().lower()
            ans_objects = self._model.answer_question(enc_image, "Is there a bag, laptop, or food? Answer in one word or none.", self._tokenizer).strip().lower()
            
            # Làm sạch
            weather = "sunny"
            if "rain" in ans_weather:
                weather = "rainy"
            elif "cloud" in ans_weather:
                weather = "cloudy"
                
            activity = "standing"
            if "walk" in ans_activity:
                activity = "walking"
            elif "shop" in ans_activity:
                activity = "shopping"
                
            objects = []
            if "bag" in ans_objects:
                objects.append("shopping bags")
            if "laptop" in ans_objects:
                objects.append("laptops")
            if "food" in ans_objects or "coffee" in ans_objects:
                objects.append("food/beverage")
            if not objects:
                objects.append("none")
                
            return SceneContext(weather=weather, crowd_activity=activity, objects=objects)
        except Exception as e:
            print(f"[VLM] Lỗi suy luận Moondream ({e}). Trả về bối cảnh cũ.")
            return self._latest
