/**
 * Typed client for the FastAPI service.
 *
 * Every type here mirrors a Pydantic model in `server/schemas.py`. When you change
 * one, change the other — there is no codegen step, and a silently drifting shape
 * shows up as an empty dashboard rather than a build error.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE !== undefined
    ? process.env.NEXT_PUBLIC_API_BASE
    : typeof window !== "undefined"
      ? ""
      : "http://127.0.0.1:8000";

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
  category: string;
  description: string;
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
  assigned_screen_ids?: number[];
  assigned_screen_names?: string[];
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
  viewer_approx_age: number | null;   // whole years
  crowd_context?: string | null;
  people_count?: number;
  scene_weather?: string | null;
  scene_objects?: string[];
  reason: string;
};

export type UserPublic = {
  id: number;
  username: string;
  full_name: string;
  role: string;
};

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
  user_id?: number | null;
  account_name?: string | null;
  account_username?: string | null;
};

export type NowPlaying = {
  airing_id: number | null;
  creative: Creative | null;
  started_at: number | null;
  elapsed: number;
  remaining: number;
  playing: boolean;
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
  source: string | null;
  mode: "server" | "browser";
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? { ...authHeaders, ...(init?.headers ?? {}) }
        : { "Content-Type": "application/json", ...authHeaders, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
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
  captureStart: (source?: string, deviceId?: string | number, screenId?: number) =>
    request<CaptureState>("/api/capture/start", {
      method: "POST",
      body: JSON.stringify({
        source: source || null,
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
  listSessions: (deviceId?: string | number) =>
    request<TrackingSessionPublic[]>(
      `/api/sessions${deviceId !== undefined && deviceId !== null ? `?device_id=${encodeURIComponent(String(deviceId))}` : ""}`
    ),
  getSession: (id: number) => request<TrackingSessionPublic>(`/api/sessions/${id}`),
  deleteSession: (id: number) =>
    request<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
};
