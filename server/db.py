"""PostgreSQL persistence (psycopg 3). Three tables, one idea each.

    creatives   — an uploaded image/video the screen can show
    airings     — one continuous showing of one creative (start .. end)
    impressions — one person (track) measured against one airing

Everything the dashboard reports is an aggregate over `impressions`, so the
attribution rule lives in exactly one place: an impression row is only written
for a track that was actually present while that airing was on screen.

Connections come from a pool rather than one-per-thread. The capture thread
writes an impression every time somebody leaves the frame while HTTP handlers
read aggregates, and a pool is what keeps those from serialising behind each
other or leaking a connection per request worker.
"""

from __future__ import annotations

import os
from typing import Any, Iterable

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    # Matches the default homebrew/docker-compose setup: see README.
    "postgresql://localhost:5432/signage",
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS creatives (
    id          SERIAL PRIMARY KEY,
    name        TEXT             NOT NULL,
    filename    TEXT             NOT NULL,
    kind        TEXT             NOT NULL CHECK (kind IN ('image', 'video')),
    duration    DOUBLE PRECISION NOT NULL,
    position    INTEGER          NOT NULL DEFAULT 0,
    enabled     BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at  DOUBLE PRECISION NOT NULL,
    target_age_group TEXT        NOT NULL DEFAULT 'all',
    target_gender    TEXT        NOT NULL DEFAULT 'all',
    category         TEXT        NOT NULL DEFAULT 'Chung',
    description      TEXT        NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS airings (
    id          SERIAL PRIMARY KEY,
    creative_id INTEGER          NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
    started_at  DOUBLE PRECISION NOT NULL,
    ended_at    DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_airings_creative ON airings(creative_id);
CREATE INDEX IF NOT EXISTS idx_airings_started ON airings(started_at DESC);

CREATE TABLE IF NOT EXISTS impressions (
    id                SERIAL PRIMARY KEY,
    airing_id         INTEGER          NOT NULL REFERENCES airings(id) ON DELETE CASCADE,
    creative_id       INTEGER          NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
    track_id          INTEGER          NOT NULL,
    first_seen        DOUBLE PRECISION NOT NULL,
    last_seen         DOUBLE PRECISION NOT NULL,
    presence_seconds  DOUBLE PRECISION NOT NULL,
    attention_seconds DOUBLE PRECISION NOT NULL,
    age_group         TEXT,
    gender            TEXT,
    -- One row per (airing, track): a person who looks away and back is still one
    -- viewer of that airing, not two. This constraint is also what makes the
    -- capture thread's upsert idempotent.
    UNIQUE (airing_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_impressions_creative ON impressions(creative_id);
CREATE INDEX IF NOT EXISTS idx_impressions_seen ON impressions(last_seen);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL DEFAULT 'Administrator',
    role          TEXT NOT NULL DEFAULT 'admin',
    created_at    DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS screens (
    id           SERIAL PRIMARY KEY,
    screen_token TEXT UNIQUE,
    pairing_code TEXT,
    code_expires DOUBLE PRECISION,
    name         TEXT,
    location     TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    last_seen    DOUBLE PRECISION,
    created_at   DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_screens_code ON screens(pairing_code);
CREATE INDEX IF NOT EXISTS idx_screens_token ON screens(screen_token);

CREATE TABLE IF NOT EXISTS playlists (
    id          SERIAL PRIMARY KEY,
    name        TEXT             NOT NULL,
    description TEXT             NOT NULL DEFAULT '',
    is_active   BOOLEAN          NOT NULL DEFAULT FALSE,
    created_at  DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
    id          SERIAL PRIMARY KEY,
    playlist_id INTEGER          NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    creative_id INTEGER          NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
    position    INTEGER          NOT NULL DEFAULT 0,
    duration    DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_playlist_items_pid ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_cid ON playlist_items(creative_id);

-- Operator switches that must outlive the process. An in-memory flag looks fine
-- until a reload silently returns the screen to dumb sequential playback with
-- nothing in the UI to say it happened.
CREATE TABLE IF NOT EXISTS app_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracking_sessions (
    id                SERIAL PRIMARY KEY,
    session_code      TEXT UNIQUE NOT NULL,
    device_id         TEXT NOT NULL DEFAULT 'host',
    screen_id         INTEGER REFERENCES screens(id) ON DELETE SET NULL,
    source            TEXT NOT NULL DEFAULT '0',
    started_at        DOUBLE PRECISION NOT NULL,
    ended_at          DOUBLE PRECISION,
    status            TEXT NOT NULL DEFAULT 'active',
    total_footfall    INTEGER NOT NULL DEFAULT 0,
    total_impressions INTEGER NOT NULL DEFAULT 0,
    attention_rate    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    avg_dwell_time    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    peak_people       INTEGER NOT NULL DEFAULT 0,
    notes             TEXT NOT NULL DEFAULT '',
    demographics_json TEXT NOT NULL DEFAULT '{}',
    tracks_json       TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON tracking_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON tracking_sessions(started_at DESC);
"""

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            DATABASE_URL,
            min_size=1,
            max_size=30,
            timeout=10.0,
            kwargs={"autocommit": True, "row_factory": dict_row},
            open=True,
        )
    return _pool


def init_db() -> None:
    import time
    from server.auth import hash_password

    with pool().connection(timeout=5.0) as conn:
        conn.execute(SCHEMA)
        conn.execute("""
            ALTER TABLE creatives DROP CONSTRAINT IF EXISTS creatives_kind_check;
            ALTER TABLE creatives ADD COLUMN IF NOT EXISTS target_age_group TEXT NOT NULL DEFAULT 'all';
            ALTER TABLE creatives ADD COLUMN IF NOT EXISTS target_gender TEXT NOT NULL DEFAULT 'all';
            ALTER TABLE creatives ADD COLUMN IF NOT EXISTS target_crowd TEXT NOT NULL DEFAULT 'all';
            ALTER TABLE creatives ADD COLUMN IF NOT EXISTS target_weather TEXT NOT NULL DEFAULT 'all';
            ALTER TABLE creatives ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Chung';
            ALTER TABLE creatives ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

            ALTER TABLE playlists ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'default';
            ALTER TABLE playlists ADD COLUMN IF NOT EXISTS aspect_ratio TEXT NOT NULL DEFAULT 'FullHD Nghiêng';
            ALTER TABLE playlists ADD COLUMN IF NOT EXISTS sync_playback BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE playlists ADD COLUMN IF NOT EXISTS fit_screen BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE playlists ADD COLUMN IF NOT EXISTS publish_status TEXT NOT NULL DEFAULT 'unpublish';

            ALTER TABLE screens ADD COLUMN IF NOT EXISTS playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;
            ALTER TABLE tracking_sessions ADD COLUMN IF NOT EXISTS tracks_json TEXT DEFAULT '[]';

            -- Rows written before server/audience.py existed carry the CV
            -- pipeline's spelling of the two outer age brackets. Re-spell them
            -- so a report aggregates one bucket per bracket instead of two, and
            -- so targeting matches them. Idempotent: a second run changes
            -- nothing, which is what re-applying this block on every boot needs.
            UPDATE impressions SET age_group = '<18' WHERE age_group IN ('0-18', '0-17');
            UPDATE impressions SET age_group = '>55' WHERE age_group IN ('55+', '56+');
            UPDATE creatives SET target_age_group = '<18' WHERE target_age_group IN ('0-18', '0-17');
            UPDATE creatives SET target_age_group = '>55' WHERE target_age_group IN ('55+', '56+');
        """)

        # Seed default admin user if no users exist
        user_row = conn.execute("SELECT id FROM users LIMIT 1").fetchone()
        if not user_row:
            admin_hash = hash_password("admin123")
            conn.execute(
                """INSERT INTO users (username, password_hash, full_name, role, created_at)
                   VALUES (%s, %s, %s, %s, %s)""",
                ("admin", admin_hash, "Quản Trị Viên Hệ Thống", "admin", time.time()),
            )
            print("[Database] Đã tạo tài khoản Admin mặc định: 'admin' (mật khẩu: 'admin123')")

        # Ensure default playlist exists only on first-ever database setup
        seeded = conn.execute("SELECT value FROM app_state WHERE key = 'seeded_default_playlist'").fetchone()
        if not seeded:
            first_pl = conn.execute("SELECT id FROM playlists ORDER BY id ASC LIMIT 1").fetchone()
            if not first_pl:
                new_pl = conn.execute(
                    """INSERT INTO playlists (name, description, is_active, created_at)
                       VALUES (%s, %s, TRUE, %s) RETURNING id""",
                    ("Playlist Homescreen Mặc Định", "Danh sách phát quảng cáo chiếu lên màn hình Homescreen", time.time()),
                ).fetchone()
                pl_id = new_pl["id"]
                existing_creatives = conn.execute(
                    "SELECT id, position, duration FROM creatives WHERE enabled = TRUE ORDER BY position ASC, id ASC"
                ).fetchall()
                for idx, c in enumerate(existing_creatives):
                    conn.execute(
                        """INSERT INTO playlist_items (playlist_id, creative_id, position, duration)
                           VALUES (%s, %s, %s, %s)""",
                        (pl_id, c["id"], idx, c["duration"]),
                    )
                print(f"[Database] Đã khởi tạo Playlist mặc định (id={pl_id}) với {len(existing_creatives)} media.")
            conn.execute(
                "INSERT INTO app_state (key, value) VALUES ('seeded_default_playlist', '1') "
                "ON CONFLICT (key) DO NOTHING"
            )


def close_db() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def query(sql: str, params: Iterable[Any] = ()) -> list[dict]:
    with pool().connection(timeout=5.0) as conn:
        return conn.execute(sql, tuple(params)).fetchall()


def query_one(sql: str, params: Iterable[Any] = ()) -> dict | None:
    with pool().connection(timeout=5.0) as conn:
        return conn.execute(sql, tuple(params)).fetchone()


def execute(sql: str, params: Iterable[Any] = ()) -> None:
    """Run a statement whose result you do not need (UPDATE / DELETE / upsert)."""
    with pool().connection(timeout=5.0) as conn:
        conn.execute(sql, tuple(params))


def insert(sql: str, params: Iterable[Any] = ()) -> int:
    """Run an INSERT that ends in `RETURNING id` and hand back that id.

    Postgres has no `lastrowid`; the id has to come back from the statement
    itself, which is also the only version that stays correct under concurrent
    inserts.
    """
    row = query_one(sql, params)
    if row is None or "id" not in row:
        raise RuntimeError("insert() needs a statement ending in RETURNING id")
    return int(row["id"])
