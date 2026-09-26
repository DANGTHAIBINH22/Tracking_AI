"""Seed one demo advert per age bracket, so smart targeting has something to choose between.

    ./run_web.sh                     # or just the API on :8000
    uv run python seed_target_demo_ads.py

Smart targeting ranks the active playlist against whoever is watching
(`AnalyticsEngine._compute_recommendation`), scoring +30 when an advert's
target bracket covers the viewer's and -10 when it does not. That only shows up
as behaviour if the playlist actually disagrees with itself: with every advert
on `all` or `18-35`, a toddler and a pensioner get the same winner and the
feature looks broken when it is merely unexercised.

So this uploads six clips, one per bracket in `server.audience.AGE_GROUPS`, each
tagged with the bracket it is meant for. Pair it with a child clip as the camera
source (`bash eval/age_kids/fetch.sh`) and the recommendation should swing to
the matching advert.

The clips are Mixkit free stock, product-shot style rather than footage of the
target audience — an advert is what goes ON the screen, not what the camera
sees. They go through the real upload endpoint, so they land in media/ under a
generated name exactly like an operator upload. media/ is git-ignored, which is
why this is a script and not a fixture.

Idempotent: an advert whose name already exists in the playlist is left alone.
"""

from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

import httpx

API = os.environ.get("NEXT_PUBLIC_API_BASE") or "http://127.0.0.1:8000"
CACHE = Path(os.environ.get("TMPDIR", "/tmp")) / "signage_demo_ads"

# (mixkit id, advert name, target_age_group, category, description)
# target_age_group values must be spellings server.audience accepts; the upload
# endpoint canonicalises them through normalize_target_age either way.
ADS = [
    (4569, "DEMO Đồ chơi mầm non", "<6", "Đồ chơi & Trẻ em",
     "Đồ chơi vận động cho bé 1-5 tuổi"),
    (42165, "DEMO Lego thiếu nhi", "6-13", "Đồ chơi & Trẻ em",
     "Bộ xếp hình sáng tạo cho học sinh tiểu học"),
    (51609, "DEMO Bàn phím gaming", "13-18", "Công nghệ & Gaming",
     "Bàn phím cơ LED cho game thủ học sinh"),
    (4851, "DEMO Giày chạy bộ GenZ", "18-35", "Thanh niên & Xu hướng",
     "Giày chạy bộ cho người trẻ năng động"),
    (43033, "DEMO Bếp & nội thất", "35-55", "Gia đình & Đồ gia dụng",
     "Nội thất bếp hiện đại cho gia đình"),
    (13199, "DEMO Trà dưỡng sinh", ">55", "Sức khỏe & Dưỡng sinh",
     "Trà thảo mộc thư giãn cho người lớn tuổi"),
]


def download(mixkit_id: int) -> Path | None:
    """Fetch one clip, preferring 720p — the player downscales anything larger."""
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / f"{mixkit_id}.mp4"
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    for res in (720, 1080, 360):
        url = f"https://assets.mixkit.co/videos/{mixkit_id}/{mixkit_id}-{res}.mp4"
        # Download to a sibling then rename, so a connection dropped mid-write
        # cannot leave a truncated file that the size check above would accept
        # as cached on the next run.
        partial = dest.with_suffix(".part")
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request) as response, partial.open("wb") as out:
                out.write(response.read())
            partial.replace(dest)
            return dest
        except Exception:
            partial.unlink(missing_ok=True)
            continue
    return None


def main() -> int:
    try:
        active = httpx.get(f"{API}/api/playlists", timeout=10.0).raise_for_status().json()
    except Exception as exc:
        print(f"Không gọi được {API}/api/playlists ({exc}). Chạy ./run_web.sh trước.", file=sys.stderr)
        return 1

    playlists = [p for p in active if p.get("is_active")]
    if not playlists:
        print("Chưa có playlist nào đang hoạt động — bật một playlist ở /admin rồi chạy lại.", file=sys.stderr)
        return 1
    playlist = playlists[0]
    print(f"Playlist đang hoạt động: #{playlist['id']} {playlist['name']}")

    # The list endpoint returns playlists without their items; only the detail
    # endpoint loads them. Reading `items` off the list response gave an empty
    # set, so every re-run silently appended a second copy of all six adverts.
    detail = httpx.get(f"{API}/api/playlists/{playlist['id']}", timeout=10.0).raise_for_status().json()
    existing = {item["creative"]["name"] for item in detail.get("items", [])}

    for mixkit_id, name, age_group, category, description in ADS:
        if name in existing:
            print(f"  bỏ qua  {name} (đã có trong playlist)")
            continue
        clip = download(mixkit_id)
        if clip is None:
            print(f"  LỖI     {name} — không tải được clip {mixkit_id}", file=sys.stderr)
            continue
        with clip.open("rb") as fh:
            response = httpx.post(
                f"{API}/api/playlists/{playlist['id']}/upload",
                files={"file": (f"{name}.mp4", fh, "video/mp4")},
                data={
                    "name": name,
                    "target_age_group": age_group,
                    "target_gender": "all",
                    "target_crowd": "all",
                    "target_weather": "all",
                    "category": category,
                    "description": description,
                },
                timeout=120.0,
            )
        if response.status_code >= 400:
            print(f"  LỖI     {name} — {response.status_code} {response.text[:160]}", file=sys.stderr)
            continue
        print(f"  đã thêm {name:<28} target={age_group}")

    print("\nBật smart targeting:")
    print(f"  curl -X POST {API}/api/ads/smart-targeting -H 'Content-Type: application/json' -d '{{\"enabled\": true}}'")
    print("hoặc dùng công tắc ở /admin. Sau đó chọn một clip trẻ em làm nguồn camera để thử.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
