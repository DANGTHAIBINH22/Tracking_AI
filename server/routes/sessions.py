"""Tracking Sessions management endpoints for per-device session history.

A row in `tracking_sessions` stores raw counters plus two JSON blobs written by
`server/engine.py`: `demographics_json` (the roll-up) and `tracks_json` (one
entry per person the session ever saw). Everything a report shows — gender
split, age spread, how many times each `track_id` was measured — is derived
here from those two, so the engine keeps exactly one way of counting and the
API keeps exactly one way of presenting it.

Sessions recorded before the engine kept a per-track ledger carry frame-scaled
demographics. Those are reported as unknown rather than reshaped into
plausible-looking numbers: `has_track_detail` says which kind of row it is.
"""

from __future__ import annotations

import csv
import io
import json
import time
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from server import db
from server.audience import AGE_GROUPS
from server.auth import get_current_user

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class TrackDetail(BaseModel):
    """One person, for the whole time they were in this session's frame."""
    track_id: int
    first_seen: float
    last_seen: float
    presence_seconds: float
    dwell_seconds: float
    frames: int                 # how many times this track_id was measured
    attentive_frames: int
    attentive: bool
    gender: str | None = None
    age: int | None = None
    age_group: str | None = None
    has_pet: bool = False
    pet_type: str | None = None
    clothing_color: str | None = None
    clothing_style: str | None = None


class SessionSummary(BaseModel):
    id: int
    session_code: str
    device_id: str
    screen_id: int | None = None
    source: str
    started_at: float
    ended_at: float | None = None
    started_at_text: str
    ended_at_text: str | None = None
    duration_seconds: float
    status: str

    # --- audience counters -------------------------------------------------
    total_footfall: int          # people who walked past (reach)
    total_impressions: int       # people who actually looked
    attention_rate: float
    avg_dwell_time: float
    peak_people: int

    # --- derived from the per-track ledger ---------------------------------
    has_track_detail: bool
    unique_tracks: int
    total_track_frames: int      # total measurements across every track_id
    male_count: int
    female_count: int
    unknown_gender_count: int
    age_breakdown: dict[str, int]
    avg_age: int | None = None
    avg_presence_seconds: float
    impressions_per_minute: float

    notes: str
    demographics_json: str
    tracks_json: str = "[]"
    tracks: list[TrackDetail] = []


class SessionStartRequest(BaseModel):
    device_id: str = "host"
    screen_id: int | None = None
    source: str | None = None
    notes: str = ""


def _loads(raw: Any, fallback: Any) -> Any:
    """Parse a JSON column without ever letting one bad row kill the listing."""
    if raw is None or raw == "":
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return fallback


def _whole(value: Any) -> int | None:
    """Any stored age -> whole years, or None.

    Ages are integers now (see `AgeGender.age`), but `tracks_json` and
    `demographics_json` are frozen JSON: every session written before that
    change holds values like 7.4 and 27.3. Pydantic will not coerce a float
    with a fractional part into an `int` field, so without this a single old
    session raises a ValidationError and takes the whole history listing with
    it.
    """
    if value is None:
        return None
    try:
        return round(float(value))
    except (TypeError, ValueError):
        return None


def _clock(ts: float | None) -> str | None:
    """Epoch seconds -> 'YYYY-MM-DD HH:MM:SS' in the server's local time."""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")


def _parse_tracks(raw: Any) -> list[TrackDetail]:
    out: list[TrackDetail] = []
    for t in _loads(raw, []):
        if not isinstance(t, dict) or "track_id" not in t:
            continue
        first = float(t.get("first_seen") or 0.0)
        last = float(t.get("last_seen") or first)
        attentive_frames = int(t.get("attentive_frames") or 0)
        out.append(
            TrackDetail(
                track_id=int(t["track_id"]),
                first_seen=first,
                last_seen=last,
                presence_seconds=round(float(t.get("presence_seconds") or max(0.0, last - first)), 2),
                dwell_seconds=round(float(t.get("dwell_seconds") or 0.0), 2),
                frames=int(t.get("frames") or 0),
                attentive_frames=attentive_frames,
                attentive=attentive_frames > 0,
                gender=t.get("gender"),
                age=_whole(t.get("age")),
                age_group=t.get("age_group"),
                has_pet=bool(t.get("has_pet", False)),
                pet_type=t.get("pet_type"),
                clothing_color=t.get("clothing_color"),
                clothing_style=t.get("clothing_style"),
            )
        )
    return out


