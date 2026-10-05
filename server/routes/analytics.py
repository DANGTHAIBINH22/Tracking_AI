"""Live audience state, per-advert reports, CSV export."""

from __future__ import annotations

import csv
import io
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from server import db, reports
from server.auth import get_current_user, scope
from server.routes.player import _now_playing
from server.schemas import LiveStats, SummaryReport
from server.settings import SETTINGS
from server.state import ENGINE, PLAYER

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/live", response_model=LiveStats)
def live() -> LiveStats:
    return LiveStats(**ENGINE.snapshot(), now_playing=_now_playing())


@router.get("/summary", response_model=SummaryReport)
def summary(window_hours: float | None = Query(default=None, gt=0)) -> SummaryReport:
    return SummaryReport(**reports.summary(window_hours))


@router.get("/timeline")
def timeline(limit: int = Query(default=100, ge=1, le=1000)) -> list[dict]:
    return reports.timeline(limit)


@router.get("/settings")
def thresholds() -> dict:
    """What the numbers above actually mean, so the UI can label them honestly."""
    return {
        "min_attention_seconds": SETTINGS.min_attention_seconds,
        "min_presence_seconds": SETTINGS.min_presence_seconds,
        "default_image_seconds": SETTINGS.default_image_seconds,
    }


@router.get("/export.csv")
def export_csv() -> StreamingResponse:
    """Every impression as a row — the same deliverable run_video.py produces."""
    rows = db.query(
        """
        SELECT i.id, c.name AS creative, c.kind, i.airing_id, i.track_id,
               i.first_seen, i.last_seen, i.presence_seconds, i.attention_seconds,
               i.age_group, i.gender
        FROM impressions i JOIN creatives c ON c.id = i.creative_id
        ORDER BY i.id
        """
    )
    buf = io.StringIO()
    fields = ["id", "creative", "kind", "airing_id", "track_id", "first_seen",
              "last_seen", "presence_seconds", "attention_seconds", "age_group", "gender"]
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    buf.seek(0)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="impressions-{stamp}.csv"'},
    )


