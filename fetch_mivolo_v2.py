"""Download MiVOLO v2 (Lagenda) and convert it to the .pth.tar layout this repo loads.

    uv run python fetch_mivolo_v2.py

Why a converter rather than `transformers`: the HuggingFace repo
(iitolstykh/mivolo_v2) ships the weights as `model.safetensors` plus remote code
that pins `transformers==4.51`, which this env cannot satisfy — it is on 5.x, and
downgrading collides with timm the same way the Phase-6 VLM branch does. But the
weights are a plain `mivolo_d1_384`, the exact architecture already vendored in
`mivolo/model/mivolo_model.py`: loading them into it reports 0 missing and 0
unexpected keys. So all that is actually needed is to strip the `mivolo.model.`
prefix the HF wrapper adds and to attach the age-range metadata that
`mivolo.model.mi_volo.Meta.load_from_ckpt` reads. No new dependency.

Why bother: v2 is trained on Lagenda, which spans `min_age: 0, max_age: 122`.
The v1 IMDB-cleaned checkpoints span 1-95 in principle but IMDB-WIKI is
celebrity photos, so they saw almost nobody under 15 and read children roughly
twice their age. Measured on eval/age_kids: MAE 5.83y -> 2.05y on children.
"""

from __future__ import annotations

import sys
import urllib.request

import torch
from safetensors.torch import load_file

from configs import MODELS_DIR

URL = "https://huggingface.co/iitolstykh/mivolo_v2/resolve/main/model.safetensors"
DEST = MODELS_DIR / "mivolo_v2_lagenda.pth.tar"
RAW = MODELS_DIR / "mivolo_v2.safetensors"
HF_PREFIX = "mivolo.model."

# From the repo's config.json. Meta.load_from_ckpt reads exactly these five keys;
# input_size it derives itself from pos_embed (24 * 16 = 384).
META = {"min_age": 0, "max_age": 122, "avg_age": 61.0,
        "no_gender": False, "with_persons_model": True}


def main() -> int:
    if DEST.exists():
        print(f"[fetch_mivolo_v2] Đã có sẵn: {DEST}")
        return 0

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if not RAW.exists():
        print(f"[fetch_mivolo_v2] Đang tải (~112 MB): {URL}")
        urllib.request.urlretrieve(URL, RAW)

    state = {k[len(HF_PREFIX):] if k.startswith(HF_PREFIX) else k: v
             for k, v in load_file(RAW).items()}

    # Fail loudly if the architecture ever drifts: create_model loads with
    # strict=False (it filters "fds." keys), so a mismatch would otherwise show up
    # as a silently half-initialised model that still returns plausible ages.
    from mivolo.model.create_timm_model import create_model

    probe = create_model("mivolo_d1_384", num_classes=3, in_chans=6, pretrained=False)
    incompatible = probe.load_state_dict(state, strict=False)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        print(f"[fetch_mivolo_v2] LỖI: weights không khớp kiến trúc mivolo_d1_384 — "
              f"{len(incompatible.missing_keys)} khoá thiếu, "
              f"{len(incompatible.unexpected_keys)} khoá thừa.", file=sys.stderr)
        return 1

    torch.save({**META, "state_dict": state}, DEST)
    RAW.unlink()
    print(f"[fetch_mivolo_v2] Đã lưu: {DEST}")
    print("[fetch_mivolo_v2] CFG.mivolo_ckpt đã trỏ sẵn vào đây.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
