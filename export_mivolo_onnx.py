"""Script trích xuất mô hình MiVOLO v2 sang chuẩn ONNX cho Edge AI inference.

Nạp mô hình gốc từ Hugging Face (hoặc thư mục models/mivolo_v2_download nếu có),
bọc (wrap) đầu vào ảnh mặt đơn kênh 384x384 và xuất ra định dạng ONNX tiêu chuẩn.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Đảm bảo thư mục gốc dự án luôn nằm trong sys.path để nạp package mivolo
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import torch
import torch.nn as nn
from transformers import AutoModelForImageClassification


class MivoloFaceWrapper(nn.Module):
    """Lớp bọc cho phép MiVOLO v2 suy luận chỉ từ 1 ảnh mặt (3x384x384)."""

    def __init__(self, mivolo_model):
        super().__init__()
        self.model = mivolo_model

    def forward(self, face_image):
        # face_image shape: (1, 3, 384, 384)
        out = self.model(faces_input=face_image, body_input=face_image)
        # Kết quả: [age (1), prob_male (1), prob_female (1)] -> Tensor (1, 3)
        age = out.age_output
        p_male = out.raw_gender_output[:, 0:1]
        p_female = out.raw_gender_output[:, 1:2]
        return torch.cat([age, p_male, p_female], dim=-1)


def export_onnx(output_path: str = "models/mivolo_age_gender.onnx") -> bool:
    """Nạp MiVOLO v2 từ Hugging Face và xuất sang ONNX kèm kiểm tra tính toàn vẹn."""
    out_file = Path(output_path)
    if not out_file.is_absolute():
        out_file = ROOT / out_file

    local_hf_dir = ROOT / "models" / "mivolo_v2_download"
    model_source = str(local_hf_dir) if local_hf_dir.exists() else "iitolstykh/mivolo_v2"

    print(f"[*] Đang nạp mô hình MiVOLO v2 từ: {model_source}...")
    pretrained = AutoModelForImageClassification.from_pretrained(model_source, trust_remote_code=True)
    pretrained = pretrained.float().eval()

    print("[*] Đang bọc mô hình cho đầu vào ảnh mặt đơn kênh 384x384...")
    wrapper = MivoloFaceWrapper(pretrained).eval()

    dummy_input = torch.randn(1, 3, 384, 384, dtype=torch.float32)

    out_file.parent.mkdir(parents=True, exist_ok=True)
    print(f"[*] Bắt đầu xuất mô hình ra ONNX: {out_file}...")
    torch.onnx.export(
        wrapper,
        dummy_input,
        str(out_file),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
    )
    print(f"[✓] Đã xuất thành công file ONNX tại: {out_file}")

    # Kiểm tra tính toàn vẹn bằng onnxruntime
    print("[*] Đang kiểm tra tính toàn vẹn của mô hình ONNX qua onnxruntime...")
    try:
        import numpy as np
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        sess = ort.InferenceSession(str(out_file), opts, providers=["CPUExecutionProvider"])
        test_in = np.zeros((1, 3, 384, 384), dtype=np.float32)
        test_out = sess.run(None, {sess.get_inputs()[0].name: test_in})[0]
        print(f"[✓] Kiểm tra suy luận ONNX thành công! Kích thước đầu ra: {test_out.shape} -> [Age: {test_out[0,0]:.1f}, P_Male: {test_out[0,1]:.2f}, P_Female: {test_out[0,2]:.2f}]")
        return True
    except Exception as e:
        print(f"[!] Cảnh báo kiểm tra suy luận ONNX: {e}")
        return False


if __name__ == "__main__":
    export_onnx()

