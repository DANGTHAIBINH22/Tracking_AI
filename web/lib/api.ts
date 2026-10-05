/**
 * Typed client for the FastAPI service.
 *
 * Every type here mirrors a Pydantic model in `server/schemas.py`. When you change
 * one, change the other — there is no codegen step, and a silently drifting shape
 * shows up as an empty dashboard rather than a build error.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function mediaUrl(url: string): string {
  if (url.startsWith("http")) return url;
  const base = API_BASE;
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

export function wsUrl(path: string): string {
  const host =
    process.env.NEXT_PUBLIC_WS_HOST ||
    (typeof window !== "undefined" && window.location.hostname
      ? `${window.location.hostname}:8000`
      : "localhost:8000");
  return `ws://${host}${path}`;
}

export type Creative = {
  id: number;
  name: string;
  filename: string;
  kind: "image" | "video" | "web" | string;
  duration: number;
  position: number;
  enabled: boolean;
  created_at: number;
  url: string;
  target_age_group: string;
  target_gender: string;
  target_crowd: string;
  target_weather: string;
  target_pet?: string;
  target_clothing?: string;
  target_style?: string;
  category: string;
  description: string;
  /** Owning account. Non-admins only ever receive their own. */
  user_id?: number | null;
};

export type PlaylistItemPublic = {
  id: number;
  playlist_id: number;
  creative_id: number;
  position: number;
  duration: number;
  creative: Creative;
};

export type PlaylistPublic = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  kind?: string;
  aspect_ratio?: string;
  sync_playback?: boolean;
  fit_screen?: boolean;
  publish_status?: string;
  created_at: number;
  item_count: number;
  total_duration: number;
  items: PlaylistItemPublic[];
  /** Up to four thumbnails, filled even when `items` is not loaded. */
  covers?: { kind: string; url: string }[];
  assigned_screen_ids?: number[];
  assigned_screen_names?: string[];
  /** Owning account. Non-admins only ever receive their own. */
  user_id?: number | null;
};

export type TargetSuggestion = {
  category: string;
  target_age_group: string;
  target_gender: string;
  reason: string;
};

/** What the analyser read out of an advert. Null means "could not tell" — the
 *  form keeps whatever the operator already chose for that field. */
export type CreativeProfileResult = {
  target_age_group: string | null;
  target_gender: string | null;
  target_crowd: string | null;
  category: string | null;
  source: "faces" | "vlm" | "faces+vlm" | "none";
  faces_found: number;
  frames_read: number;
  notes: string[];
};

export type AdRecommendation = {
  target_creative_id: number | null;
  target_creative_name: string | null;
  target_creative_url: string | null;
  category: string | null;
  match_score: number;
  viewer_age_group: string | null;
  viewer_gender: string | null;
  viewer_gender_share?: number;
  viewer_age_share?: number;
  viewer_approx_age: number | null;   // whole years
  crowd_context?: string | null;
  people_count?: number;
  scene_weather?: string | null;
  scene_objects?: string[];
  has_pet?: boolean;
  pet_type?: string | null;
  scene_pets?: string[];
  clothing_color?: string | null;
  clothing_style?: string | null;
  reason: string;
};

export type UserRole = "admin" | "operator";

export type UserPublic = {
  id: number;
  username: string;
  full_name: string;
  /** "admin" manages accounts; "operator" runs the console but cannot. */
  role: UserRole | string;
  is_active?: boolean;
  created_at?: number | null;
  last_login?: number | null;
};

export type UserCreate = {
  username: string;
  password: string;
  full_name?: string;
  role: UserRole;
};

/** Only the fields being changed; `password` is an admin reset. */
export type UserUpdate = Partial<{
  full_name: string;
  role: UserRole;
  is_active: boolean;
  password: string;
}>;

export type TokenResponse = {
  access_token: string;
  token_type: string;
  user: UserPublic;
};

