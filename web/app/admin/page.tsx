"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  BROWSER_SOURCE,
  CaptureConfig,
  CaptureState,
  ScreenPublic,
  Thresholds,
  TrackingSessionPublic,
  UserPublic,
  api,
  clearAuthSession,
  getAuthToken,
  getStoredUser,
} from "@/lib/api";
import { AGE_OPTIONS, ANY } from "@/lib/taxonomy";
import { useCameraIngest } from "@/lib/useCameraIngest";
import { useLive } from "@/lib/useLive";
import { Stat } from "@/components/Stat";
import { IS_CLERK_ENABLED, useSafeUser } from "@/components/ClerkWrapper";
import { ClerkSignInCard } from "@/components/ClerkSignInCard";
import { ClerkAdminGuard } from "@/components/ClerkAdminGuard";

export default function AdminPage() {
  const { stats, connected } = useLive();
  const { isSignedIn: clerkSignedIn, user: clerkUser } = useSafeUser();
  const DEFAULT_ADMIN: UserPublic = {
    id: 1,
    username: "admin",
    full_name: "Quản trị viên",
    role: "admin",
  };
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(DEFAULT_ADMIN);
  const [authChecked, setAuthChecked] = useState(true);

  // Admin login form state if unauthenticated
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("admin123");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // System states
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [config, setConfig] = useState<CaptureConfig | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [mode, setMode] = useState<"server" | "browser">("server");
  const [source, setSource] = useState("0");
  const [sourcesList, setSourcesList] = useState<{ value: string; label: string; type: string; group?: string; description?: string }[]>([]);
  // Which data/ subfolder groups are expanded. A named set can hold dozens of
  // clips (data/age_kids has 35), and rendering them all flat buried the two
  // webcam presets everyone actually starts from.
  const [openSourceGroups, setOpenSourceGroups] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  // Screen management state
  const [screens, setScreens] = useState<ScreenPublic[]>([]);
  const [pairingCode, setPairingCode] = useState("");
  const [screenName, setScreenName] = useState("");
  const [screenLocation, setScreenLocation] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairSuccess, setPairSuccess] = useState<string | null>(null);

  // Smart targeting state
  const [smartTargeting, setSmartTargeting] = useState<boolean>(false);

  // Selected device for tracking detail view
  const [selectedScreenId, setSelectedScreenId] = useState<number | string | null>(null);

  // Device list filters & selection
  const [searchDevice, setSearchDevice] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<(number | string)[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPairingModal, setShowPairingModal] = useState(false);

  // Tracking Sessions state for device
  const [sessions, setSessions] = useState<TrackingSessionPublic[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionDetailModal, setSessionDetailModal] = useState<TrackingSessionPublic | null>(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);

  // Auto-fill pairing code from URL query param (e.g. /admin?code=ABC-XYZ or ?device=host)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        setPairingCode(code.toUpperCase());
        setScreenName((prev) => prev || "Màn hình Homescreen");
        setTimeout(() => {
          const el = document.getElementById("screens-section");
          el?.scrollIntoView({ behavior: "smooth" });
        }, 500);
      }
      const dev = params.get("device");
      if (dev) {
        if (dev === "host") setSelectedScreenId("host");
        else if (!isNaN(Number(dev))) setSelectedScreenId(Number(dev));
      }
    }
  }, []);

  // Test cam
  const [testCam, setTestCam] = useState(false);
  const { videoRef, state: camera } = useCameraIngest(testCam);

  // 1. Verify Auth
  const checkAuth = useCallback(async () => {
    const stored = getStoredUser();
    if (stored) setCurrentUser(stored);

    const token = getAuthToken();
    if (!token) {
      setCurrentUser(null);
      setAuthChecked(true);
      return;
    }

    try {
      const user = await api.me();
      setCurrentUser((prev) => {
        if (
          prev &&
          prev.id === user.id &&
          prev.username === user.username &&
          prev.role === user.role
        ) {
          return prev;
        }
        return user;
      });
    } catch {
      clearAuthSession();
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkAuth();
    const handleAuthChange = () => {
      const stored = getStoredUser();
      setCurrentUser(stored);
    };
    window.addEventListener("auth-change", handleAuthChange);
    return () => window.removeEventListener("auth-change", handleAuthChange);
  }, [checkAuth]);

  // 2. Fetch screens list
  const loadScreens = useCallback(async () => {
    try {
      const list = await api.listScreens();
      setScreens(list);
    } catch {
      // ignore
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const list = await api.captureSources();
      setSourcesList(list);
    } catch (err) {
      // Not fatal — the picker renders its own "thử lại" state — but swallowing
      // this without a trace left no way to tell a network failure from a
      // genuinely empty data/ directory.
      console.error("Không nạp được danh sách nguồn phát:", err);
    }
  }, []);

  const loadDeviceSessions = useCallback(async (devId: string | number | null) => {
    if (devId === null) return;
    setSessionsLoading(true);
    try {
      const list = await api.listSessions(devId);
      setSessions(list);
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedScreenId !== null) {
      loadDeviceSessions(selectedScreenId);
    }
  }, [selectedScreenId, loadDeviceSessions]);

  const refresh = useCallback(async () => {
    try {
      const cap = await api.captureState();
      setCapture(cap);
      if (cap.running) setMode(cap.mode);
      await Promise.all([loadScreens(), loadSources()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [loadScreens, loadSources]);

  // Sync Clerk user when signed in
  useEffect(() => {
    if (clerkSignedIn && clerkUser && !currentUser) {
      setCurrentUser({
        id: 1,
        username: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.username || clerkUser.id,
        full_name: clerkUser.fullName || clerkUser.username || "Admin (Clerk)",
        role: "admin",
      });
    }
  }, [clerkSignedIn, clerkUser, currentUser]);

  const isAuthenticated = Boolean(currentUser || clerkSignedIn || getAuthToken());

  useEffect(() => {
    if (!isAuthenticated) return;

    let ignore = false;
    const fetchState = () => {
      api
        .captureState()
        .then((cap) => {
          if (!ignore) {
            setCapture(cap);
            if (cap.running) setMode(cap.mode);
          }
        })
        .catch((err) => {
          if (!ignore) setError((err as Error).message);
        });
      loadScreens();
    };

    fetchState();
    // Once on mount, not inside fetchState: the source list only changes when
    // someone uploads a clip, so re-reading it every 3s alongside the capture
    // poll would be waste. Leaving it out of the mount path entirely was the
    // bug — sourcesList stayed empty until the operator happened to trigger an
    // action, and until then the picker showed its hardcoded fallback as if
    // those three entries were everything available.
    loadSources();
    api.captureConfig().then((cfg) => { if (!ignore) setConfig(cfg); }).catch(() => undefined);
    api.thresholds().then((th) => { if (!ignore) setThresholds(th); }).catch(() => undefined);
    api.health().then((h) => { if (!ignore) setHealth(h); }).catch(() => undefined);
    api.getSmartTargeting().then((st) => { if (!ignore) setSmartTargeting(st.enabled); }).catch(() => undefined);

    const id = setInterval(fetchState, 3000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, [isAuthenticated, loadScreens, loadSources]);

  const isSmartTargeting = stats?.smart_targeting !== undefined ? stats.smart_targeting : smartTargeting;

  const handleToggleSmartTargeting = async () => {
    try {
      const nextVal = !isSmartTargeting;
      setSmartTargeting(nextVal);
      await api.setSmartTargeting(nextVal);
    } catch (e) {
      console.error("Lỗi đổi chế độ phát thông minh:", e);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Quick Login Handler
  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await api.login({ username: loginUsername.trim(), password: loginPassword });
      setCurrentUser(res.user);
    } catch (err) {
      setLoginError((err as Error).message || "Đăng nhập thất bại.");
    } finally {
      setLoginBusy(false);
    }
  };

  // Screen Pairing Handler
  const handlePairScreen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode.trim() || !screenName.trim()) {
      setPairError("Vui lòng nhập đầy đủ mã và tên màn hình.");
      return;
    }

    setPairBusy(true);
    setPairError(null);
    setPairSuccess(null);

    try {
      await api.pairScreen({
        pairing_code: pairingCode.trim().toUpperCase(),
        name: screenName.trim(),
        location: screenLocation.trim() || undefined,
      });
      setPairSuccess(`Đã kích hoạt màn hình "${screenName}" thành công!`);
      setPairingCode("");
      setScreenName("");
      setScreenLocation("");
      await loadScreens();
    } catch (err) {
      setPairError((err as Error).message || "Lỗi ghép đôi màn hình.");
    } finally {
      setPairBusy(false);
    }
  };

  const handleDeleteScreen = async (id: number, name: string | null) => {
    if (!confirm(`Bạn có chắc muốn thu hồi quyền của màn hình "${name || id}"?`)) return;
    try {
      await api.deleteScreen(id);
      await loadScreens();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleUploadTestVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.uploadTestVideo(file);
      setSource(res.source);
      setMode("server");
      await loadSources();
      alert(`Đã tải lên video: ${res.filename}. Bạn có thể bấm "▶ Bật phân tích" để chạy AI test ngay!`);
    } catch (err) {
      alert((err as Error).message || "Lỗi tải lên video test");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      clearAuthSession();
      setCurrentUser(null);
    }
  };

  // ---------- AUTHENTICATED ADMIN PORTAL (Login disabled - Full access) ----------
  const running = capture?.running ?? false;
  const ingest = capture?.ingest;
  const playing = stats?.now_playing?.playing ?? false;
  const nowPlaying = stats?.now_playing ?? null;
  const browserMode = running && capture?.mode === "browser";

  const startCapture = () =>
    act(async () => {
      const devId = selectedScreenId !== null ? selectedScreenId : "host";
      const scrId = typeof selectedScreenId === "number" ? selectedScreenId : undefined;
      const res = await api.captureStart(mode === "browser" ? BROWSER_SOURCE : source || "0", devId, scrId);
      setTimeout(() => loadDeviceSessions(selectedScreenId), 1200);
      return res;
    });

  const stopCapture = () =>
    act(async () => {
      const res = await api.captureStop();
      setTimeout(() => loadDeviceSessions(selectedScreenId), 800);
      return res;
    });

  /** Quote every cell: a source path or a note may carry a comma or a newline,
   *  and one unquoted cell shifts every column after it by one. */
  const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const downloadCSV = (filename: string, headers: string[], rows: unknown[][]) => {
    const csvContent =
      "\uFEFF" +
      [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /** A session that predates the per-track ledger has no per-person breakdown;
   *  show a dash rather than a frame-scaled number that reads like people. */
  const demoCell = (s: TrackingSessionPublic, value: number | null) =>
    s.has_track_detail && value !== null ? value : "—";

  const exportSessionsCSV = () => {
    if (sessions.length === 0) return;
    const headers = [
      "Mã phiên",
      "Thiết bị",
      "Nguồn phát",
      "Bắt đầu",
      "Kết thúc",
      "Thời lượng (giây)",
      "Trạng thái",
      "Số người (track_id duy nhất)",
      "Tổng lượt đo (frames)",
      "Nam",
      "Nữ",
      "Không xác định giới tính",
      "Tuổi trung bình",
      "Nhóm <6",
      "Nhóm 6-13",
      "Nhóm 13-18",
      "Nhóm 18-35",
      "Nhóm 35-55",
      "Nhóm >55",
      "Nhóm <18 (trước khi tách)",
      "Không xác định tuổi",
      "Lượt tiếp cận (Footfall)",
      "Lượt xem thực (Impressions)",
      "Tỷ lệ chú ý (%)",
      "Dwell time TB (s)",
      "Thời gian hiện diện TB (s)",
      "Lượt xem / phút",
      "Cao điểm (người)",
      "Ghi chú",
    ];
    const rows = sessions.map((s) => [
      s.session_code,
      s.device_id,
      s.source,
      s.started_at_text,
      s.ended_at_text ?? "Đang chạy",
      s.duration_seconds,
      s.status === "active" ? "Đang thu thập" : "Đã hoàn thành",
      s.unique_tracks,
      demoCell(s, s.total_track_frames || null),
      demoCell(s, s.male_count),
      demoCell(s, s.female_count),
      demoCell(s, s.unknown_gender_count),
      demoCell(s, s.avg_age),
      demoCell(s, s.age_breakdown?.["<6"] ?? 0),
      demoCell(s, s.age_breakdown?.["6-13"] ?? 0),
      demoCell(s, s.age_breakdown?.["13-18"] ?? 0),
      demoCell(s, s.age_breakdown?.["18-35"] ?? 0),
      demoCell(s, s.age_breakdown?.["35-55"] ?? 0),
      demoCell(s, s.age_breakdown?.[">55"] ?? 0),
      // Sessions recorded before `<18` was split into the three brackets above.
      // Kept as its own column rather than folded into one of them: the stored
      // row is a bracket, not an age, so there is nothing to re-bucket from.
      demoCell(s, s.age_breakdown?.["<18"] ?? 0),
      demoCell(s, s.age_breakdown?.unknown ?? 0),
      s.total_footfall,
      s.total_impressions,
      s.attention_rate,
      s.avg_dwell_time,
      s.avg_presence_seconds,
      s.impressions_per_minute,
      s.peak_people,
      s.notes || "",
    ]);
    downloadCSV(`sessions_${selectedScreenId || "device"}_${Date.now()}.csv`, headers, rows);
  };

  /** Per-person export for one session: one row per track_id, with how many
   *  times that track was measured. This is the raw ledger, not a roll-up. */
  const exportSessionTracksCSV = (s: TrackingSessionPublic) => {
    if (!s.tracks || s.tracks.length === 0) return;
    const headers = [
      "Mã phiên",
      "track_id",
      "Số lần đo (frames)",
      "Số lần chú ý",
      "Lần đầu thấy",
      "Lần cuối thấy",
      "Hiện diện (s)",
      "Dwell (s)",
      "Đã chú ý",
      "Giới tính",
      "Tuổi",
      "Nhóm tuổi",
    ];
    const fmt = (ts: number) => (ts ? new Date(ts * 1000).toLocaleString("vi-VN") : "");
    const rows = s.tracks.map((t) => [
      s.session_code,
      t.track_id,
      t.frames,
      t.attentive_frames,
      fmt(t.first_seen),
      fmt(t.last_seen),
      t.presence_seconds,
      t.dwell_seconds,
      t.attentive ? "Có" : "Không",
      t.gender ?? "Không xác định",
      t.age ?? "",
      t.age_group ?? "Không xác định",
    ]);
    downloadCSV(`session_${s.session_code}_tracks.csv`, headers, rows);
  };

  /** The listing omits the per-track ledger (50 sessions x hundreds of people
   *  is a payload the table never reads), so the modal fetches the full row. */
  const openSessionDetail = async (s: TrackingSessionPublic) => {
    setSessionDetailModal(s);
    setSessionDetailLoading(true);
    try {
      setSessionDetailModal(await api.getSession(s.id));
    } catch (err) {
      console.error("Failed to load session detail", err);
    } finally {
      setSessionDetailLoading(false);
    }
  };

  const handleDeleteSession = async (id: number) => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá phiên thu thập này không?")) return;
    try {
      await api.deleteSession(id);
      await loadDeviceSessions(selectedScreenId);
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  // Helper to format relative time for last online
  const formatLastSeen = (ts: number | null | undefined, isOnline: boolean) => {
    if (isOnline) return "Đang trực tuyến (Vừa xong)";
    if (!ts) return "Chưa từng online";
    const now = Date.now() / 1000;
    const diffSec = Math.max(0, Math.floor(now - ts));
    if (diffSec < 60) return "Vừa xong";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} ngày trước`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} tháng trước`;
  };

  const handleCopyId = (e: React.MouseEvent, idStr: string) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(idStr);
      setCopiedId(idStr);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Map real screens strictly from database (API: /api/screens)
  const realScreenItems = screens.map((s) => {
    const isOnline = Boolean(s.last_seen && (Date.now() / 1000 - s.last_seen < 180));
    return {
      id: s.id,
      name: s.name || `Màn hình #${s.id}`,
      subName: s.location
        ? `Vị trí: ${s.location}`
        : s.playlist_name
          ? `Playlist: ${s.playlist_name}`
          : "Thiết bị TV",
      isOnline,
      os: s.location?.toLowerCase().includes("web") ? "Web Player" : "Android / Smart TV",
      resolution: s.location?.toLowerCase().includes("vertical") || s.location?.toLowerCase().includes("dọc") ? "1080×1920" : "1920×1080",
      group: s.location || "Chưa gán nhóm",
      deviceId: s.pairing_code || `SCR-${s.id.toString().padStart(4, "0")}`,
      lastSeenText: formatLastSeen(s.last_seen, isOnline),
      rawScreen: s,
    };
  });

  // Host Central Camera device (Central OpenCV Hub)
  const hostDevice = {
    id: "host" as const,
    name: "Camera AI Hub (Host OpenCV)",
    subName: source ? `Nguồn: ${source}` : "Webcam máy tính / Máy chủ",
    isOnline: Boolean(running),
    os: "macOS / Linux",
    resolution: config?.max_width ? `${config.max_width}×${Math.round((config.max_width * 9) / 16)}` : "1920×1080",
    group: "Trung tâm điều hành",
    deviceId: "cv-host-central",
    lastSeenText: running ? "Đang trực tuyến (Vừa xong)" : "Tạm dừng",
  };

  // ONLY real devices: Central Host Hub + registered screens from DB
  const allDevices = [
    hostDevice,
    ...realScreenItems,
  ];

  // Filtered devices list
  const filteredDevices = allDevices.filter((d) => {
    const q = searchDevice.trim().toLowerCase();
    const matchesSearch =
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.deviceId.toLowerCase().includes(q) ||
      d.group.toLowerCase().includes(q) ||
      d.os.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "online" && d.isOnline) ||
      (statusFilter === "offline" && !d.isOnline);

    return matchesSearch && matchesStatus;
  });

  const toggleSelectAll = () => {
    if (selectedDeviceIds.length === filteredDevices.length) {
      setSelectedDeviceIds([]);
    } else {
      setSelectedDeviceIds(filteredDevices.map((d) => d.id));
    }
  };

  const toggleSelectDevice = (e: React.MouseEvent, id: number | string) => {
    e.stopPropagation();
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const adminContent = (
    <main className="w-full space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Cổng Quản Trị Hệ Thống (/admin)</h1>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              Admin: {currentUser?.full_name || currentUser?.username || "Quản trị viên"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Quản lý thiết bị màn hình trình chiếu, cấp quyền phát sóng và điều khiển luồng camera
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 shadow-xs"
          >
            Báo cáo Live
          </Link>
          <Link
            href="/ads"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 shadow-xs"
          >
            Thư viện Quảng cáo
          </Link>
          <a
            href="/screen"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 transition hover:bg-emerald-100 shadow-xs"
          >
            <span>Màn hình TV (/screen)</span>
          </a>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:text-rose-600 hover:bg-rose-50"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {error && (
        <div className="card border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE A: ALL CONNECTED DEVICES VIEW (selectedScreenId === null)           */}
      {/* ========================================================================= */}
      {selectedScreenId === null ? (
        <div className="space-y-6">
          {/* Summary KPIs for devices */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-3.5 bg-white border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng Thiết Bị</span>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{screens.length + 1}</p>
              <span className="text-[11px] text-slate-400">1 Host Hub + {screens.length} TV/Kiosk</span>
            </div>
            <div className="card p-3.5 bg-white border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Màn Hình TV / Kiosk</span>
              <p className="mt-1 text-2xl font-extrabold text-indigo-700">{screens.length}</p>
              <span className="text-[11px] text-slate-400">Đã đăng ký hệ thống</span>
            </div>
            <div className="card p-3.5 bg-white border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Trạng Thái AI Ingest</span>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700">{running ? "Đang chạy" : "Tạm dừng"}</p>
              <span className="text-[11px] text-slate-400">{stats?.fps?.toFixed(1) ?? 0} FPS xử lý</span>
            </div>
            <div className="card p-3.5 bg-white border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Nội Dung Đang Chiếu</span>
              <p className="mt-1 truncate text-base font-bold text-slate-900">{nowPlaying?.creative ? nowPlaying.creative.name : "Chưa phát"}</p>
              <span className="text-[11px] text-slate-400">{playing ? `Còn ${nowPlaying?.remaining?.toFixed(0)}s` : "Sẵn sàng"}</span>
            </div>
          </div>

          {/* Connected Devices Table matching user's layout in modern bright theme */}
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              {/* Top Control Bar */}
              <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white">
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[200px] sm:min-w-[260px] max-w-md">
                    <svg
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchDevice}
                      onChange={(e) => setSearchDevice(e.target.value)}
                      placeholder="Tìm theo tên thiết bị..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                    />
                    {searchDevice && (
                      <button
                        type="button"
                        onClick={() => setSearchDevice("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-0.5"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Status Filter Dropdown */}
                  <div className="relative min-w-[150px]">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "all" | "online" | "offline")}
                      className="w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 py-2 text-xs font-medium text-slate-700 shadow-xs hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition cursor-pointer"
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="online">Đang Online</option>
                      <option value="offline">Đang Offline</option>
                    </select>
                    <svg
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 text-xs text-slate-600">
                  <span className="text-slate-500">
                    Hiển thị: <strong className="font-bold text-slate-900">{filteredDevices.length}</strong> thiết bị
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        loadScreens();
                        loadSources();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-95"
                    >
                      <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      <span>Làm mới</span>
                    </button>

                    <a
                      href="#screens-section"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition active:scale-95"
                    >
                      <span>+ Kích hoạt TV mới</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Multi-selection Banner */}
              {selectedDeviceIds.length > 0 && (
                <div className="bg-indigo-50/90 border-b border-indigo-100 px-4 py-2 flex items-center justify-between text-xs text-indigo-950 font-medium animate-fadeIn">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                      {selectedDeviceIds.length}
                    </span>
                    <span>Đã chọn <strong>{selectedDeviceIds.length}</strong> thiết bị trong danh sách</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceIds([])}
                      className="rounded px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100 font-semibold transition"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 select-none">
                    <tr>
                      <th className="w-10 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={filteredDevices.length > 0 && selectedDeviceIds.length === filteredDevices.length}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-3">
                        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-800">
                          <span>TÊN THIẾT BỊ</span>
                          <span className="text-[10px] text-slate-400">↕</span>
                        </div>
                      </th>
                      <th className="px-4 py-3">
                        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-800">
                          <span>TRẠNG THÁI</span>
                          <span className="text-[10px] text-slate-400">↕</span>
                        </div>
                      </th>
                      <th className="px-4 py-3">HỆ ĐIỀU HÀNH</th>
                      <th className="px-4 py-3">ĐỘ PHÂN GIẢI</th>
                      <th className="px-4 py-3">NHÓM MÀN HÌNH</th>
                      <th className="px-4 py-3">DEVICE ID</th>
                      <th className="px-4 py-3">LẦN CUỐI ONLINE</th>
                      <th className="px-4 py-3 text-right">HÀNH ĐỘNG</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredDevices.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-xs">
                          Không tìm thấy thiết bị nào khớp với tiêu chí tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      filteredDevices.map((d) => {
                        const isSelected = selectedDeviceIds.includes(d.id);
                        return (
                          <tr
                            key={String(d.id)}
                            onClick={() => setSelectedScreenId(d.id)}
                            className={`group transition-colors cursor-pointer ${
                              isSelected ? "bg-indigo-50/40" : "hover:bg-slate-50/80"
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="px-4 py-3.5 text-center" onClick={(e) => toggleSelectDevice(e, d.id)}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>

                            {/* Tên Thiết Bị */}
                            <td className="px-4 py-3.5">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition flex items-center gap-1.5">
                                  {d.name}
                                  {d.id === "host" && (
                                    <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2">
                                      AI Hub
                                    </span>
                                  )}
                                </span>
                                <span className="text-[11px] text-slate-400 font-normal mt-0.5">
                                  {d.subName}
                                </span>
                              </div>
                            </td>

                            {/* Trạng Thái */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {d.isOnline ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200 shadow-2xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Online
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200 shadow-2xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                  Offline
                                </span>
                              )}
                            </td>

                            {/* Hệ Điều Hành */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-700">
                              {d.os}
                            </td>

                            {/* Độ Phân Giải */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-slate-600">
                              {d.resolution}
                            </td>

                            {/* Nhóm Màn Hình */}
                            <td className="px-4 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs text-slate-700 font-medium cursor-pointer transition">
                                <span>{d.group}</span>
                                <span className="text-[10px] text-slate-400">↕</span>
                              </div>
                            </td>

                            {/* Device ID */}
                            <td className="px-4 py-3.5 whitespace-nowrap" onClick={(e) => handleCopyId(e, d.deviceId)}>
                              <div
                                title="Nhấp để sao chép Device ID"
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-700 hover:text-slate-900 cursor-pointer transition active:scale-95"
                              >
                                <span className="font-semibold">{d.deviceId}</span>
                                {copiedId === d.deviceId ? (
                                  <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                  </svg>
                                )}
                              </div>
                            </td>

                            {/* Lần Cuối Online */}
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-medium">
                              {d.lastSeenText}
                            </td>

                            {/* Hành Động */}
                            <td className="px-4 py-3.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setSelectedScreenId(d.id)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-xs transition active:scale-95"
                                >
                                  <span>🎯 Vùng tracking</span>
                                </button>

                                {typeof d.id === "number" && (
                                  <>
                                    <a
                                      href="/screen"
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Mở tab TV (/screen)"
                                      className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 p-1 text-slate-500 hover:text-indigo-600 transition"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteScreen(d.id as number, d.name)}
                                      title="Thu hồi quyền"
                                      className="rounded-lg border border-slate-200 bg-white hover:bg-rose-50 p-1 text-slate-400 hover:text-rose-600 transition"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section: Pairing New Screen Form */}
          <section id="screens-section" className="card space-y-4 p-4 sm:p-5 border-indigo-100 bg-slate-50/60 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Kích Hoạt & Ghép Nối Thiết Bị TV Mới
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Đọc mã Pairing Code 6 ký tự đang hiển thị trên màn hình TV (ví dụ: <code className="font-mono font-bold text-indigo-600">4TT-9YG</code>), điền vào form để kết nối:
                </p>
              </div>
              <a
                href="/screen"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 shadow-xs transition"
              >
                + Mở tab TV (/screen)
              </a>
            </div>

            {pairError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {pairError}
              </div>
            )}

            {pairSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {pairSuccess}
              </div>
            )}

            <form onSubmit={handlePairScreen} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Mã Ghép Đôi (Pairing Code) *
                </label>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  placeholder="VD: 4TT-9YG"
                  maxLength={10}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Tên Màn Hình *
                </label>
                <input
                  type="text"
                  value={screenName}
                  onChange={(e) => setScreenName(e.target.value)}
                  placeholder="VD: TV Sảnh A"
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Vị Trí Lắp Đặt
                </label>
                <input
                  type="text"
                  value={screenLocation}
                  onChange={(e) => setScreenLocation(e.target.value)}
                  placeholder="VD: Tầng 1 - Cửa đón khách"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={pairBusy}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {pairBusy ? "Đang kết nối..." : "Kích hoạt màn hình"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : (
        /* ========================================================================= */
        /* CASE B: INDIVIDUAL DEVICE DETAIL & LIVE TRACKING VIEW                     */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <button
              type="button"
              onClick={() => setSelectedScreenId(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-95"
            >
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Quay lại danh sách thiết bị</span>
            </button>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Đang theo dõi:</span>
                <span className="font-bold text-slate-900 text-sm">
                  {allDevices.find((d) => d.id === selectedScreenId)?.name || "Thiết Bị Camera AI Trung Tâm"}
                </span>
                {allDevices.find((d) => d.id === selectedScreenId)?.isOnline ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Offline
                  </span>
                )}
              </div>

              {typeof selectedScreenId === "number" && (
                <a
                  href="/screen"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  Mở tab TV (/screen) ↗
                </a>
              )}
            </div>
          </div>

          {/* VÙNG TRACKING CAMERA & PIPELINE AI CHO THIẾT BỊ NÀY */}
          <section id="camera-section" className="space-y-4 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-800">
                    AI
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    Vùng Tracking & Nhận Diện Khán Giả Thiết Bị
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Luồng camera thời gian thực, bảng nhận diện khuôn mặt YOLOv8, độ tuổi, giới tính và gợi ý quảng cáo theo khán giả
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => (running ? stopCapture() : startCapture())}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold shadow-xs transition disabled:opacity-50 ${
                    running
                      ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {running ? "⏹ Dừng tracking camera" : "▶ Bắt đầu tracking camera"}
                </button>
                <button
                  onClick={() => setTestCam((v) => !v)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition shadow-xs ${
                    testCam
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {testCam ? "Tắt webcam thử" : "Bật webcam thử (Local)"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Left 2 Cols: Video Stream & Source Controls & Live Tracks Table */}
              <div className="space-y-4 lg:col-span-2">
                {/* Live Camera Viewport */}
                <div className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 bg-slate-50/70">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                      <span className="text-xs font-bold text-slate-900">
                        {running ? "Luồng Camera AI Trực Tiếp" : "Camera đang tạm dừng"}
                      </span>
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                        {mode === "browser" ? "Nguồn Kiosk (/screen)" : `Nguồn: ${source || "0"}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                      <span>{stats?.fps?.toFixed(1) ?? "0.0"} FPS</span>
                      <span>·</span>
                      <span>khung #{stats?.frame_index ?? 0}</span>
                    </div>
                  </div>

                  {/* Viewport content */}
                  <div className="flex aspect-video items-center justify-center bg-slate-950 relative">
                    {running ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${API_BASE}/api/capture/stream.mjpg`}
                        alt="Camera khán giả"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-xs text-slate-400">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-slate-500 border border-slate-800">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="max-w-md text-slate-300">
                          Camera đang tắt. Bấm <strong className="text-white">Bắt đầu tracking camera</strong> ở trên để khởi động mô hình YOLOv8 nhận diện khán giả.
                        </p>
                        <button
                          disabled={busy}
                          onClick={startCapture}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                        >
                          ▶ Bật phân tích camera
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Local test cam preview if enabled */}
                  {testCam && (
                    <div className="border-t border-slate-200 bg-black p-2">
                      <p className="px-2 py-1 text-[11px] text-slate-400">Webcam thử nghiệm cục bộ (Client-side):</p>
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        autoPlay
                        className="aspect-video max-h-48 w-full object-contain mx-auto"
                      />
                    </div>
                  )}
                </div>

                {/* Source selector & mode options */}
                <div className="card p-4 space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Chọn Nguồn Phát Cho Thiết Bị
                  </h3>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <ModeCard
                      active={mode === "browser"}
                      onClick={() => setMode("browser")}
                      title="Trình duyệt / Màn hình Kiosk (/screen)"
                      body="Màn hình TV/Kiosk tự mở webcam và gửi khung hình qua WebSocket."
                    />
                    <ModeCard
                      active={mode === "server"}
                      onClick={() => setMode("server")}
                      title="Máy chủ (OpenCV / Video TTTM)"
                      body="Máy chủ tự đọc webcam cắm trực tiếp hoặc phát lặp video mô phỏng TTTM."
                    />
                  </div>

                  {mode === "server" && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">
                          Video mẫu TTTM kiểm tra AI đếm người:
                        </span>
                        <label className="cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 shadow-xs">
                          + Tải lên video TTTM (.mp4)
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleUploadTestVideo}
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {sourcesList.length > 0 ? (
                          (() => {
                            const ungrouped = sourcesList.filter((s) => !s.group);
                            const groups = sourcesList.reduce<Record<string, typeof sourcesList>>((acc, s) => {
                              if (s.group) (acc[s.group] ||= []).push(s);
                              return acc;
                            }, {});
                            const btn = (s: (typeof sourcesList)[number]) => (
                              <button
                                key={s.value}
                                type="button"
                                title={s.description}
                                onClick={() => {
                                  setSource(s.value);
                                  setMode("server");
                                }}
                                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                                  source === s.value
                                    ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800 shadow-xs"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:bg-slate-50"
                                }`}
                              >
                                {s.label}
                              </button>
                            );
                            return (
                              <>
                                {ungrouped.map(btn)}
                                {Object.entries(groups).map(([name, items]) => {
                                  // Keep a collapsed group open when the running
                                  // source is inside it, so the active choice is
                                  // never hidden behind a toggle.
                                  const hasActive = items.some((s) => s.value === source);
                                  const open = openSourceGroups[name] ?? hasActive;
                                  return (
                                    <div key={name} className="w-full space-y-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setOpenSourceGroups((prev) => ({ ...prev, [name]: !open }))
                                        }
                                        className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-left text-xs font-semibold text-slate-700 transition hover:border-emerald-500 hover:bg-slate-50"
                                      >
                                        <span className="text-slate-400">{open ? "▾" : "▸"}</span>
                                        {name}
                                        <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">
                                          {items.length}
                                        </span>
                                      </button>
                                      {open && <div className="flex flex-wrap gap-1.5 pl-3">{items.map(btn)}</div>}
                                    </div>
                                  );
                                })}
                              </>
                            );
                          })()
                        ) : (
                          // No hardcoded fallback list here. There used to be
                          // three buttons, which rendered whenever the fetch
                          // had not landed and looked exactly like a complete
                          // source list — so a failed load was indistinguishable
                          // from "this machine only has three clips", and every
                          // video added since stayed invisible. An empty list is
                          // now reported as what it is.
                          <div className="flex items-center gap-2 text-slate-500">
                            <span>Chưa nạp được danh sách nguồn phát.</span>
                            <button
                              type="button"
                              onClick={() => loadSources()}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 transition hover:border-emerald-500 hover:bg-slate-50"
                            >
                              Thử lại
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Real-time Live Tracks Table */}
                <div className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 bg-slate-50/70">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Nhật Ký Khuôn Mặt Thời Gian Thực (Live Tracks)
                      </h3>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {stats?.tracks?.length ?? 0} người
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Cập nhật liên tục theo từng khung hình
                    </span>
                  </div>

                  <div className="max-h-60 overflow-x-auto overflow-y-auto">
                    <table className="w-full min-w-[500px] text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Track ID</th>
                          <th className="px-3 py-2 text-left font-medium">Giới tính</th>
                          <th className="px-3 py-2 text-left font-medium">Độ tuổi ước tính</th>
                          <th className="px-3 py-2 text-right font-medium">Góc đầu (Yaw/Pitch)</th>
                          <th className="px-3 py-2 text-right font-medium">Trạng thái</th>
                          <th className="px-3 py-2 text-right font-medium">Dwell Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(stats?.tracks ?? []).map((t) => (
                          <tr key={t.track_id} className="hover:bg-slate-50 transition">
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800">#{t.track_id}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {t.gender === "M" ? "Nam" : t.gender === "F" ? "Nữ" : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {t.age != null ? (
                                <span>
                                  <strong className="text-slate-900">~{Math.round(t.age)}</strong>
                                  <span className="text-xs text-slate-500 ml-1">({t.age_group})</span>
                                </span>
                              ) : (
                                t.age_group ?? "—"
                              )}
                            </td>
                            <td className="tabular px-3 py-2 text-right font-mono text-slate-500">
                              {t.yaw ?? "—"}° / {t.pitch ?? "—"}°
                            </td>
                            <td className="px-3 py-2 text-right">
                              {t.attention ? (
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Đang nhìn
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">Không nhìn</span>
                              )}
                            </td>
                            <td className="tabular px-3 py-2 text-right font-mono text-slate-700">
                              {t.dwell_time.toFixed(1)}s
                            </td>
                          </tr>
                        ))}
                        {!stats?.tracks?.length && (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                              {running ? "Chưa có ai trong khung hình camera" : "Bật camera để bắt đầu theo dõi khuôn mặt"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Column: AI Smart Targeting & Playback Controls */}
              <div className="space-y-4">
                {/* AI Recommendation Widget */}
                <div className="card p-4 space-y-3 border-purple-200 bg-gradient-to-b from-purple-50/30 via-white to-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-xs font-bold text-purple-700">
                        AI
                      </span>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Gợi Ý Quảng Cáo AI
                        </h3>
                        <p className="text-[10px] text-slate-500">Nhân khẩu học thời gian thực</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleSmartTargeting}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                        isSmartTargeting
                          ? "border border-purple-300 bg-purple-50 text-purple-700 font-semibold shadow-xs"
                          : "border border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900"
                      }`}
                      title="Bật tính năng này để màn hình tự động ưu tiên phát quảng cáo phù hợp với khán giả đang nhìn"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSmartTargeting ? "animate-pulse bg-purple-600" : "bg-slate-400"
                        }`}
                      />
                      {isSmartTargeting ? "Phát thích ứng: BẬT" : "Phát thích ứng: TẮT"}
                    </button>
                  </div>

                  {stats?.recommendation ? (
                    <div className="space-y-2.5 text-xs">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-500">
                          <div className="flex flex-wrap items-center gap-1">
                            {stats.recommendation.crowd_context && (
                              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 font-medium text-amber-800 text-[10px]">
                                {stats.recommendation.crowd_context === "single"
                                  ? "1 Người"
                                  : stats.recommendation.crowd_context === "group"
                                  ? `Nhóm ${stats.recommendation.people_count || 2}`
                                  : `Đám đông ${stats.recommendation.people_count || 5}`}
                              </span>
                            )}
                            <span>Khán giả:</span>
                          </div>
                          <span className="font-semibold text-slate-900">
                            {stats.recommendation.viewer_gender === "M"
                              ? "Nam"
                              : stats.recommendation.viewer_gender === "F"
                              ? "Nữ"
                              : "Khán giả"}
                            {stats.recommendation.viewer_approx_age != null &&
                              ` · ~${stats.recommendation.viewer_approx_age} tuổi`}
                          </span>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 truncate">
                            {stats.recommendation.target_creative_name}
                          </span>
                          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 shrink-0">
                            {stats.recommendation.category}
                          </span>
                        </div>

                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>Độ tương thích mục tiêu</span>
                            <span className="font-mono font-bold text-emerald-700">
                              {stats.recommendation.match_score}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full bg-emerald-600 transition-all duration-300"
                              style={{ width: `${stats.recommendation.match_score}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] leading-relaxed text-slate-600">
                        {stats.recommendation.reason}
                      </p>
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-slate-500">
                      <p>Chưa phát hiện khán giả đứng trước camera.</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Hệ thống sẽ tự động phân tích độ tuổi và giới tính để gợi ý quảng cáo phù hợp nhất.
                      </p>
                    </div>
                  )}
                </div>

                {/* Playback Controls on Screen */}
                <div className="card p-4 space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Trạng Thái Chiếu Quảng Cáo
                  </h3>

                  {nowPlaying?.creative ? (
                    <div className="space-y-2">
                      <p className="truncate text-sm font-bold text-slate-900">{nowPlaying.creative.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {nowPlaying.creative.kind === "video" ? "Video" : "Ảnh"} ·{" "}
                        {nowPlaying.creative.duration}s · Airing #{nowPlaying.airing_id}
                      </p>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/60">
                        <div
                          className="h-full bg-emerald-600 transition-all duration-300"
                          style={{
                            width: `${
                              nowPlaying.creative.duration > 0
                                ? Math.min(100, (nowPlaying.elapsed / nowPlaying.creative.duration) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="tabular text-right text-[11px] text-slate-500">
                        Còn lại: {nowPlaying.remaining.toFixed(0)}s
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Hiện chưa có nội dung nào đang phát trên màn hình này.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      disabled={busy}
                      onClick={() => act(() => (playing ? api.playerStop() : api.playerStart()))}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-xs transition disabled:opacity-50 ${
                        playing
                          ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {playing ? "Dừng chiếu" : "Bắt đầu chiếu"}
                    </button>
                    <button
                      disabled={busy || !playing}
                      onClick={() => act(() => api.playerSkip())}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs"
                    >
                      Bỏ qua ⏭
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4.5: TRACKING SESSIONS PER DEVICE */}
          <section className="card p-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <h2 className="text-base font-bold text-slate-900">
                    Lịch sử phiên thu thập (Tracking Sessions)
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-100">
                    {selectedScreenId ? `Màn hình #${selectedScreenId}` : "Thiết bị Host"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Lưu trữ chi tiết từng phiên chạy camera, dữ liệu tiếp cận (footfall), lượt xem chú ý và cơ cấu đối tượng.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadDeviceSessions(selectedScreenId)}
                  disabled={sessionsLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
                  title="Làm mới danh sách phiên"
                >
                  <svg className={`w-3.5 h-3.5 text-slate-500 ${sessionsLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Làm mới
                </button>

                <button
                  type="button"
                  onClick={exportSessionsCSV}
                  disabled={sessions.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Xuất CSV ({sessions.length})
                </button>
              </div>
            </div>

            {sessionsLoading && sessions.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-xs text-slate-400">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mr-2" />
                Đang tải dữ liệu phiên...
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
                <div className="rounded-full bg-slate-100 p-3 text-slate-400 mb-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-slate-700">Chưa có phiên thu thập nào được lưu</p>
                <p className="mt-1 text-[11px] text-slate-500 max-w-sm">
                  Khi bạn bấm &ldquo;Bắt đầu thu thập&rdquo; trên thiết bị này, hệ thống sẽ tự động khởi tạo và cập nhật phiên dữ liệu theo thời gian thực.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-600">
                      <th className="py-3 px-4">MÃ PHIÊN</th>
                      <th className="py-3 px-3">TRẠNG THÁI</th>
                      <th className="py-3 px-3">BẮT ĐẦU / KẾT THÚC</th>
                      <th className="py-3 px-3">THỜI LƯỢNG</th>
                      <th className="py-3 px-3 text-right">SỐ TRACK ID</th>
                      <th className="py-3 px-3 text-right">TIẾP CẬN (FOOTFALL)</th>
                      <th className="py-3 px-3 text-right">LƯỢT XEM (IMPR.)</th>
                      <th className="py-3 px-3 text-right">TỶ LỆ CHÚ Ý</th>
                      <th className="py-3 px-3 text-center">NAM / NỮ</th>
                      <th className="py-3 px-3 text-right">TUỔI TB</th>
                      <th className="py-3 px-3 text-right">DWELL TB</th>
                      <th className="py-3 px-4 text-center">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {sessions.map((s) => {
                      const isActive = s.status === "active";
                      const dateStr = new Date(s.started_at * 1000).toLocaleString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const endStr = s.ended_at
                        ? new Date(s.ended_at * 1000).toLocaleString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : null;
                      // Round before splitting: raw epoch deltas print as
                      // "27.299999999999955s" otherwise.
                      const totalSec = Math.round(s.duration_seconds);
                      const durMin = Math.floor(totalSec / 60);
                      const durSec = totalSec % 60;
                      const durationStr = durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`;

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-800">
                              <span>{s.session_code}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">Nguồn: {s.source}</span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 border border-emerald-200/60">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                Đang thu thập
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 border border-slate-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                Đã hoàn thành
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                            <div>{dateStr}</div>
                            <div className="text-[10px] text-slate-400">
                              {endStr ? `→ ${endStr}` : "→ đang chạy"}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                            {durationStr}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700">
                            {s.unique_tracks.toLocaleString()}
                            {s.total_track_frames > 0 && (
                              <div className="text-[10px] text-slate-400">
                                {s.total_track_frames.toLocaleString()} lượt đo
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-900">
                            {s.total_footfall.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-indigo-600">
                            {s.total_impressions.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className="font-semibold text-slate-800">{s.attention_rate.toFixed(1)}%</span>
                            <div className="mt-1 h-1.5 w-14 ml-auto rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, s.attention_rate))}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {s.has_track_detail ? (
                              <span className="font-mono text-[11px]">
                                <span className="text-blue-600 font-semibold">{s.male_count}</span>
                                <span className="text-slate-300"> / </span>
                                <span className="text-pink-600 font-semibold">{s.female_count}</span>
                                {s.unknown_gender_count > 0 && (
                                  <span className="text-slate-400"> / {s.unknown_gender_count}?</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-300" title="Phiên cũ: chưa lưu dữ liệu theo từng track">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700">
                            {s.avg_age ?? <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700">
                            {s.avg_dwell_time.toFixed(1)}s
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => openSessionDetail(s)}
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs"
                              >
                                Chi tiết
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSession(s.id)}
                                className="rounded-md border border-red-100 bg-red-50/50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 hover:border-red-200 transition"
                                title="Xoá phiên"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECTION 5: SYSTEM HEALTH */}
          <section className="card space-y-2 p-4 text-xs">
            <h2 className="text-sm font-semibold">Tình trạng hệ thống</h2>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Row label="Thiết bị tính toán" value={String(health?.device ?? "—")} />
              <Row
                label="Model khuôn mặt"
                value={health?.face_weights_present ? "đã có (YOLOv8-Face)" : "thiếu"}
                warn={!health?.face_weights_present}
              />
              <Row
                label="Model tuổi/giới tính"
                value={health?.age_model_present ? "đã có (MiVOLO SOTA)" : "thiếu"}
                warn={!health?.age_model_present}
              />
              <Row
                label="Ngưỡng tính một lượt xem"
                value={`nhìn ≥ ${thresholds?.min_attention_seconds ?? "—"}s · có mặt ≥ ${thresholds?.min_presence_seconds ?? "—"}s`}
              />
            </dl>
          </section>
        </div>
      )}

      {/* SESSION DETAIL MODAL */}
      {sessionDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 font-mono">
                    {sessionDetailModal.session_code}
                  </h3>
                  {sessionDetailModal.status === "active" ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                      Đang thu thập
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                      Đã hoàn thành
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Thiết bị: <span className="font-semibold text-slate-700">{sessionDetailModal.device_id}</span> · Nguồn: <span className="font-semibold text-slate-700">{sessionDetailModal.source}</span>
                </p>
              </div>
              <button
                onClick={() => setSessionDetailModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                <span className="text-[11px] text-slate-500 font-medium">Tiếp cận (Footfall)</span>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{sessionDetailModal.total_footfall.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-center">
                <span className="text-[11px] text-indigo-600 font-medium">Lượt chú ý (Imp.)</span>
                <p className="text-lg font-bold text-indigo-700 mt-0.5">{sessionDetailModal.total_impressions.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                <span className="text-[11px] text-slate-500 font-medium">Tỷ lệ chú ý</span>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{sessionDetailModal.attention_rate.toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                <span className="text-[11px] text-slate-500 font-medium">Dwell Time TB</span>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{sessionDetailModal.avg_dwell_time.toFixed(1)}s</p>
              </div>
            </div>

            {/* Timings */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Thời gian bắt đầu:</span>
                <span className="font-medium text-slate-800">{new Date(sessionDetailModal.started_at * 1000).toLocaleString("vi-VN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Thời gian kết thúc:</span>
                <span className="font-medium text-slate-800">
                  {sessionDetailModal.ended_at ? new Date(sessionDetailModal.ended_at * 1000).toLocaleString("vi-VN") : "Đang chạy..."}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tổng thời lượng thu thập:</span>
                <span className="font-mono font-medium text-slate-800">{sessionDetailModal.duration_seconds} giây</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cao điểm số người cùng lúc:</span>
                <span className="font-medium text-slate-800">{sessionDetailModal.peak_people} người</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Số track_id duy nhất:</span>
                <span className="font-mono font-medium text-slate-800">
                  {sessionDetailModal.unique_tracks}
                  {sessionDetailModal.total_track_frames > 0
                    ? ` (${sessionDetailModal.total_track_frames.toLocaleString()} lượt đo)`
                    : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hiện diện TB / người:</span>
                <span className="font-mono font-medium text-slate-800">{sessionDetailModal.avg_presence_seconds.toFixed(1)}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lượt chú ý mỗi phút:</span>
                <span className="font-mono font-medium text-slate-800">{sessionDetailModal.impressions_per_minute.toFixed(2)}</span>
              </div>
            </div>

            {/* Demographics breakdown — per person, straight from the API's
                per-track roll-up. A session recorded before that ledger existed
                has no per-person split, so it says so instead of showing
                frame-scaled numbers that look like people. */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Cơ cấu nhân khẩu học thu thập được</h4>

              {!sessionDetailModal.has_track_detail ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-3 text-[11px] text-amber-700">
                  Phiên này được ghi trước khi hệ thống lưu dữ liệu theo từng track_id, nên không có
                  cơ cấu giới tính / độ tuổi theo người. Các phiên thu thập mới sẽ có đầy đủ.
                </div>
              ) : (
                (() => {
                  const male = sessionDetailModal.male_count;
                  const female = sessionDetailModal.female_count;
                  const unknownGender = sessionDetailModal.unknown_gender_count;
                  const totalGender = male + female;
                  const malePct = totalGender > 0 ? Math.round((male / totalGender) * 100) : 0;
                  const femalePct = totalGender > 0 ? 100 - malePct : 0;

                  const ages = sessionDetailModal.age_breakdown || {};
                  // Built from AGE_OPTIONS so this cannot drift from the
                  // backend's AGE_GROUPS the way the hardcoded four did. The
                  // pre-split `<18` bracket is appended only when old sessions
                  // in view still carry it.
                  const ageBrackets: Record<string, number> = Object.fromEntries(
                    AGE_OPTIONS.filter((o) => o.value !== ANY).map((o) => [
                      o.value,
                      Number(ages[o.value] || 0),
                    ]),
                  );
                  if (Number(ages["<18"] || 0) > 0) {
                    ageBrackets["<18"] = Number(ages["<18"]);
                  }
                  const totalAge = Object.values(ageBrackets).reduce((acc, v) => acc + v, 0);

                  return (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-100 p-3 bg-white">
                        <div className="flex justify-between text-xs mb-1.5 font-medium">
                          <span className="text-blue-600">Nam: {male} người ({malePct}%)</span>
                          <span className="text-pink-600">Nữ: {female} người ({femalePct}%)</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-pink-100 overflow-hidden flex">
                          <div className="h-full bg-blue-500 transition-all" style={{ width: `${malePct}%` }} />
                          <div className="h-full bg-pink-500 transition-all" style={{ width: `${femalePct}%` }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
                          <span>Chưa nhận diện được giới tính: {unknownGender}</span>
                          <span>
                            Tuổi trung bình:{" "}
                            <span className="font-semibold text-slate-600">
                              {sessionDetailModal.avg_age != null ? `${sessionDetailModal.avg_age} tuổi` : "—"}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[11px] font-medium text-slate-500">
                          Phân nhóm độ tuổi (mỗi người tính một lần):
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(ageBrackets).map(([bracket, count]) => {
                            const pct = totalAge > 0 ? Math.round((count / totalAge) * 100) : 0;
                            return (
                              <div key={bracket} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                                <div className="flex justify-between text-[11px] font-medium text-slate-700">
                                  <span>Nhóm {bracket}:</span>
                                  <span>{count} ({pct}%)</span>
                                </div>
                                <div className="mt-1 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {Number(ages.unknown || 0) > 0 && (
                          <p className="text-[10px] text-slate-400">
                            Chưa nhận diện được độ tuổi: {Number(ages.unknown)} người
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Per-track ledger: one row per person, and how many times that
                track_id was measured during the session. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Chi tiết theo track_id
                  {sessionDetailModal.tracks.length > 0 && (
                    <span className="ml-1.5 font-normal text-slate-400 normal-case">
                      ({sessionDetailModal.tracks.length} người)
                    </span>
                  )}
                </h4>
                <button
                  type="button"
                  onClick={() => exportSessionTracksCSV(sessionDetailModal)}
                  disabled={sessionDetailModal.tracks.length === 0}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Xuất CSV chi tiết
                </button>
              </div>

              {sessionDetailLoading ? (
                <div className="flex items-center justify-center py-6 text-[11px] text-slate-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mr-2" />
                  Đang tải chi tiết từng track...
                </div>
              ) : sessionDetailModal.tracks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3 text-[11px] text-slate-500">
                  Phiên này chưa lưu dữ liệu chi tiết theo từng track_id.
                </p>
              ) : (
                <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] font-semibold text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 px-3">TRACK ID</th>
                        <th className="py-2 px-2 text-right">SỐ LẦN ĐO</th>
                        <th className="py-2 px-2">GIỚI TÍNH</th>
                        <th className="py-2 px-2 text-right">TUỔI</th>
                        <th className="py-2 px-2">NHÓM TUỔI</th>
                        <th className="py-2 px-2 text-right">HIỆN DIỆN</th>
                        <th className="py-2 px-2 text-right">DWELL</th>
                        <th className="py-2 px-3 text-center">CHÚ Ý</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessionDetailModal.tracks.map((t) => (
                        <tr key={t.track_id} className="hover:bg-slate-50/70">
                          <td className="py-1.5 px-3 font-mono font-semibold text-slate-800">#{t.track_id}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-600">{t.frames}</td>
                          <td className="py-1.5 px-2">
                            {t.gender === "Nam" ? (
                              <span className="text-blue-600 font-medium">Nam</span>
                            ) : t.gender === "Nữ" ? (
                              <span className="text-pink-600 font-medium">Nữ</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                            {t.age ?? <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-1.5 px-2 text-slate-600">
                            {t.age_group || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-600">{t.presence_seconds.toFixed(1)}s</td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-600">{t.dwell_seconds.toFixed(1)}s</td>
                          <td className="py-1.5 px-3 text-center">
                            {t.attentive ? (
                              <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">Có</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Notes if any */}
            {sessionDetailModal.notes && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Ghi chú: </span>
                {sessionDetailModal.notes}
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSessionDetailModal(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );

  if (IS_CLERK_ENABLED && !currentUser) {
    return <ClerkAdminGuard>{adminContent}</ClerkAdminGuard>;
  }

  return adminContent;
}

function ModeCard({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3.5 text-left transition shadow-xs ${
        active
          ? "border-emerald-500 bg-emerald-50/70"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
        <span
          className={`h-2.5 w-2.5 rounded-full border ${
            active ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-slate-100"
          }`}
        />
        {title}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{body}</p>
    </button>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-1 last:border-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={warn ? "text-[var(--warn)]" : ""}>{value}</dd>
    </div>
  );
}
