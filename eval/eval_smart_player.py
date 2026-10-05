"""Does the smart player pick the right advert for who is in front of the screen?

Two levels, run against the real scoring code (server/engine.py →
server/audience.py) and the real choice code (server/player.py):

  logic  The audience of each scenario as fetch.sh measured it (gender + age per
         person), fed straight into the scorer. No model in the loop, so every
         scenario must pass: a failure here is a bug in the algorithm or in the
         advert configuration, never noise.

  e2e    Each clip in data/kb*/ run frame by frame through Pipeline, sampled once
         a second of video time like the engine does, then scored. This is what a
         real screen would do; a failure here can also be the model misreading a
         face, and the report shows what it read so the two can be told apart.

The adverts are the real ones in the library (creatives 3..10). Their targeting
is AD_CONFIG below, chosen from what each clip actually shows, not its file
name. `--apply` writes it to the database.

    uv run python -m eval.eval_smart_player            # logic only (instant)
    uv run python -m eval.eval_smart_player --e2e      # + pipeline on every clip
    uv run python -m eval.eval_smart_player --apply    # write AD_CONFIG to the DB

Pipeline results are cached in outputs/smart_player/ — delete it to re-measure.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, deque
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.audience import NEUTRAL_SCORE  # noqa: E402

DATA = ROOT / "data"
CACHE = ROOT / "outputs" / "smart_player"

# ---------------------------------------------------------------------------
# Advert targeting — one line per creative, from what the clip shows.
# ---------------------------------------------------------------------------
AD_CONFIG: dict[int, dict] = {
    3: dict(  # ERP sales dashboard walkthrough
        category="Công nghệ & Gaming", target_age_group="35-55", target_gender="all",
        description="Phần mềm ERP quản lý bán hàng cho chủ doanh nghiệp",
    ),
    4: dict(  # system-architecture diagram: filler, for everyone
        category="Chung", target_age_group="all", target_gender="all",
        description="Ảnh minh hoạ kiến trúc hệ thống",
    ),
    5: dict(  # man training at a cable machine
        category="Sức khỏe & Dưỡng sinh", target_age_group="18-35", target_gender="M", target_style="Sport",
        description="Phòng gym, tập luyện thể hình cho nam",
    ),
    6: dict(  # a woman's hands shopping on a laptop
        category="Thời trang & Làm đẹp", target_age_group="18-35", target_gender="F",
        description="Mua sắm thời trang online",
    ),
    7: dict(  # a man and a woman jogging
        category="Sức khỏe & Dưỡng sinh", target_age_group="18-35", target_gender="all", target_style="Sport",
        description="Chạy bộ, thể thao cho người trẻ",
    ),
    8: dict(  # young man doing warehouse inventory
        category="Chung", target_age_group="18-35", target_gender="M",
        description="Tuyển dụng nhân viên kho vận",
    ),
    9: dict(  # Gen-Z rap battle show
        category="Thanh niên & Xu hướng", target_age_group="13-18", target_gender="all",
        description="Chương trình rap, âm nhạc GenZ",
    ),
    10: dict(  # football highlights
        category="Thanh niên & Xu hướng", target_age_group="all", target_gender="M",
        description="Bóng đá, thể thao",
    ),
}
DEFAULTS = dict(target_weather="all", target_pet="all", target_style="all", target_clothing="all", target_crowd="all")

ROTATION = None  # expected "no clear majority -> normal rotation"


@dataclass
class Scenario:
    key: str
    clip: str                       # path under data/
    people: list[tuple[str, int]]   # ground truth from fetch.sh: (gender, age)
    expected: set                   # creative ids that are a correct pick (ROTATION allowed)
    attentive: bool = True
    note: str = ""
    pet: str | None = None


S = Scenario
SCENARIOS: list[Scenario] = [
    S("kb1", "kb1_two_men_18_35/two_men_selfie-1319.mp4", [("M", 30), ("M", 32)], {5, 7, 8, 10},
      note="2 nam 18-35 → gym / chạy bộ / kho vận / bóng đá"),
    S("kb2a", "kb2_teen_boy/teen_boy_filming_bedroom-23331.mp4", [("M", 11)], {10},
      note="bé trai 11 (6-13) → bóng đá; rap 13-18 không khớp tuổi"),
    S("kb2b", "kb2_teen_boy/teen_boy_vlog_garage-24009.mp4", [("M", 13)], {9, 10},
      note="nam 13 (13-18) → rap GenZ / bóng đá"),
    S("kb3a", "kb3_two_women_18_35/two_women_cafe_date-41236.mp4", [("F", 29), ("F", 24)], {6, 7},
      note="2 nữ 18-35 → mua sắm online / chạy bộ"),
    S("kb3b", "kb3_two_women_18_35/two_women_pottery-40023.mp4", [("F", 20), ("F", 26)], {6, 7}),
    S("kb4", "kb4_with_pet/dog_woman_selfie-6355.mp4", [("F", 34), ("F", 24), ("F", 31)], {6, 7}, pet="dog",
      note="nữ 18-35 dắt chó; thư viện chưa có quảng cáo thú cưng"),
    S("kb5a", "kb5_teen_girl/teen_girl_webinar-49284.mp4", [("F", 17)], {9}, note="nữ 17 → rap GenZ"),
    S("kb5b", "kb5_teen_girl/teen_girl_writes_letter-15769.mp4", [("F", 16)], {9}),
    S("kb6", "kb6_mixed_3f_1m/team_brainstorm_3f_1m-5489.mp4", [("F", 48), ("M", 32), ("F", 29), ("F", 33)], {7},
      note="3 nữ + 1 nam: 75% trong 18-35 → chạy bộ (cho mọi giới tính); quảng cáo chỉ cho nữ 18-35 chỉ khớp 50%"),
    S("kb7a", "kb7_crowd/students_walking_university-4519.mp4", [("F", 21), ("M", 22), ("F", 20), ("M", 23)], {7, ROTATION},
      attentive=False, note="sinh viên đi ngang, không nhìn màn hình"),
    S("kb7b", "kb7_crowd/people_walking_street-4437.mp4", [("F", 25), ("M", 45), ("F", 62), ("M", 16), ("F", 38), ("M", 30)],
      {ROTATION}, attentive=False, note="đám đông hỗn hợp đi ngang → vòng phát thường"),
    S("kb8a", "kb8_two_men_linger/two_mechanics_talking-22986.mp4", [("M", 40), ("M", 40)], {3, 10},
      note="2 nam 40 → ERP chủ doanh nghiệp / bóng đá"),
    S("kb8b", "kb8_two_men_linger/two_young_men_bike_shop-24011.mp4", [("M", 25), ("M", 33)], {5, 7, 8, 10}),
]


# ---------------------------------------------------------------------------
# The engine and player, real code with the I/O stubbed out
# ---------------------------------------------------------------------------
def load_ads() -> list[dict]:
    from server import db
    rows = {r["id"]: dict(r) for r in db.query("SELECT * FROM creatives WHERE id = ANY(%s)", (list(AD_CONFIG),))}
    missing = set(AD_CONFIG) - set(rows)
    if missing:
        raise SystemExit(f"Creatives {sorted(missing)} are not in the library.")
    return [{**rows[i], **DEFAULTS, **AD_CONFIG[i]} for i in AD_CONFIG]


class _Player:
    smart_targeting = True

    def __init__(self, ads):
        self.ads = ads
        self.last = None

    def playlist(self):
        return self.ads

    def set_audience_ranking(self, ranked_ids, context_info=None, scores=None):
        self.last = (ranked_ids, scores or {}, context_info or {})


def make_engine(ads):
    from server.engine import AnalyticsEngine
    from scene_vlm import SceneContext
    eng = AnalyticsEngine.__new__(AnalyticsEngine)
    eng.player = _Player(ads)
    eng._pipeline = SimpleNamespace(latest_context=SceneContext(), latest_pets=[])
    eng._audience_window = deque()
    return eng


def make_picker():
    from server.player import PlaylistPlayer
    p = PlaylistPlayer.__new__(PlaylistPlayer)
    p._last_played_times = {}
    return p


def person(gender, age_group, attentive=True, dwell=5.0, age=None, pet=None, style=None, color=None):
    return SimpleNamespace(
        gender=gender, age_group=age_group, age=age, attention=int(attentive), dwell_time=dwell,
        has_pet=bool(pet), pet_type=pet, clothing_style=style, clothing_color=color,
    )


def decide(eng, picker, snapshots, ads) -> dict:
    """Feed one-second snapshots; at each tick ask the player what it would play next."""
    eng._audience_window.clear()
    by_id = {a["id"]: a for a in ads}
    picks: list = []
    last_scores, last_reason = {}, ""
    for snap in snapshots:
        eng._pipeline.latest_pets = [SimpleNamespace(pet_type=t) for t in snap.get("pets", [])]
        rec = eng._compute_recommendation(snap["metas"])
        if rec is None or eng.player.last is None:
            continue
        ranking, scores, _ = eng.player.last
        choice = picker._pick_ranked(ads, ranking, scores, exclude_id=None)
        picks.append(choice["id"] if choice else ROTATION)
        last_scores, last_reason = scores, rec["reason"]
    # Rotation: with the audience held, which adverts take turns over six cuts?
    turns, prev = [], None
    picker._last_played_times = {}
    if last_scores:
        ranking = sorted(last_scores, key=lambda i: -last_scores[i])
        for t in range(6):
            c = picker._pick_ranked(ads, ranking, last_scores, exclude_id=prev)
            cid = c["id"] if c else ROTATION
            turns.append(cid)
            if c:
                picker._last_played_times[cid] = t + 1
            # A rotation cut airs some other advert, which becomes "previous".
            prev = cid if c else -1
    return {
        "picks": picks,
        "scores": {by_id[i]["id"]: round(s) for i, s in sorted(last_scores.items(), key=lambda kv: -kv[1])},
        "reason": last_reason,
        "turns": turns,
    }


# ---------------------------------------------------------------------------
# Pipeline measurement (cached)
# ---------------------------------------------------------------------------
def measure(clip: Path, pipeline) -> list[dict]:
    import cv2
    from server.audience import normalize_age_group

    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / (clip.stem + ".json")
    if cached.exists():
        return json.loads(cached.read_text())
    pipeline.reset()
    cap = cv2.VideoCapture(str(clip))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    snaps, idx, next_sample = [], 0, 1.0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = idx / fps
        res = pipeline.process_frame(frame, now=t, source_frame=frame)
        if t >= next_sample:  # the engine recommends about once a second
            next_sample += 1.0
            snaps.append({
                "t": round(t, 1),
                "people": [
                    {
                        "gender": m.gender, "age": m.age, "age_group": normalize_age_group(m.age_group),
                        "attention": m.attention, "dwell": round(m.dwell_time, 1),
                        "has_pet": m.has_pet, "pet_type": m.pet_type,
                        "style": m.clothing_style, "color": m.clothing_color,
                    }
                    for m in res.metas
                ],
                "pets": [p.pet_type for p in res.pets],
            })
        idx += 1
    cap.release()
    cached.write_text(json.dumps(snaps, ensure_ascii=False))
    return snaps


def to_snapshots(raw: list[dict]) -> list[dict]:
    return [
        {
            "metas": [
                person(p["gender"], p["age_group"], bool(p["attention"]), p["dwell"], p["age"],
                       p["pet_type"] if p["has_pet"] else None, p["style"], p["color"])
                for p in s["people"]
            ],
            "pets": s["pets"],
        }
        for s in raw
        if s["people"]
    ]


def read_audience(raw: list[dict]) -> str:
    """What the pipeline read, per stable track — for telling model error from logic error."""
    seen = Counter()
    for s in raw:
        for p in s["people"]:
            if p["gender"] or p["age_group"]:
                seen[(p["gender"] or "?", p["age_group"] or "?")] += 1
    if not seen:
        return "không đọc được ai"
    total = sum(seen.values())
    return ", ".join(f"{g} {a} {round(100 * n / total)}%" for (g, a), n in seen.most_common(4))


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def label(cid, names) -> str:
    return "vòng thường" if cid is ROTATION else f"#{cid} {names[cid]}"


@dataclass
class Row:
    sc: Scenario
    ok: bool
    share: float
    out: dict
    read: str = ""
    extra: list = field(default_factory=list)


def judge(sc: Scenario, out: dict) -> tuple[bool, float]:
    if not out["picks"]:
        return False, 0.0
    good = sum(1 for p in out["picks"] if p in sc.expected)
    share = good / len(out["picks"])
    return share >= 0.8, share


def print_rows(title: str, rows: list[Row], names: dict) -> None:
    print(f"\n{'=' * 100}\n{title}\n{'=' * 100}")
    for r in rows:
        mark = "PASS" if r.ok else "FAIL"
        picked = Counter(r.out["picks"]).most_common(3)
        print(f"[{mark}] {r.sc.key:5} {r.sc.note or ''}")
        if r.read:
            print(f"        pipeline đọc: {r.read}")
        print(f"        mong đợi: {', '.join(label(c, names) for c in sorted(r.sc.expected, key=lambda x: -1 if x is None else x))}")
        print(f"        đã chọn : {', '.join(f'{label(c, names)} ×{n}' for c, n in picked)}  ({round(r.share * 100)}% đúng)")
        top = list(r.out["scores"].items())[:4]
        print(f"        điểm    : {', '.join(f'#{i} {s}' for i, s in top)}   (trung tính = {NEUTRAL_SCORE:.0f})")
        if r.out["turns"]:
            print(f"        xoay vòng 6 lượt: {' → '.join('—' if t is None else f'#{t}' for t in r.out['turns'])}")
        if r.out["reason"]:
            print(f"        lý do   : {r.out['reason']}")
    passed = sum(r.ok for r in rows)
    print(f"\n→ {passed}/{len(rows)} kịch bản đạt")


def run_logic(ads, names) -> list[Row]:
    from server.audience import age_to_group
    eng, picker = make_engine(ads), make_picker()
    rows = []
    for sc in SCENARIOS:
        metas = [
            person(g, age_to_group(a), sc.attentive, 6.0, a, sc.pet if i == 0 else None)
            for i, (g, a) in enumerate(sc.people)
        ]
        snaps = [{"metas": metas, "pets": [sc.pet] if sc.pet else []}] * 6
        out = decide(eng, picker, snaps, ads)
        ok, share = judge(sc, out)
        rows.append(Row(sc, ok, share, out))
    return rows


def run_e2e(ads, names) -> list[Row]:
    from pipeline import Pipeline
    eng, picker = make_engine(ads), make_picker()
    pipeline = None
    rows = []
    for sc in SCENARIOS:
        clip = DATA / sc.clip
        if not clip.exists():
            print(f"  bỏ qua {sc.key}: thiếu {clip} (chạy bash eval/scenarios/fetch.sh)")
            continue
        if not (CACHE / (clip.stem + ".json")).exists() and pipeline is None:
            print("  nạp Pipeline…", flush=True)
            pipeline = Pipeline()
            pipeline.warmup()
        print(f"  đo {sc.key} ({clip.name})…", flush=True)
        raw = measure(clip, pipeline)
        out = decide(eng, picker, to_snapshots(raw), ads)
        ok, share = judge(sc, out)
        rows.append(Row(sc, ok, share, out, read_audience(raw)))
    return rows


def apply_config() -> None:
    from server import db
    for cid, cfg in AD_CONFIG.items():
        fields = {**DEFAULTS, **cfg}
        fields.pop("target_crowd", None)
        sets = ", ".join(f"{k} = %s" for k in fields)
        db.execute(f"UPDATE creatives SET {sets} WHERE id = %s", (*fields.values(), cid))
    print(f"Đã ghi cấu hình cho {len(AD_CONFIG)} quảng cáo.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--e2e", action="store_true", help="also run every clip through Pipeline")
    ap.add_argument("--apply", action="store_true", help="write AD_CONFIG to the database")
    args = ap.parse_args()
    if args.apply:
        apply_config()
    ads = load_ads()
    names = {a["id"]: a["name"][:28] for a in ads}
    names[ROTATION] = "vòng thường"
    logic = run_logic(ads, names)
    print_rows("TẦNG 1 — LOGIC (khán giả chuẩn → bộ chấm điểm + bộ chọn thật)", logic, names)
    ok = all(r.ok for r in logic)
    if args.e2e:
        e2e = run_e2e(ads, names)
        print_rows("TẦNG 2 — ĐẦU-CUỐI (clip → Pipeline → bộ chấm điểm + bộ chọn thật)", e2e, names)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