export type ScreenRegisterResponse = {
  pairing_code: string;
  expires_in_seconds: number;
  expires_at: number;
};

export type ScreenStatusResponse = {
  status: "pending" | "paired" | "expired" | "not_found" | "revoked";
  screen_token: string | null;
  name: string | null;
  location: string | null;
};

export type DayPerson = {
  seq: number;
  session_code: string;
  track_id: number;
  first_seen: number;
  last_seen: number;
  presence_seconds: number;
  dwell_seconds: number;
  attentive_share: number;
  viewed: boolean;
  gender: "M" | "F" | null;
  age: number | null;
  age_group: string | null;
  has_pet: boolean;
  pet_type: string | null;
  clothing_color: string | null;
  clothing_style: string | null;
  ads: { name: string; seconds: number }[];
  /** Videos the person looked at, by attention seconds — not just ones on air. */
  watched: { name: string; seconds: number }[];
};

export type OverviewTotals = {
  sessions: number;
  people: number;
  viewed: number;
  tracked_seconds: number;
  active_devices: number;
  reach: number;
  impressions: number;
  attention_seconds?: number;
  airings?: number;
};

export type OverviewVideo = {
  creative_id: number;
  name: string;
  kind: string;
  airings: number;
  seconds_on_screen: number;
  reach: number;
  impressions: number;
  attention_seconds: number;
  attention_rate: number;
};

export type OverviewDevice = {
  device_id: string;
  name: string;
  location: string | null;
  online: boolean;
  sessions: number;
  people: number;
  viewed: number;
  seconds: number;
  last: number;
};

/** /api/analytics/overview: the admin console's period summary. */
export type Overview = {
  generated_at: number;
  days: number;
  start: number;
  bucket_seconds: number;
  devices_total: number;
  devices_online: number;
  current: OverviewTotals;
  previous: OverviewTotals;
  series: { t: number; sessions: number; people: number; viewed: number; reach: number; impressions: number }[];
  top_videos: OverviewVideo[];
  devices: OverviewDevice[];
  by_gender: Record<string, number>;
  by_age_group: Record<string, number>;
};

export type HourlyAudience = {
  window_hours: number | null;
  hours: { hour: number; reach: number; impressions: number; attention_seconds: number }[];
};

export type Funnel = {
  window_hours: number | null;
  reach: number;
  glance: number;
  impressions: number;
  engaged: number;
  min_presence_seconds: number;
  min_attention_seconds: number;
  engaged_seconds: number;
};

export type BreakdownRow = {
  key: string;
  name: string;
  /** Location for a device, media kind for a creative. */
  sub: string | null;
  airings: number;
  seconds_on_screen: number;
  reach: number;
  impressions: number;
  attention_seconds: number;
  attention_rate: number;
  sessions: number;
  people: number;
  viewed: number;
  devices: number;
  /** Looked at all (attention > 0) — the funnel's second stage. */
  glance: number;
  /** Looked for at least `engaged_seconds`. */
  engaged: number;
};

/** /api/analytics/breakdown: dashboard totals by device, area, media and playlist. */
export type Breakdown = {
  window_hours: number | null;
  generated_at: number;
  device_id: string | null;
  min_attention_seconds: number;
  engaged_seconds: number;
  /** Looks by the viewer's hour of day, arrival hour. */
  hours: HourlyAudience["hours"];
  devices: BreakdownRow[];
  locations: BreakdownRow[];
  media: BreakdownRow[];
  playlists: BreakdownRow[];
};

/** What one device's camera detected and tracked over a period. */
export type DetectionStats = {
  sessions: number;
  /** Legacy sessions with no per-track ledger: detected/viewed only. */
  sessions_without_detail: number;
  tracked_seconds: number;
  detected: number;
  /** Faced the screen for at least one frame. */
  attentive: number;
  /** Dwell >= min_attention_seconds. */
  viewed: number;
  peak_people: number;
  tracks_with_detail: number;
  frames: number;
  male: number;
  female: number;
  unknown_gender: number;
  ages: Record<string, number>;
  pets: number;
  pet_types: Record<string, number>;
  avg_dwell_seconds: number | null;
  avg_presence_seconds: number | null;
  attentive_rate: number | null;
  view_rate: number;
  people_per_hour: number | null;
};