@router.get("/overview")
def overview(
    days: int = Query(7, ge=1, le=90, description="1 = today, 7 = this week, 30 = this month (calendar days)"),
    tz_offset: int = Query(0, description="JS getTimezoneOffset(): minutes behind UTC"),
    device_id: str | None = Query(None, description="Limit to one device (a screen id, or 'host')"),
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> dict:
    """Everything a device's report tab shows (or, without device_id, every
    device's), for the last `days`
    calendar days in the viewer's timezone, plus the same totals for the
    period before it so the page can say whether things went up or down.

    Built from a handful of grouped queries on purpose: /summary runs three
    queries per creative, which over a remote database is seconds per page.
    Reach / impressions follow server/reports.py exactly (impressions rows,
    attention_seconds >= min_attention_seconds), so the numbers agree with
    the dashboard's.
    """
    now = time.time()
    # Midnight today in the viewer's calendar, then back `days - 1` more days.
    local_now = now - tz_offset * 60
    today = local_now - (local_now % 86400) + tz_offset * 60
    start = today - (days - 1) * 86400
    end = now
    span = end - start
    prev_start = start - days * 86400
    bucket = 3600 if days == 1 else 86400
    n_buckets = 24 if days == 1 else days
    min_att = SETTINGS.min_attention_seconds

    # --- devices ---------------------------------------------------------
    cond, params = scope(user, "user_id")
    screens = db.query(
        f"SELECT id, name, location, last_seen FROM screens WHERE {cond} AND status = 'paired' ORDER BY id",
        params,
    )
    if device_id is not None:
        screens = [sc for sc in screens if str(sc["id"]) == str(device_id)]
    live_id = getattr(ENGINE, "_current_session_id", None)

    # impressions and airings carry no device: one capture thread feeds one
    # engine, so a row belongs to the device whose tracking session was running
    # when it happened. An abandoned session (no ended_at, not the live one)
    # covers nothing — left open-ended it would claim every later row.
    def on_device(col: str) -> tuple[str, tuple]:
        if device_id is None:
            return "", ()
        return (
            f""" AND EXISTS (SELECT 1 FROM tracking_sessions ts
                     WHERE ts.device_id = %s AND {col} >= ts.started_at
                       AND {col} <= COALESCE(ts.ended_at, CASE WHEN ts.id = %s THEN %s ELSE ts.started_at END))""",
            (str(device_id), live_id if live_id is not None else -1, now),
        )
    imp_dev, imp_dev_p = on_device("i.first_seen")
    air_dev, air_dev_p = on_device("a.started_at")

    # --- tracking sessions (current + previous period) -------------------
    s_cond, s_params = scope(user)
    sessions = db.query(
        f"""SELECT id, device_id, started_at, ended_at, total_footfall, total_impressions, avg_dwell_time
            FROM tracking_sessions
            WHERE {s_cond} AND started_at >= %s AND started_at < %s{" AND device_id = %s" if device_id is not None else ""}""",
        (*s_params, prev_start, end, *((str(device_id),) if device_id is not None else ())),
    )
    cur = [s for s in sessions if s["started_at"] >= start]
    prev = [s for s in sessions if s["started_at"] < start]

    # A session with no ended_at is only still running if it is the engine's
    # own; any other was abandoned (crash, reload) and its length is unknown.
    # Counting those up to "now" turned one stale row into two months of tracking.

    def seconds(r: dict) -> float:
        if r["ended_at"] is not None:
            return max(0.0, r["ended_at"] - r["started_at"])
        return max(0.0, now - r["started_at"]) if r["id"] == live_id else 0.0

    def tracked_seconds(rows: list[dict]) -> float:
        return sum(seconds(r) for r in rows)

    series = [
        {"t": start + i * bucket, "sessions": 0, "people": 0, "viewed": 0, "reach": 0, "impressions": 0}
        for i in range(n_buckets)
    ]
    for s in cur:
        i = int((s["started_at"] - start) // bucket)
        if 0 <= i < n_buckets:
            series[i]["sessions"] += 1
            series[i]["people"] += int(s["total_footfall"] or 0)
            series[i]["viewed"] += int(s["total_impressions"] or 0)

    per_device: dict[str, dict] = {}
    for s in cur:
        d = per_device.setdefault(str(s["device_id"]), {"sessions": 0, "people": 0, "viewed": 0, "seconds": 0.0, "last": 0.0})
        d["sessions"] += 1
        d["people"] += int(s["total_footfall"] or 0)
        d["viewed"] += int(s["total_impressions"] or 0)
        d["seconds"] += seconds(s)
        d["last"] = max(d["last"], s["started_at"])
    devices = []
    for sc in screens:
        d = per_device.pop(str(sc["id"]), {"sessions": 0, "people": 0, "viewed": 0, "seconds": 0.0, "last": 0.0})
        devices.append({
            "device_id": str(sc["id"]), "name": sc["name"] or f"Thiết bị #{sc['id']}", "location": sc["location"],
            "online": bool(sc["last_seen"] and now - sc["last_seen"] < 30.0),
            **d, "seconds": round(d["seconds"], 1),
        })
    # Sessions from a source that is not a paired screen (the API host's own
    # camera, test clips) still happened; show them rather than drop them.
    for dev, d in per_device.items():
        name = {"host": "Camera máy chủ", "browser": "Webcam trình duyệt"}.get(dev, f"Thiết bị đã xoá #{dev}")
        devices.append({"device_id": dev, "name": name,
                        "location": None, "online": False, **d, "seconds": round(d["seconds"], 1)})
    devices.sort(key=lambda d: (-d["people"], d["name"]))

    # --- videos: impressions per creative, airings per creative ----------
    per_creative = db.query(
        f"""SELECT i.creative_id, c.name, c.kind,
                  COUNT(*) AS reach,
                  SUM(CASE WHEN i.attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions,
                  COALESCE(SUM(i.attention_seconds), 0) AS attention
           FROM impressions i JOIN creatives c ON c.id = i.creative_id
           WHERE i.last_seen >= %s AND i.last_seen < %s{imp_dev}
           GROUP BY i.creative_id, c.name, c.kind""",
        (min_att, start, end, *imp_dev_p),
    )
    airings = db.query(
        f"""SELECT a.creative_id, c.name, c.kind, COUNT(*) AS n,
                  SUM(COALESCE(a.ended_at, %s) - a.started_at) AS seconds
           FROM airings a JOIN creatives c ON c.id = a.creative_id
           WHERE a.started_at >= %s AND a.started_at < %s{air_dev}
           GROUP BY a.creative_id, c.name, c.kind""",
        (now, start, end, *air_dev_p),
    )
    videos: dict[int, dict] = {}
    for a in airings:
        videos[a["creative_id"]] = {"creative_id": a["creative_id"], "name": a["name"], "kind": a["kind"],
                                    "airings": a["n"], "seconds_on_screen": round(float(a["seconds"] or 0), 1),
                                    "reach": 0, "impressions": 0, "attention_seconds": 0.0}
    for r in per_creative:
        v = videos.setdefault(r["creative_id"], {"creative_id": r["creative_id"], "name": r["name"], "kind": r["kind"],
                                                 "airings": 0, "seconds_on_screen": 0.0})
        v.update(reach=int(r["reach"]), impressions=int(r["impressions"] or 0),
                 attention_seconds=round(float(r["attention"]), 1))
    for v in videos.values():
        v["attention_rate"] = round(v["impressions"] / v["reach"], 3) if v["reach"] else 0.0
    top_videos = sorted(videos.values(), key=lambda v: (-v["impressions"], -v["attention_seconds"], -v["reach"]))

    # --- impressions over time + who watched -----------------------------
    for r in db.query(
        f"""SELECT FLOOR((last_seen - %s) / %s)::int AS b, COUNT(*) AS reach,
                  SUM(CASE WHEN attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions
           FROM impressions i WHERE last_seen >= %s AND last_seen < %s{imp_dev} GROUP BY b""",
        (start, bucket, min_att, start, end, *imp_dev_p),
    ):
        if 0 <= r["b"] < n_buckets:
            series[r["b"]]["reach"] = int(r["reach"])
            series[r["b"]]["impressions"] = int(r["impressions"] or 0)

    by_gender: dict[str, int] = {}
    by_age: dict[str, int] = {}
    for r in db.query(
        f"""SELECT gender, age_group, COUNT(*) AS n FROM impressions i
           WHERE attention_seconds >= %s AND last_seen >= %s AND last_seen < %s{imp_dev}
           GROUP BY gender, age_group""",
        (min_att, start, end, *imp_dev_p),
    ):
        if r["gender"]:
            by_gender[r["gender"]] = by_gender.get(r["gender"], 0) + r["n"]
        if r["age_group"]:
            by_age[r["age_group"]] = by_age.get(r["age_group"], 0) + r["n"]

    prev_imp = db.query_one(
        f"""SELECT COUNT(*) AS reach, SUM(CASE WHEN attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions
           FROM impressions i WHERE last_seen >= %s AND last_seen < %s{imp_dev}""",
        (min_att, prev_start, start, *imp_dev_p),
    ) or {}

    def totals(rows: list[dict]) -> dict:
        people = sum(int(r["total_footfall"] or 0) for r in rows)
        viewed = sum(int(r["total_impressions"] or 0) for r in rows)
        return {"sessions": len(rows), "people": people, "viewed": viewed,
                "tracked_seconds": round(tracked_seconds(rows), 1),
                "active_devices": len({r["device_id"] for r in rows})}

    reach = sum(v["reach"] for v in videos.values())
    impressions = sum(v["impressions"] for v in videos.values())
    return {
        "generated_at": now,
        "days": days,
        "start": start,
        "bucket_seconds": bucket,
        "devices_total": len(screens),
        "devices_online": sum(1 for d in devices if d["online"]),
        "current": {**totals(cur), "reach": reach, "impressions": impressions,
                    "attention_seconds": round(sum(v["attention_seconds"] for v in videos.values()), 1),
                    "airings": sum(v["airings"] for v in videos.values())},
        "previous": {**totals(prev), "reach": int(prev_imp.get("reach") or 0),
                     "impressions": int(prev_imp.get("impressions") or 0)},
        "series": series,
        "top_videos": top_videos,
        "devices": devices,
        "by_gender": by_gender,
        "by_age_group": by_age,
        "span_seconds": round(span, 1),
    }


@router.get("/hourly")
def hourly(
    window_hours: float | None = Query(default=None, gt=0),
    tz_offset: int = Query(0, description="JS getTimezoneOffset(): minutes behind UTC"),
) -> dict:
    """Audience by hour of day (viewer's clock), summed over the window: when
    people stand in front of the screen and when they actually watch.

    Bucketed by first_seen — the hour someone arrived — from the impressions
    table, so reach / impressions mean exactly what they mean on /summary.
    """
    now = time.time()
    since = now - window_hours * 3600 if window_hours else 0.0
    rows = db.query(
        """SELECT (FLOOR((first_seen - %s) / 3600)::bigint %% 24) AS h,
                  COUNT(*) AS reach,
                  SUM(CASE WHEN attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions,
                  COALESCE(SUM(attention_seconds), 0) AS attention
           FROM impressions WHERE last_seen >= %s
           GROUP BY h""",
        (tz_offset * 60, SETTINGS.min_attention_seconds, since),
    )
    hours = [{"hour": h, "reach": 0, "impressions": 0, "attention_seconds": 0.0} for h in range(24)]
    for r in rows:
        h = int(r["h"]) % 24
        hours[h].update(reach=int(r["reach"]), impressions=int(r["impressions"] or 0),
                        attention_seconds=round(float(r["attention"]), 1))
    return {"window_hours": window_hours, "hours": hours}


# "Engaged" on the funnel: looked long enough to take in a message, not just
# to count as an impression. A presentation threshold, not a model one.
ENGAGED_SECONDS = 3.0


@router.get("/funnel")
def funnel(window_hours: float | None = Query(default=None, gt=0)) -> dict:
    """Four measured stages from the impressions table, one row per (airing, person):
    present → looked at all → looked >= min_attention (an impression) → looked >= 3s.

    Every stage is counted, none is estimated. The dashboard used to derive the
    glance and engaged stages as fixed fractions of the others, which drew a
    funnel that no camera ever measured.
    """
    since = time.time() - window_hours * 3600 if window_hours else 0.0
    row = db.query_one(
        """SELECT COUNT(*) AS reach,
                  SUM(CASE WHEN attention_seconds > 0 THEN 1 ELSE 0 END) AS glance,
                  SUM(CASE WHEN attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions,
                  SUM(CASE WHEN attention_seconds >= %s THEN 1 ELSE 0 END) AS engaged
           FROM impressions WHERE last_seen >= %s""",
        (SETTINGS.min_attention_seconds, ENGAGED_SECONDS, since),
    ) or {}
    return {
        "window_hours": window_hours,
        "reach": int(row.get("reach") or 0),
        "glance": int(row.get("glance") or 0),
        "impressions": int(row.get("impressions") or 0),
        "engaged": int(row.get("engaged") or 0),
        "min_presence_seconds": SETTINGS.min_presence_seconds,
        "min_attention_seconds": SETTINGS.min_attention_seconds,
        "engaged_seconds": ENGAGED_SECONDS,
    }


@router.get("/breakdown")
def breakdown(
    window_hours: float | None = Query(default=None, gt=0),
    device_id: str | None = Query(None, description="Limit to one device (a screen id, or 'host')"),
    tz_offset: int = Query(0, description="JS getTimezoneOffset(): minutes behind UTC, for `hours`"),
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> dict:
    """The dashboard's totals cut four ways: by device, by area (the screen's
    location), by media and by playlist.

    Device is the base. impressions and airings carry no device, so each row is
    credited to the device whose tracking session was running at that moment —
    the same rule as a device's own report tab, so the device rows here add up
    to what each device page shows. Areas are devices grouped by location.
    Playlist comes from airings.playlist_id; older airings without one fall back
    to the creative's playlist when it belongs to exactly one.

    With `device_id`, only what that device's sessions covered is counted, so
    the media and playlist cuts answer "what worked on this screen". Every row
    also carries the funnel's glance / engaged stages, and `hours` is the same
    looks by the viewer's hour of day.
    """
    now = time.time()
    since = now - window_hours * 3600 if window_hours else 0.0
    min_att = SETTINGS.min_attention_seconds
    live_id = getattr(ENGINE, "_current_session_id", None)

    cond, params = scope(user, "s.user_id")
    screens = {
        str(r["id"]): r
        for r in db.query(
            f"""SELECT s.id, s.name, s.location, p.name AS playlist_name
                FROM screens s LEFT JOIN playlists p ON p.id = s.playlist_id
                WHERE {cond} AND s.status = 'paired'""",
            params,
        )
    }
    s_cond, s_params = scope(user)
    sessions = db.query(
        f"""SELECT id, device_id, started_at, ended_at, total_footfall, total_impressions
            FROM tracking_sessions WHERE {s_cond} AND started_at >= %s ORDER BY started_at""",
        (*s_params, since),
    )
    # Session windows; an abandoned one (no end, not live) covers nothing.
    windows = [
        (s["started_at"], s["ended_at"] if s["ended_at"] is not None else (now if s["id"] == live_id else s["started_at"]), str(s["device_id"]))
        for s in sessions
    ]

    def device_at(t: float) -> str | None:
        for start, end, dev in windows:
            if start <= t <= end:
                return dev
        return None

    creatives = {r["id"]: r for r in db.query("SELECT id, name, kind FROM creatives")}
    playlists = {r["id"]: r["name"] for r in db.query("SELECT id, name FROM playlists")}
    member: dict[int, set[int]] = {}
    for r in db.query("SELECT playlist_id, creative_id FROM playlist_items"):
        member.setdefault(r["creative_id"], set()).add(r["playlist_id"])

    # Only the airing on screen right now may lack an end. Any other open one
    # was cut off by a restart; counting it up to "now" put nine hours of
    # screen time on one video, so it counts as zero-length instead.
    on_air, _ = PLAYER.current_airing()
    airings = {}
    for r in db.query(
        """SELECT id, creative_id, playlist_id, started_at, ended_at
           FROM airings WHERE COALESCE(ended_at, started_at) >= %s OR id = %s""",
        (since, on_air if on_air is not None else -1),
    ):
        if r["ended_at"] is None:
            r["ended_at"] = now if r["id"] == on_air else r["started_at"]
        airings[r["id"]] = r
    looks = db.query(
        "SELECT airing_id, creative_id, first_seen, attention_seconds FROM impressions WHERE last_seen >= %s",
        (since,),
    )

    def playlist_of(a: dict | None, creative_id: int) -> int | None:
        if a and a.get("playlist_id"):
            return a["playlist_id"]
        owners = member.get(creative_id, set())
        return next(iter(owners)) if len(owners) == 1 else None

    def device_name(dev: str | None) -> tuple[str, str | None]:
        if dev is None:
            return "Không xác định thiết bị", "lượt xem ngoài mọi phiên tracking"
        if dev in screens:
            sc = screens[dev]
            return sc["name"] or f"Thiết bị #{dev}", area_of(dev)
        return {"host": "Camera máy chủ", "browser": "Webcam trình duyệt"}.get(dev, f"Thiết bị đã xoá #{dev}"), area_of(dev)

    def area_of(dev: str | None) -> str:
        if dev in screens:
            return (screens[dev]["location"] or "").strip() or "Chưa gán khu vực"
        return "Ngoài danh sách thiết bị"

    groups: dict[str, dict[str, dict]] = {"devices": {}, "locations": {}, "media": {}, "playlists": {}}

    def row(dim: str, key: str, name: str, sub: str | None = None) -> dict:
        return groups[dim].setdefault(key, {
            "key": key, "name": name, "sub": sub, "airings": 0, "seconds_on_screen": 0.0,
            "reach": 0, "impressions": 0, "attention_seconds": 0.0,
            "glance": 0, "engaged": 0,
            "sessions": 0, "people": 0, "viewed": 0, "_devices": set(),
        })

    def dev_rows(dev: str | None) -> list[dict]:
        name, sub = device_name(dev)
        area = area_of(dev)
        return [row("devices", dev or "-", name, sub), row("locations", area, area)]

    def wanted(dev: str | None) -> bool:
        return device_id is None or dev == str(device_id)

    for s in sessions:
        if not wanted(str(s["device_id"])):
            continue
        for r in dev_rows(str(s["device_id"])):
            r["sessions"] += 1
            r["people"] += int(s["total_footfall"] or 0)
            r["viewed"] += int(s["total_impressions"] or 0)
            r["_devices"].add(str(s["device_id"]))

    for a in airings.values():
        c = creatives.get(a["creative_id"], {"name": f"Media #{a['creative_id']}", "kind": "?"})
        pl = playlist_of(a, a["creative_id"])
        secs = max(0.0, a["ended_at"] - max(a["started_at"], since))
        dev = device_at(a["started_at"])
        if not wanted(dev):
            continue
        targets = [
            row("media", str(a["creative_id"]), c["name"], c["kind"]),
            row("playlists", str(pl or "-"), playlists.get(pl, "Ngoài playlist / không rõ") if pl else "Ngoài playlist / không rõ"),
        ]
        if dev is not None:
            targets += dev_rows(dev)
        for r in targets:
            r["airings"] += 1
            r["seconds_on_screen"] += secs

    hours = [{"hour": h, "reach": 0, "impressions": 0, "attention_seconds": 0.0} for h in range(24)]
    for lk in looks:
        dev = device_at(lk["first_seen"])
        if not wanted(dev):
            continue
        att = float(lk["attention_seconds"] or 0)
        a = airings.get(lk["airing_id"])
        c = creatives.get(lk["creative_id"], {"name": f"Media #{lk['creative_id']}", "kind": "?"})
        pl = playlist_of(a, lk["creative_id"])
        h = hours[int((lk["first_seen"] - tz_offset * 60) // 3600) % 24]
        h["reach"] += 1
        h["impressions"] += 1 if att >= min_att else 0
        h["attention_seconds"] += att
        for r in [
            row("media", str(lk["creative_id"]), c["name"], c["kind"]),
            row("playlists", str(pl or "-"), playlists.get(pl, "Ngoài playlist / không rõ") if pl else "Ngoài playlist / không rõ"),
            *dev_rows(dev),
        ]:
            r["reach"] += 1
            r["impressions"] += 1 if att >= min_att else 0
            r["glance"] += 1 if att > 0 else 0
            r["engaged"] += 1 if att >= ENGAGED_SECONDS else 0
            r["attention_seconds"] += att
            if dev is not None:
                r["_devices"].add(dev)

    out = {}
    for dim, rows in groups.items():
        items = []
        for r in rows.values():
            devs = r.pop("_devices")
            r["devices"] = len(devs)
            r["seconds_on_screen"] = round(r["seconds_on_screen"], 1)
            r["attention_seconds"] = round(r["attention_seconds"], 1)
            r["attention_rate"] = round(r["impressions"] / r["reach"], 3) if r["reach"] else 0.0
            items.append(r)
        items.sort(key=lambda r: (-r["impressions"], -r["reach"], -r["people"], r["name"]))
        out[dim] = items
    for h in hours:
        h["attention_seconds"] = round(h["attention_seconds"], 1)
    return {"window_hours": window_hours, "generated_at": now, "device_id": device_id,
            "min_attention_seconds": min_att, "engaged_seconds": ENGAGED_SECONDS,
            "hours": hours, **out}


@router.get("/detection")
def detection(
    days: int = Query(7, ge=1, le=90, description="1 = today, 7 = this week, 30 = this month (calendar days)"),
    tz_offset: int = Query(0, description="JS getTimezoneOffset(): minutes behind UTC"),
    device_id: str | None = Query(None, description="Limit to one device (a screen id, or 'host')"),
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> dict:
    """What each device's camera detected and tracked over the period: people,
    how many faced the screen, how many watched, how long they stayed, who they
    were. Built from tracking_sessions alone — the per-device ledger — through
    the same `_summarize` the session history uses, so the numbers match it.

    Stages per device: detected (unique tracks) → attentive (faced the screen
    for at least one frame) → viewed (dwell >= min_attention_seconds). Legacy
    sessions without a per-track ledger only know detected and viewed; they are
    counted in `sessions_without_detail` so the page can say so.
    """
    from server.routes.sessions import _summarize  # route module; imported lazily to keep startup order free

    now = time.time()
    local_now = now - tz_offset * 60
    today = local_now - (local_now % 86400) + tz_offset * 60
    start = today - (days - 1) * 86400
    bucket = 3600 if days == 1 else 86400
    n_buckets = 24 if days == 1 else days
    min_att = SETTINGS.min_attention_seconds
    live_id = getattr(ENGINE, "_current_session_id", None)

    cond, params = scope(user)
    rows = db.query(
        f"""SELECT * FROM tracking_sessions
            WHERE {cond} AND started_at >= %s{" AND device_id = %s" if device_id is not None else ""}
            ORDER BY started_at""",
        (*params, start, *((str(device_id),) if device_id is not None else ())),
    )
    s_cond, s_params = scope(user, "user_id")
    screens = {str(r["id"]): r for r in db.query(
        f"SELECT id, name, location, last_seen FROM screens WHERE {s_cond} AND status = 'paired'", s_params)}

    def blank() -> dict:
        return {"sessions": 0, "sessions_without_detail": 0, "tracked_seconds": 0.0,
                "detected": 0, "attentive": 0, "viewed": 0, "peak_people": 0,
                "dwell_seconds": 0.0, "presence_seconds": 0.0, "tracks_with_detail": 0,
                "frames": 0, "timed_detected": 0, "male": 0, "female": 0, "unknown_gender": 0,
                "ages": {}, "pets": 0, "pet_types": {}}

    total = blank()
    per_device: dict[str, dict] = {}
    series = [{"t": start + i * bucket, "detected": 0, "attentive": 0, "viewed": 0} for i in range(n_buckets)]

    for r in rows:
        s = _summarize(r, now, with_tracks=True)
        # An abandoned session (no end, not live) has an unknown length; count
        # its people but not its time, the same rule as /overview.
        secs = s.duration_seconds if (s.ended_at is not None or s.id == live_id) else 0.0
        tracks = s.tracks
        detected = len(tracks) if tracks else s.unique_tracks
        attentive = sum(1 for t in tracks if t.attentive) if tracks else 0
        viewed = sum(1 for t in tracks if t.dwell_seconds >= min_att) if tracks else s.total_impressions
        dev = str(s.device_id)
        i = int((s.started_at - start) // bucket)
        if 0 <= i < n_buckets:
            series[i]["detected"] += detected
            series[i]["attentive"] += attentive
            series[i]["viewed"] += viewed
        for agg in (total, per_device.setdefault(dev, blank())):
            agg["sessions"] += 1
            agg["sessions_without_detail"] += 0 if tracks else 1
            agg["tracked_seconds"] += secs
            agg["timed_detected"] += detected if secs > 0 else 0
            agg["detected"] += detected
            agg["attentive"] += attentive
            agg["viewed"] += viewed
            agg["peak_people"] = max(agg["peak_people"], s.peak_people)
            agg["male"] += s.male_count
            agg["female"] += s.female_count
            agg["unknown_gender"] += s.unknown_gender_count
            for g, n in s.age_breakdown.items():
                if n:
                    agg["ages"][g] = agg["ages"].get(g, 0) + n
            for t in tracks:
                agg["tracks_with_detail"] += 1
                agg["frames"] += t.frames
                agg["dwell_seconds"] += t.dwell_seconds
                agg["presence_seconds"] += t.presence_seconds
                if t.has_pet:
                    agg["pets"] += 1
                    kind = t.pet_type or "khác"
                    agg["pet_types"][kind] = agg["pet_types"].get(kind, 0) + 1

    def finish(agg: dict) -> dict:
        n = agg["tracks_with_detail"]
        hours = agg["tracked_seconds"] / 3600
        return {
            **{k: v for k, v in agg.items() if k not in ("dwell_seconds", "presence_seconds", "timed_detected")},
            "tracked_seconds": round(agg["tracked_seconds"], 1),
            "avg_dwell_seconds": round(agg["dwell_seconds"] / n, 2) if n else None,
            "avg_presence_seconds": round(agg["presence_seconds"] / n, 2) if n else None,
            "attentive_rate": round(agg["attentive"] / n, 3) if n else None,
            "view_rate": round(agg["viewed"] / agg["detected"], 3) if agg["detected"] else 0.0,
            # Only sessions with a known length: people from an abandoned one
            # divided by nobody's hours read as hundreds per hour.
            "people_per_hour": round(agg["timed_detected"] / hours, 1) if hours > 0 else None,
        }

    def name_of(dev: str) -> tuple[str, str | None, bool]:
        if dev in screens:
            sc = screens[dev]
            return (sc["name"] or f"Thiết bị #{dev}", sc["location"],
                    bool(sc["last_seen"] and now - sc["last_seen"] < 30.0))
        return ({"host": "Camera máy chủ", "browser": "Webcam trình duyệt"}.get(dev, f"Thiết bị đã xoá #{dev}"),
                None, dev == "host" and live_id is not None)

    devices = []
    keys = list(per_device) + [k for k in screens if k not in per_device and device_id is None]
    for dev in keys:
        name, location, online = name_of(dev)
        devices.append({"device_id": dev, "name": name, "location": location, "online": online,
                        **finish(per_device.get(dev, blank()))})
    devices.sort(key=lambda d: (-d["detected"], d["name"]))

    return {
        "generated_at": now, "days": days, "start": start, "bucket_seconds": bucket,
        "min_attention_seconds": min_att,
        "totals": finish(total), "devices": devices, "series": series,
    }