def _summarize(row: dict, now: float, *, with_tracks: bool) -> SessionSummary:
    start = float(row["started_at"])
    ended = row["ended_at"]
    duration = max(0.0, (ended if ended is not None else now) - start)

    demo = _loads(row.get("demographics_json"), {})
    tracks = _parse_tracks(row.get("tracks_json"))

    # Only a ledger written per track can be broken down by person. A legacy row
    # counted per frame would report a 10-minute session as hundreds of men.
    has_detail = bool(tracks) or demo.get("counted_per") == "track"
    genders = demo.get("genders") or {} if has_detail else {}
    ages = demo.get("ages") or {} if has_detail else {}

    if tracks:
        # Recompute from the ledger: it survives a partial write of the roll-up,
        # and it is the same arithmetic the CSV export shows per row.
        male = sum(1 for t in tracks if t.gender == "Nam")
        female = sum(1 for t in tracks if t.gender == "Nữ")
        unknown_gender = sum(1 for t in tracks if not t.gender)
        age_breakdown = {g: sum(1 for t in tracks if t.age_group == g) for g in AGE_GROUPS}
        age_breakdown["unknown"] = sum(1 for t in tracks if not t.age_group)
        # Comprehending over AGE_GROUPS alone drops any bracket not currently
        # offered — a track stored under the pre-split `<18` counted in neither
        # its own bucket nor "unknown", so the breakdown quietly summed to less
        # than the session's track count.
        for t in tracks:
            if t.age_group and t.age_group not in age_breakdown:
                age_breakdown[t.age_group] = sum(1 for o in tracks if o.age_group == t.age_group)
        known_ages = [t.age for t in tracks if t.age is not None]
        avg_age = round(sum(known_ages) / len(known_ages)) if known_ages else None
        avg_presence = round(sum(t.presence_seconds for t in tracks) / len(tracks), 2)
        unique_tracks = len(tracks)
        total_frames = sum(t.frames for t in tracks)
    else:
        male = int(genders.get("Nam", 0))
        female = int(genders.get("Nữ", 0))
        unknown_gender = int(genders.get("unknown", 0))
        age_breakdown = {g: int(ages.get(g, 0)) for g in AGE_GROUPS}
        age_breakdown["unknown"] = int(ages.get("unknown", 0))
        avg_age = _whole(demo.get("avg_age")) if has_detail else None
        avg_presence = float(demo.get("avg_presence_seconds") or 0.0) if has_detail else 0.0
        unique_tracks = int(demo.get("unique_tracks") or row["total_footfall"])
        total_frames = 0

    minutes = duration / 60.0
    impressions = int(row["total_impressions"])

    return SessionSummary(
        id=row["id"],
        session_code=row["session_code"],
        device_id=row["device_id"],
        screen_id=row["screen_id"],
        source=row["source"],
        started_at=start,
        ended_at=ended,
        started_at_text=_clock(start) or "",
        ended_at_text=_clock(ended),
        duration_seconds=round(duration, 1),
        status=row["status"],
        total_footfall=int(row["total_footfall"]),
        total_impressions=impressions,
        attention_rate=float(row["attention_rate"]),
        avg_dwell_time=float(row["avg_dwell_time"]),
        peak_people=int(row["peak_people"]),
        has_track_detail=has_detail,
        unique_tracks=unique_tracks,
        total_track_frames=total_frames,
        male_count=male,
        female_count=female,
        unknown_gender_count=unknown_gender,
        age_breakdown=age_breakdown,
        avg_age=avg_age,
        avg_presence_seconds=avg_presence,
        impressions_per_minute=round(impressions / minutes, 2) if minutes > 0 else 0.0,
        notes=row["notes"] or "",
        demographics_json=row["demographics_json"] or "{}",
        tracks_json=row.get("tracks_json") or "[]",
        tracks=tracks if with_tracks else [],
    )


@router.get("", response_model=list[SessionSummary])
def list_sessions(
    device_id: str | None = Query(None),
    screen_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> list[SessionSummary]:
    """List tracking sessions, optionally filtered by device_id or screen_id."""
    now = time.time()
    conditions = []
    params = []

    if device_id:
        conditions.append("device_id = %s")
        params.append(str(device_id))
    if screen_id is not None:
        conditions.append("screen_id = %s")
        params.append(screen_id)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query_sql = f"""
        SELECT * FROM tracking_sessions
        {where_clause}
        ORDER BY started_at DESC
        LIMIT %s
    """
    params.append(limit)
    rows = db.query(query_sql, params)

    # `tracks` is left off the listing on purpose: 50 sessions x hundreds of
    # people each is a payload the table never reads. /{id} carries it.
    return [_summarize(r, now, with_tracks=False) for r in rows]


@router.get("/{session_id}", response_model=SessionSummary)
def get_session(
    session_id: int,
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> SessionSummary:
    """Retrieve details for a specific tracking session, including every track."""
    row = db.query_one("SELECT * FROM tracking_sessions WHERE id = %s", (session_id,))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên thu thập này.")
    return _summarize(row, time.time(), with_tracks=True)


@router.delete("/{session_id}")
def delete_session(
    session_id: int,
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> dict:
    """Delete a tracking session record."""
    row = db.query_one("SELECT id FROM tracking_sessions WHERE id = %s", (session_id,))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên cần xoá.")
    db.execute("DELETE FROM tracking_sessions WHERE id = %s", (session_id,))
    return {"ok": True, "deleted_id": session_id}


@router.get("/{session_id}/export.csv")
def export_session_csv(
    session_id: int,
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> Response:
    """Export all tracked people in this session as a CSV file."""
    row = db.query_one("SELECT * FROM tracking_sessions WHERE id = %s", (session_id,))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên thu thập.")

    summary = _summarize(row, time.time(), with_tracks=True)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "track_id",
        "gender",
        "age",
        "age_group",
        "has_pet",
        "pet_type",
        "clothing_color",
        "clothing_style",
        "first_seen",
        "last_seen",
        "presence_seconds",
        "dwell_seconds",
        "frames",
        "attentive_frames",
        "attentive",
    ])
    for t in summary.tracks:
        writer.writerow([
            t.track_id,
            t.gender or "unknown",
            t.age if t.age is not None else "",
            t.age_group or "unknown",
            "yes" if t.has_pet else "no",
            t.pet_type or "",
            t.clothing_color or "",
            t.clothing_style or "",
            datetime.fromtimestamp(t.first_seen).strftime("%Y-%m-%d %H:%M:%S") if t.first_seen else "",
            datetime.fromtimestamp(t.last_seen).strftime("%Y-%m-%d %H:%M:%S") if t.last_seen else "",
            round(t.presence_seconds, 1),
            round(t.dwell_seconds, 1),
            t.frames,
            t.attentive_frames,
            t.attentive,
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=session_{summary.session_code}.csv"},
    )