export type DetectionDevice = DetectionStats & {
  device_id: string;
  name: string;
  location: string | null;
  online: boolean;
};

/** /api/analytics/detection: the detect & tracking module, per device. */
export type Detection = {
  generated_at: number;
  days: number;
  start: number;
  bucket_seconds: number;
  min_attention_seconds: number;
  totals: DetectionStats;
  devices: DetectionDevice[];
  series: { t: number; detected: number; attentive: number; viewed: number }[];
};

export type DayLog = { date: string; end_date: string; device_id: string; sessions: number; people: DayPerson[] };

export type ScreenPublic = {
  id: number;
  name: string | null;
  location: string | null;
  status: string;
  pairing_code: string | null;
  last_seen: number | null;
  created_at: number;
  playlist_id?: number | null;
  playlist_name?: string | null;
  /** The assigned playlist is the one on air; otherwise the screen idles. */
  playlist_on_air?: boolean;
  /** Seen by the server within the last 30 seconds. */
  online?: boolean;
  user_id?: number | null;
  account_name?: string | null;
  account_username?: string | null;
};

export type AdDecisionLog = {
  timestamp: string;
  creative_id: number;
  creative_name: string;
  duration: number;
  mode: "smart_targeting" | "rotation" | "manual";
  match_score?: number | null;
  audience_summary?: string | null;
  reason?: string | null;
};

export type TargetingSettings = {
  smart_targeting: boolean;
  cut_in_enabled: boolean;
  cut_in_min_playback: number;
  lookahead_seconds: number;
};

export type NowPlaying = {
  airing_id: number | null;
  creative: Creative | null;
  started_at: number | null;
  elapsed: number;
  remaining: number;
  playing: boolean;
  /** What the player will cut to next, chosen exactly as it will be. */
  /** Fit (0..100) of the advert on screen for the current audience. */
  current_fit?: number | null;
  next_up?: { creative: Creative; mode: "cut_in" | "smart" | "rotation"; match_score: number | null } | null;
  ad_logs?: AdDecisionLog[];
  smart_targeting?: boolean;
  cut_in_enabled?: boolean;
  cut_in_min_playback?: number;
  lookahead_seconds?: number;
};

export type LiveTrack = {
  track_id: number;
  bbox: [number, number, number, number];
  age?: number | null;
  age_group: string | null;
  gender: string | null;
  yaw: number | null;
  pitch: number | null;
  attention: number;
  dwell_time: number;
  has_pet?: boolean;
  pet_type?: string | null;
  clothing_color?: string | null;
  clothing_style?: string | null;
};

export type AmbientContext = {
  weather: string | null;
  crowd_activity: string | null;
  objects: string[];
};

export type LiveStats = {
  running: boolean;
  source: string | null;
  /** "server" = the API host's own webcam, "browser" = frames pushed in by a screen. */
  mode: "server" | "browser";
  fps: number;
  frame_index: number;
  people_now: number;
  attentive_now: number;
  unique_viewers_session: number;
  now_playing: NowPlaying | null;
  tracks: LiveTrack[];
  recommendation?: AdRecommendation | null;
  ambient_context?: AmbientContext | null;
  smart_targeting?: boolean;
  error: string | null;
};

export type CreativeReport = {
  creative_id: number;
  name: string;
  kind: string;
  airings: number;
  seconds_on_screen: number;
  reach: number;
  impressions: number;
  attention_rate: number;
  avg_attention_seconds: number;
  total_attention_seconds: number;
  by_gender: Record<string, number>;
  by_age_group: Record<string, number>;
};

