"""Live audience state, per-advert reports, CSV export."""

from __future__ import annotations

import csv
import io
import time

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from server import db, reports
from server.routes.player import _now_playing
from server.schemas import LiveStats, SummaryReport
from server.settings import SETTINGS
from server.state import ENGINE

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
