"""Pydantic response/request models — the wire contract the Next.js app codes against."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from server.audience import normalize_target_age


class UserLogin(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    id: int
    username: str
    full_name: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    user: UserPublic


class ScreenRegisterResponse(BaseModel):
    pairing_code: str
    expires_in_seconds: int
    expires_at: float


class ScreenStatusResponse(BaseModel):
    status: str             # "pending" | "paired" | "revoked"
    screen_token: str | None = None
    name: str | None = None
    location: str | None = None


class ScreenPublic(BaseModel):
    id: int
    name: str | None = None
    location: str | None = None
    status: str
    pairing_code: str | None = None
    last_seen: float | None = None
    created_at: float
    playlist_id: int | None = None
    playlist_name: str | None = None
    user_id: int | None = None
    account_name: str | None = None
    account_username: str | None = None


class ScreenPairRequest(BaseModel):
    pairing_code: str
    name: str
    location: str | None = None


class Creative(BaseModel):
    id: int
    name: str
    filename: str
    kind: str                # "image" | "video"
    duration: float          # seconds this creative holds the screen
    position: int
    enabled: bool
    created_at: float
    url: str                 # ready-to-use src for <img>/<video>
    target_age_group: str = "all"
    target_gender: str = "all"
    target_crowd: str = "all"        # "all" | "single" | "group" | "crowd"
    target_weather: str = "all"      # "all" | "sunny" | "cloudy" | "rainy"
    category: str = "Chung"
    description: str = ""


class CreativeUpdate(BaseModel):
    name: str | None = None
    duration: float | None = Field(default=None, gt=0)
    enabled: bool | None = None
    target_age_group: str | None = None
    target_gender: str | None = None
    target_crowd: str | None = None
    target_weather: str | None = None
    category: str | None = None
    description: str | None = None

    # The dropdown is the main way a target gets set, and it PATCHes through
    # here. Canonicalising at the schema means no route can write a spelling
    # the matcher will not recognise.
    @field_validator("target_age_group")
    @classmethod
    def _canonical_age(cls, value: str | None) -> str | None:
        return None if value is None else normalize_target_age(value)


class TargetSuggestion(BaseModel):
    category: str
    target_age_group: str
    target_gender: str
    reason: str


class CreativeProfileResult(BaseModel):
    """What the analyser read out of an advert. A proposal for the /ads form, so
    every tag is optional — an honest "could not tell" beats a confident guess."""
    target_age_group: str | None = None
    target_gender: str | None = None
    target_crowd: str | None = None
    category: str | None = None
    source: str = "none"          # faces | vlm | faces+vlm | none
    faces_found: int = 0
    frames_read: int = 0
    notes: list[str] = []


class AdRecommendation(BaseModel):
    target_creative_id: int | None = None
    target_creative_name: str | None = None
    target_creative_url: str | None = None
    category: str | None = None
    match_score: float = 0.0          # 0.0 to 100.0%
    viewer_age_group: str | None = None
    viewer_gender: str | None = None
    viewer_approx_age: float | None = None
    crowd_context: str | None = None   # "single" | "group" | "crowd"
    people_count: int = 0
    reason: str = ""


class PlaylistOrder(BaseModel):
    creative_ids: list[int]


class CreativeAddUrl(BaseModel):
    name: str
    url: str
    duration: float = 15.0
    category: str = "Chung"
    description: str = ""


class PlaylistItemPublic(BaseModel):
    id: int
    playlist_id: int
    creative_id: int
    position: int
    duration: float
    creative: Creative


class PlaylistPublic(BaseModel):
    id: int
    name: str
    description: str = ""
    is_active: bool = False
    kind: str = "default"
    aspect_ratio: str = "FullHD Nghiêng"
    sync_playback: bool = False
    fit_screen: bool = False
    publish_status: str = "Chưa publish"
    created_at: float
    item_count: int = 0
    total_duration: float = 0.0
    items: list[PlaylistItemPublic] = []
    assigned_screen_ids: list[int] = []
    assigned_screen_names: list[str] = []


class PlaylistActivateRequest(BaseModel):
    screen_ids: list[int] = []


class PlaylistCreate(BaseModel):
    name: str
    description: str = ""
    is_active: bool = False
    kind: str = "default"
    aspect_ratio: str = "FullHD Nghiêng"
    sync_playback: bool = False
    fit_screen: bool = False


class PlaylistUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    kind: str | None = None
    aspect_ratio: str | None = None
    sync_playback: bool | None = None
    fit_screen: bool | None = None
    publish_status: str | None = None


class PlaylistItemAdd(BaseModel):
    creative_id: int
    duration: float | None = None
    position: int | None = None


class PlaylistItemOrder(BaseModel):
    item_ids: list[int]


class NowPlaying(BaseModel):
    airing_id: int | None = None
    creative: Creative | None = None
    started_at: float | None = None
    elapsed: float = 0.0
    remaining: float = 0.0
    playing: bool = False


class LiveTrack(BaseModel):
    track_id: int
    bbox: tuple[int, int, int, int]
    age: float | None = None
    age_group: str | None = None
    gender: str | None = None
    yaw: float | None = None
    pitch: float | None = None
    attention: int = 0
    dwell_time: float = 0.0


class LiveStats(BaseModel):
    """The instantaneous state of the screen's audience."""
    running: bool
    source: str | None = None
    mode: str = "server"           # "server" = host webcam, "browser" = pushed in
    fps: float = 0.0
    frame_index: int = 0
    people_now: int = 0            # faces tracked in the current frame
    attentive_now: int = 0         # ...of which are looking at the screen
    unique_viewers_session: int = 0  # distinct tracks since the engine started
    now_playing: NowPlaying | None = None
    tracks: list[LiveTrack] = []
    recommendation: AdRecommendation | None = None
    smart_targeting: bool = False
    error: str | None = None


class CreativeReport(BaseModel):
    creative_id: int
    name: str
    kind: str
    airings: int
    seconds_on_screen: float
    reach: int                 # people who were in front of the screen
    impressions: int           # ...who actually looked, per min_attention_seconds
    attention_rate: float      # impressions / reach
    avg_attention_seconds: float
    total_attention_seconds: float
    by_gender: dict[str, int]
    by_age_group: dict[str, int]


class SummaryReport(BaseModel):
    generated_at: float
    window_hours: float | None
    totals: CreativeReport | None
    creatives: list[CreativeReport]