export type SummaryReport = {
  generated_at: number;
  window_hours: number | null;
  totals: CreativeReport | null;
  creatives: CreativeReport[];
};

export type AiringRow = {
  airing_id: number;
  started_at: number;
  ended_at: number | null;
  creative_id: number;
  name: string;
  kind: string;
  reach: number;
  impressions: number;
  total_attention_seconds: number;
};

export type IngestStatus = {
  connected: boolean;
  client: string | null;
  frames: number;
  dropped: number;
  fps: number;
  last_frame_age: number | null;
  since: number | null;
};

export type CaptureState = {
  running: boolean;
  /** The whole queue, "|"-joined, when several clips are running back to back. */
  source: string | null;
  /** The clip in that queue the engine is on right now. */
  source_now?: string | null;
  queue?: string[] | null;
  mode: "server" | "browser";
  /** The device the running capture belongs to: "host" or a screen id. */
  device_id?: string | null;
  fps: number;
  error: string | null;
  ingest: IngestStatus;
};

/** Capture hints for a browser publisher — tuned in server/settings.py, not here. */
export type CaptureConfig = {
  target_fps: number;
  max_width: number;
  jpeg_quality: number;
  default_source: string;
};

/** One person, for the whole time they stayed in a session's frame. */
export type TrackingSessionTrack = {
  track_id: number;
  first_seen: number;
  last_seen: number;
  presence_seconds: number;
  dwell_seconds: number;
  frames: number;
  attentive_frames: number;
  attentive: boolean;
  gender: string | null;
  age: number | null;
  age_group: string | null;
  has_pet?: boolean;
  pet_type?: string | null;
  clothing_color?: string | null;
  clothing_style?: string | null;
};

export type TrackingSessionPublic = {
  id: number;
  session_code: string;
  device_id: string;
  screen_id: number | null;
  source: string;
  started_at: number;
  ended_at: number | null;
  started_at_text: string;
  ended_at_text: string | null;
  duration_seconds: number;
  status: "active" | "completed";
  total_footfall: number;
  total_impressions: number;
  attention_rate: number;
  avg_dwell_time: number;
  peak_people: number;
  /** false for rows recorded before the engine kept a per-track ledger: their
   *  demographics were counted per frame, so they are reported as unknown. */
  has_track_detail: boolean;
  unique_tracks: number;
  total_track_frames: number;
  male_count: number;
  female_count: number;
  unknown_gender_count: number;
  age_breakdown: Record<string, number>;
  avg_age: number | null;   // whole years
  avg_presence_seconds: number;
  impressions_per_minute: number;
  notes: string;
  demographics_json: string;
  tracks_json: string;
  /** Only populated by getSession(); the listing leaves it empty. */
  tracks: TrackingSessionTrack[];
};

/** The magic source string that puts the engine in "wait for a screen" mode. */
export const BROWSER_SOURCE = "browser";

export type Thresholds = {
  min_attention_seconds: number;
  min_presence_seconds: number;
  default_image_seconds: number;
};

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const local = localStorage.getItem("admin_token");
  if (local) return local;
  const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  if (match) {
    const cookieVal = decodeURIComponent(match[1]);
    try {
      localStorage.setItem("admin_token", cookieVal);
    } catch {
      // ignore
    }
    return cookieVal;
  }
  return null;
}

export function getStoredUser(): UserPublic | null {
  if (typeof window === "undefined") return null;
  try {
    const u = localStorage.getItem("admin_user");
    if (u) return JSON.parse(u);
  } catch {
    // ignore
  }
  return null;
}

export function setStoredUser(user: UserPublic): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("admin_user", JSON.stringify(user));
  } catch {
    // ignore
  }
  // useStoredUser readers in this tab only learn of the change through this.
  window.dispatchEvent(new Event("auth-change"));
}

