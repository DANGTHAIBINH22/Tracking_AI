"""Aggregations over `impressions` — everything the dashboard shows.

Two words that are easy to conflate, kept apart deliberately:

    reach       — people who were in front of the screen while the advert ran
    impressions — the subset who actually looked at it (>= min_attention_seconds)

`attention_rate = impressions / reach` is the number worth optimising an advert
for; reach alone only measures footfall past the screen.
"""

from __future__ import annotations

import time

from server import db
from server.settings import SETTINGS


def _breakdown(creative_id: int | None, since: float | None, column: str) -> dict[str, int]:
    where = [f"{column} IS NOT NULL", "attention_seconds >= %s"]
    params: list = [SETTINGS.min_attention_seconds]
    if creative_id is not None:
        where.append("creative_id = %s")
        params.append(creative_id)
    if since is not None:
        where.append("last_seen >= %s")
        params.append(since)
    rows = db.query(
        f"SELECT {column} AS k, COUNT(*) AS n FROM impressions WHERE {' AND '.join(where)} GROUP BY k",
        params,
    )
    return {r["k"]: r["n"] for r in rows}


def _seconds_on_screen(creative_id: int | None, since: float | None, now: float) -> tuple[int, float]:
    where = ["1 = 1"]
    params: list = []
    if creative_id is not None:
        where.append("creative_id = %s")
        params.append(creative_id)
    if since is not None:
        where.append("started_at >= %s")
        params.append(since)
    rows = db.query(
        f"SELECT started_at, ended_at FROM airings WHERE {' AND '.join(where)}", params
    )
    # An airing still on screen has ended_at NULL; count it up to "now" so the
    # dashboard's seconds-on-screen ticks up live instead of jumping at the cut.
    total = sum((r["ended_at"] if r["ended_at"] is not None else now) - r["started_at"] for r in rows)
    return len(rows), round(max(0.0, total), 1)


def creative_report(creative: dict, since: float | None, now: float) -> dict:
    cid = creative["id"]
    airings, on_screen = _seconds_on_screen(cid, since, now)

    where = ["creative_id = %s"]
    params: list = [cid]
    if since is not None:
        where.append("last_seen >= %s")
        params.append(since)
    clause = " AND ".join(where)

    agg = db.query_one(
        f"""
        SELECT COUNT(*) AS reach,
               SUM(CASE WHEN attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions,
               SUM(attention_seconds) AS total_attention
        FROM impressions WHERE {clause}
        """,
        [SETTINGS.min_attention_seconds, *params],
    ) or {}

    reach = agg.get("reach") or 0
    impressions = agg.get("impressions") or 0
    total_attention = float(agg.get("total_attention") or 0.0)

    return {
        "creative_id": cid,
        "name": creative["name"],
        "kind": creative["kind"],
        "airings": airings,
        "seconds_on_screen": on_screen,
        "reach": reach,
        "impressions": impressions,
        "attention_rate": round(impressions / reach, 3) if reach else 0.0,
        "avg_attention_seconds": round(total_attention / impressions, 2) if impressions else 0.0,
        "total_attention_seconds": round(total_attention, 1),
        "by_gender": _breakdown(cid, since, "gender"),
        "by_age_group": _breakdown(cid, since, "age_group"),
    }


def summary(window_hours: float | None = None) -> dict:
    now = time.time()
    since = now - window_hours * 3600 if window_hours else None
    creatives = db.query("SELECT * FROM creatives ORDER BY position ASC, id ASC")
    reports = [creative_report(c, since, now) for c in creatives]

    airings, on_screen = _seconds_on_screen(None, since, now)
    where = ["1 = 1"]
    params: list = []
    if since is not None:
        where.append("last_seen >= %s")
        params.append(since)
    agg = db.query_one(
        f"""
        SELECT COUNT(*) AS reach,
               SUM(CASE WHEN attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions,
               SUM(attention_seconds) AS total_attention
        FROM impressions WHERE {' AND '.join(where)}
        """,
        [SETTINGS.min_attention_seconds, *params],
    ) or {}
    reach = agg.get("reach") or 0
    impressions = agg.get("impressions") or 0
    total_attention = float(agg.get("total_attention") or 0.0)

    totals = {
        "creative_id": 0,
        "name": "Tất cả quảng cáo",
        "kind": "all",
        "airings": airings,
        "seconds_on_screen": on_screen,
        "reach": reach,
        "impressions": impressions,
        "attention_rate": round(impressions / reach, 3) if reach else 0.0,
        "avg_attention_seconds": round(total_attention / impressions, 2) if impressions else 0.0,
        "total_attention_seconds": round(total_attention, 1),
        "by_gender": _breakdown(None, since, "gender"),
        "by_age_group": _breakdown(None, since, "age_group"),
    }

    return {
        "generated_at": now,
        "window_hours": window_hours,
        "totals": totals,
        "creatives": reports,
    }


def timeline(limit: int = 200) -> list[dict]:
    """Most recent airings with their measured audience — the 'what just happened' feed."""
    return db.query(
        """
        SELECT a.id                AS airing_id,
               a.started_at,
               a.ended_at,
               c.id                AS creative_id,
               c.name,
               c.kind,
               COUNT(i.id)         AS reach,
               SUM(CASE WHEN i.attention_seconds >= %s THEN 1 ELSE 0 END) AS impressions,
               COALESCE(SUM(i.attention_seconds), 0) AS total_attention_seconds
        FROM airings a
        JOIN creatives c ON c.id = a.creative_id
        LEFT JOIN impressions i ON i.airing_id = a.id
        -- Both primary keys, not every selected column: Postgres resolves
        -- c.name / c.kind through the functional dependency on c.id. SQLite
        -- would accept a bare `GROUP BY a.id`; Postgres rejects it outright.
        GROUP BY a.id, c.id
        ORDER BY a.started_at DESC
        LIMIT %s
        """,
        (SETTINGS.min_attention_seconds, limit),
    )