export function setAuthSession(token: string, user: UserPublic): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("admin_token", token);
    localStorage.setItem("admin_user", JSON.stringify(user));
  } catch {
    // ignore
  }
  // Store cookie valid for 7 days
  document.cookie = `admin_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
  window.dispatchEvent(new Event("auth-change"));
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
  } catch {
    // ignore
  }
  document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  window.dispatchEvent(new Event("auth-change"));
}

/**
 * Pages a paired screen runs unattended. They never hold an admin session, so a
 * 401 there must not navigate a shop-window TV to a login form.
 */
const KIOSK_PATHS = ["/homescreen", "/player", "/login"];

/** Send the operator to sign in, and back here afterwards. */
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (KIOSK_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;
  window.location.replace(`/login?next=${encodeURIComponent(pathname + search)}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const requestHeaders =
    init?.body instanceof FormData
      ? { ...authHeaders, ...(init?.headers ?? {}) }
      : { "Content-Type": "application/json", ...authHeaders, ...(init?.headers ?? {}) };

  let res: Response | null = null;
  let lastErr: unknown = null;

  // Build candidate endpoints (primary, 127.0.0.1 IPv4 fallback, and same-origin rewrite fallback)
  const candidateUrls: string[] = [`${API_BASE}${path}`];
  if (API_BASE.includes("localhost")) {
    candidateUrls.push(`${API_BASE.replace("localhost", "127.0.0.1")}${path}`);
  }
  if (API_BASE && typeof window !== "undefined") {
    candidateUrls.push(path); // Next.js rewrite fallback
  }

  for (const targetUrl of candidateUrls) {
    try {
      res = await fetch(targetUrl, {
        ...init,
        headers: requestHeaders,
        cache: "no-store",
      });
      if (res) break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!res) {
    const where =
      API_BASE || (typeof window !== "undefined" ? window.location.origin : "same-origin");
    throw new Error(
      `Không kết nối được API tại ${where} — kiểm tra server đã chạy chưa ` +
        `(./run_web.sh). Chi tiết: ${(lastErr as Error)?.message || "Failed to fetch"}`,
    );
  }
  if (res.status === 401 && path !== "/api/auth/login") {
    // The session is gone (expired, logged out elsewhere, password changed,
    // account locked). Drop it so every auth-aware component falls back to
    // its signed-out state instead of retrying with a dead token.
    clearAuthSession();
    redirectToLogin();
  }
  if (!res.ok) {
    // FastAPI puts the human-readable reason in `detail`; surfacing it beats a
    // bare "500" when the real problem is "camera 0 is already in use".
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  health: () => request<Record<string, unknown>>("/api/health"),

  // Auth
  login: async (credentials: { username: string; password: string }) => {
    const res = await request<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setAuthSession(res.access_token, res.user);
    return res;
  },
  me: () => request<UserPublic>("/api/auth/me"),
  /** Returns a fresh session: the password change signs out every other one. */
  changePassword: async (data: { current_password: string; new_password: string }) => {
    const res = await request<TokenResponse>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setAuthSession(res.access_token, res.user);
    return res;
  },

  // Accounts (admin only)
  listUsers: () => request<UserPublic[]>("/api/users"),
  createUser: (data: UserCreate) =>
    request<UserPublic>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: number, data: UserUpdate) =>
    request<UserPublic>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: number) =>
    request<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" }),
  logout: async () => {
    try {
      return await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } finally {
      clearAuthSession();
    }
  },

  // Screens
  registerScreenCode: () =>
    request<ScreenRegisterResponse>("/api/screens/register-code", { method: "POST" }),
  checkScreenStatus: (code: string) =>
    request<ScreenStatusResponse>(`/api/screens/check-status?code=${encodeURIComponent(code)}`),
  verifyScreenToken: (token: string) =>
    request<{
      valid: boolean;
      id?: number;
      name?: string;
      location?: string;
      playlist_id?: number | null;
      playlist_name?: string | null;
      /**
       * True when the playlist on air is the one assigned to this screen. One
       * playlist airs system-wide; a screen whose playlist is not it must idle,
       * or it would show another account's adverts.
       */
      on_air?: boolean;
      user_id?: number | null;
      account_name?: string | null;
      account_username?: string | null;
    }>(`/api/screens/verify-token?token=${encodeURIComponent(token)}`),
  listScreens: () => request<ScreenPublic[]>("/api/screens"),
  pairScreen: (data: { pairing_code: string; name: string; location?: string }) =>
    request<ScreenPublic>("/api/screens/pair", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteScreen: (id: number) =>
    request<{ ok: boolean }>(`/api/screens/${id}`, { method: "DELETE" }),

  listAds: () => request<Creative[]>("/api/ads"),
  uploadAd: (
    file: File,
    meta?: {
      name?: string;
      target_age_group?: string;
      target_gender?: string;
      target_crowd?: string;
      target_weather?: string;
      target_pet?: string;
      target_clothing?: string;
      target_style?: string;
      category?: string;
      description?: string;
      add_to_playlist?: boolean;
    },
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (meta?.name) form.append("name", meta.name);
    if (meta?.target_age_group) form.append("target_age_group", meta.target_age_group);
    if (meta?.target_gender) form.append("target_gender", meta.target_gender);
    if (meta?.target_crowd) form.append("target_crowd", meta.target_crowd);
    if (meta?.target_weather) form.append("target_weather", meta.target_weather);
    if (meta?.target_pet) form.append("target_pet", meta.target_pet);
    if (meta?.target_clothing) form.append("target_clothing", meta.target_clothing);
    if (meta?.target_style) form.append("target_style", meta.target_style);
    if (meta?.category) form.append("category", meta.category);
    if (meta?.description) form.append("description", meta.description);
    if (meta?.add_to_playlist !== undefined) {
      form.append("add_to_playlist", String(meta.add_to_playlist));
    }
    return request<Creative>("/api/ads", { method: "POST", body: form });
  },
  updateAd: (
    id: number,
    patch: Partial<
      Pick<
        Creative,
        | "name"
        | "duration"
        | "enabled"
        | "target_age_group"
        | "target_gender"
        | "target_crowd"
        | "target_weather"
        | "target_pet"
        | "target_clothing"
        | "target_style"
        | "category"
        | "description"
      >
    >,
  ) => request<Creative>(`/api/ads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addToPlaylist: (id: number) =>
    request<Creative>(`/api/ads/${id}/add-to-playlist`, { method: "POST" }),
  removeFromPlaylist: (id: number) =>
    request<Creative>(`/api/ads/${id}/remove-from-playlist`, { method: "POST" }),
  duplicateAd: (id: number) =>
    request<Creative>(`/api/ads/${id}/duplicate`, { method: "POST" }),
  suggestTarget: (title: string) =>
    request<TargetSuggestion>("/api/ads/suggest-target", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  /** Reads the advert itself. Slow by nature — loads models, may call a remote
   *  vision model — so callers should show progress rather than block silently. */
  analyzeAd: (id: number) =>
    request<CreativeProfileResult>(`/api/ads/${id}/analyze`, { method: "POST" }),
  getSmartTargeting: () => request<{ enabled: boolean }>("/api/ads/smart-targeting"),
  setSmartTargeting: (enabled: boolean) =>
    request<{ enabled: boolean }>("/api/ads/smart-targeting", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  getTargetingSettings: () => request<TargetingSettings>("/api/ads/targeting-settings"),
  setTargetingSettings: (settings: Partial<TargetingSettings>) =>
    request<TargetingSettings>("/api/ads/targeting-settings", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  reorderAds: (creative_ids: number[]) =>
    request<Creative[]>("/api/ads/order", { method: "PUT", body: JSON.stringify({ creative_ids }) }),
  deleteAd: (id: number) => request<void>(`/api/ads/${id}`, { method: "DELETE" }),
  addUrlCreative: (data: { name: string; url: string; duration?: number; category?: string; description?: string }) =>
    request<Creative>("/api/ads/url", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Playlists
  listPlaylists: () => request<PlaylistPublic[]>("/api/playlists"),
  createPlaylist: (data: {
    name: string;
    description?: string;
    is_active?: boolean;
    kind?: string;
    aspect_ratio?: string;
    sync_playback?: boolean;
    fit_screen?: boolean;
  }) =>
    request<PlaylistPublic>("/api/playlists", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPlaylist: (id: number) => request<PlaylistPublic>(`/api/playlists/${id}`),
  updatePlaylist: (
    id: number,
    patch: {
      name?: string;
      description?: string;
      is_active?: boolean;
      kind?: string;
      aspect_ratio?: string;
      sync_playback?: boolean;
      fit_screen?: boolean;
      publish_status?: string;
    }
  ) =>
    request<PlaylistPublic>(`/api/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deletePlaylist: (id: number) =>
    request<void>(`/api/playlists/${id}`, { method: "DELETE" }),
  activatePlaylist: (id: number, screenIds?: number[]) =>
    request<PlaylistPublic>(`/api/playlists/${id}/activate`, {
      method: "POST",
      body: JSON.stringify({ screen_ids: screenIds || [] }),
    }),
  deactivatePlaylist: (id: number) =>
    request<PlaylistPublic>(`/api/playlists/${id}/deactivate`, { method: "POST" }),
  addPlaylistItem: (playlistId: number, creativeId: number, duration?: number) =>
    request<PlaylistPublic>(`/api/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ creative_id: creativeId, duration }),
    }),
  /** Save the editor's whole ordered list in one transaction. */
  replacePlaylistItems: (playlistId: number, items: { creative_id: number; duration?: number }[]) =>
    request<PlaylistPublic>(`/api/playlists/${playlistId}/items`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),
  removePlaylistItem: (playlistId: number, itemId: number) =>
    request<PlaylistPublic>(`/api/playlists/${playlistId}/items/${itemId}`, { method: "DELETE" }),
  reorderPlaylistItems: (playlistId: number, itemIds: number[]) =>
    request<PlaylistPublic>(`/api/playlists/${playlistId}/items/order`, {
      method: "PUT",
      body: JSON.stringify({ item_ids: itemIds }),
    }),
  updatePlaylistItem: (playlistId: number, itemId: number, duration: number) =>
    request<PlaylistPublic>(`/api/playlists/${playlistId}/items/${itemId}?duration=${duration}`, {
      method: "PATCH",
    }),
  uploadToPlaylist: (
    playlistId: number,
    file: File,
    meta?: {
      name?: string;
      target_age_group?: string;
      target_gender?: string;
      target_crowd?: string;
      target_weather?: string;
      category?: string;
      description?: string;
      duration?: number;
    }
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (meta?.name) form.append("name", meta.name);
    if (meta?.target_age_group) form.append("target_age_group", meta.target_age_group);
    if (meta?.target_gender) form.append("target_gender", meta.target_gender);
    if (meta?.target_crowd) form.append("target_crowd", meta.target_crowd);
    if (meta?.target_weather) form.append("target_weather", meta.target_weather);
    if (meta?.category) form.append("category", meta.category);
    if (meta?.description) form.append("description", meta.description);
    if (meta?.duration !== undefined) form.append("duration", String(meta.duration));

    return request<PlaylistPublic>(`/api/playlists/${playlistId}/upload`, {
      method: "POST",
      body: form,
    });
  },

  nowPlaying: () => request<NowPlaying>("/api/player/now-playing"),
  playerStart: () => request<NowPlaying>("/api/player/start", { method: "POST" }),
  playerPlay: (id: number) => request<NowPlaying>(`/api/player/play/${id}`, { method: "POST" }),
  playerStop: () => request<NowPlaying>("/api/player/stop", { method: "POST" }),
  playerSkip: () => request<NowPlaying>("/api/player/skip", { method: "POST" }),

  captureState: () => request<CaptureState>("/api/capture/state"),
  captureConfig: () => request<CaptureConfig>("/api/capture/config"),
  /** `sources` queues several clips back to back and takes precedence over
   *  `source`; the engine resets the tracker at every clip boundary. */
  captureStart: (
    source?: string,
    deviceId?: string | number,
    screenId?: number,
    sources?: string[],
  ) =>
    request<CaptureState>("/api/capture/start", {
      method: "POST",
      body: JSON.stringify({
        source: source || null,
        sources: sources && sources.length > 0 ? sources : null,
        device_id: deviceId !== undefined && deviceId !== null ? String(deviceId) : null,
        screen_id: screenId || null,
      }),
    }),
  captureStop: () => request<CaptureState>("/api/capture/stop", { method: "POST" }),
  // `group` is "" for the presets and the loose clips in data/, or a folder
  // heading for a named set such as data/age_kids.
  captureSources: () => request<{ value: string; label: string; type: string; group?: string; description?: string }[]>("/api/capture/sources"),
  uploadTestVideo: async (file: File): Promise<{ source: string; filename: string; message: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/capture/upload-test-video`, {
      method: "POST",
      headers,
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Upload test video failed");
    }
    return res.json();
  },
  live: () => request<LiveStats>("/api/analytics/live"),
  summary: (windowHours?: number) =>
    request<SummaryReport>(
      `/api/analytics/summary${windowHours ? `?window_hours=${windowHours}` : ""}`,
    ),
  timeline: (limit = 40) => request<AiringRow[]>(`/api/analytics/timeline?limit=${limit}`),
  thresholds: () => request<Thresholds>("/api/analytics/settings"),
  breakdown: (windowHours?: number, deviceId?: string) => {
    const q = new URLSearchParams({ tz_offset: String(new Date().getTimezoneOffset()) });
    if (windowHours) q.set("window_hours", String(windowHours));
    if (deviceId !== undefined) q.set("device_id", deviceId);
    return request<Breakdown>(`/api/analytics/breakdown?${q}`);
  },
  detection: (days: number, deviceId?: string) =>
    request<Detection>(
      `/api/analytics/detection?days=${days}&tz_offset=${new Date().getTimezoneOffset()}${
        deviceId !== undefined ? `&device_id=${encodeURIComponent(deviceId)}` : ""
      }`,
    ),
  funnel: (windowHours?: number) =>
    request<Funnel>(`/api/analytics/funnel${windowHours ? `?window_hours=${windowHours}` : ""}`),
  hourly: (windowHours?: number) =>
    request<HourlyAudience>(
      `/api/analytics/hourly?tz_offset=${new Date().getTimezoneOffset()}${windowHours ? `&window_hours=${windowHours}` : ""}`,
    ),
  overview: (days: number, deviceId?: string | number) =>
    request<Overview>(
      `/api/analytics/overview?days=${days}&tz_offset=${new Date().getTimezoneOffset()}${
        deviceId !== undefined ? `&device_id=${encodeURIComponent(String(deviceId))}` : ""
      }`,
    ),
  /** Everyone a device saw on one calendar day, across sessions, oldest first. */
  getDayLog: (deviceId: string | number, date: string, endDate?: string) =>
    request<DayLog>(
      `/api/sessions/day?device_id=${encodeURIComponent(String(deviceId))}&date=${date}${endDate && endDate !== date ? `&end_date=${endDate}` : ""}&tz_offset=${new Date(`${date}T00:00:00`).getTimezoneOffset()}`,
    ),
  listSessions: (deviceId?: string | number) =>
    request<TrackingSessionPublic[]>(
      `/api/sessions${deviceId !== undefined && deviceId !== null ? `?device_id=${encodeURIComponent(String(deviceId))}` : ""}`
    ),
  getSession: (id: number) => request<TrackingSessionPublic>(`/api/sessions/${id}`),
  deleteSession: (id: number) =>
    request<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
};
