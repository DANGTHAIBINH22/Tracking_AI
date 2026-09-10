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
  UserPublic,
  api,
  clearAuthSession,
  getAuthToken,
  getStoredUser,
} from "@/lib/api";
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
  const [sourcesList, setSourcesList] = useState<{ value: string; label: string; type: string; description?: string }[]>([]);
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
    } catch {
      // ignore
    }
  }, []);

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
    api.captureConfig().then((cfg) => { if (!ignore) setConfig(cfg); }).catch(() => undefined);
    api.thresholds().then((th) => { if (!ignore) setThresholds(th); }).catch(() => undefined);
    api.health().then((h) => { if (!ignore) setHealth(h); }).catch(() => undefined);

    const id = setInterval(fetchState, 3000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, [isAuthenticated, loadScreens]);

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
    act(() => api.captureStart(mode === "browser" ? BROWSER_SOURCE : source || "0"));

  const adminContent = (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-6 sm:py-6">
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

      {/* ========================================================= */}
      {/* SECTION 1: SCREEN PAIRING & MANAGEMENT                    */}
      {/* ========================================================= */}
      <section className="card space-y-4 p-4 sm:p-5 border-indigo-200 bg-gradient-to-b from-indigo-50/40 via-white to-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Quản Lý & Ghép Nối Màn Hình TV (/screen)</span>
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Mỗi màn hình TV/Kiosk hiển thị một mã Pairing Code. Nhập mã tại đây để cấp quyền phát quảng cáo.
            </p>
          </div>
          <a
            href="/screen"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            + Mở tab màn hình mới (/screen)
          </a>
        </div>

        {/* Pairing Form */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <h3 className="text-xs font-semibold text-slate-900">
            Kích hoạt thiết bị màn hình mới
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            Đọc mã 6 ký tự đang hiển thị trên TV/Kiosk (ví dụ: <code className="font-mono font-bold text-emerald-700">4TT-9YG</code>), sau đó điền vào form:
          </p>

          {pairError && (
            <div className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
              {pairError}
            </div>
          )}

          {pairSuccess && (
            <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
              {pairSuccess}
            </div>
          )}

          <form onSubmit={handlePairScreen} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>

        {/* List of screens */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900">
              Màn hình đã đăng ký ({screens.length})
            </h3>
            <button
              onClick={loadScreens}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 transition"
            >
              Tải lại danh sách
            </button>
          </div>

          {screens.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
              Chưa có màn hình nào được kết nối. Hãy mở <code className="font-mono text-emerald-700">/screen</code> trên thiết bị TV để bắt đầu!
            </div>
          ) : (
            <div className="space-y-2">
              {screens.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700 border border-indigo-200">
                      TV
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">
                        {s.name || `Màn hình #${s.id}`}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {s.location ? `Vị trí: ${s.location} · ` : ""}
                        Mã ghép đôi: <span className="font-mono font-semibold text-indigo-600">{s.pairing_code || "—"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 border border-emerald-200 text-[11px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Đã kích hoạt
                    </span>

                    <button
                      onClick={() => handleDeleteScreen(s.id, s.name)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-100 transition"
                    >
                      Thu hồi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 2: LIVE STATS                                     */}
      {/* ========================================================= */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Phân tích"
          value={running ? "Đang chạy" : "Đã dừng"}
          tone={running ? "accent" : "default"}
          hint={running ? (capture?.mode === "browser" ? "nguồn: /screen" : `nguồn: ${capture?.source}`) : "chưa có nguồn"}
        />
        <Stat label="Tốc độ xử lý" value={stats?.fps ?? 0} unit="fps" hint="phía máy chủ" />
        <Stat label="Có mặt" value={stats?.people_now ?? 0} hint="trong khung hình" />
        <Stat
          label="Đang nhìn"
          value={stats?.attentive_now ?? 0}
          tone="accent"
          hint={`ngưỡng ${thresholds?.min_attention_seconds ?? "—"}s`}
        />
      </section>

      {/* ========================================================= */}
      {/* SECTION 3: CAMERA & INGEST PIPELINE                      */}
      {/* ========================================================= */}
      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Nguồn camera & Pipeline</h2>
          <span className="text-[11px] text-[var(--muted)]">
            Hai chế độ loại trừ nhau — đổi chế độ sẽ khởi động lại phân tích
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <ModeCard
            active={mode === "browser"}
            onClick={() => setMode("browser")}
            title="Trình duyệt / Màn hình Kiosk (/screen)"
            body="Máy chiếu quảng cáo tự bật webcam của chính nó và đẩy khung hình lên. Mở /screen ở máy nào thì đo ở máy đó — không cần camera cắm vào máy chủ."
          />
          <ModeCard
            active={mode === "server"}
            onClick={() => setMode("server")}
            title="Máy chủ (OpenCV)"
            body="Máy chạy API tự đọc camera hoặc video mẫu. Nhanh nhất vì không truyền ảnh qua mạng. Nhập đường dẫn file để phát lại video như thật (ví dụ: data/store-aisle-detection.mp4)."
          />
        </div>

        {/* Quick preset selector for testing */}
        {mode === "server" && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                Chọn video mẫu để test model AI đếm người:
              </span>
              <label className="cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 shadow-xs">
                Tải lên video TTTM khác (.mp4)
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleUploadTestVideo}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {sourcesList.length > 0 ? (
                sourcesList.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      setSource(s.value);
                      setMode("server");
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                      source === s.value
                        ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800 shadow-xs"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:bg-slate-50"
                    }`}
                  >
                    {s.label}
                  </button>
                ))
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSource("data/store-aisle-detection.mp4");
                      setMode("server");
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500 hover:bg-slate-50 transition shadow-xs"
                  >
                    Video TTTM / Lối đi (store-aisle-detection.mp4)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSource("data/face-demographics-walking-and-pause.mp4");
                      setMode("server");
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500 hover:bg-slate-50 transition shadow-xs"
                  >
                    Video người đi lại (face-demographics-walking-and-pause.mp4)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSource("0");
                      setMode("server");
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500 hover:bg-slate-50 transition shadow-xs"
                  >
                    Webcam máy tính (0)
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {mode === "server" && (
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="0 = webcam, hoặc data/store-aisle-detection.mp4"
              className="w-full sm:w-80 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          )}
          <button
            disabled={busy}
            onClick={() => (running ? act(() => api.captureStop()) : startCapture())}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 shadow-xs"
          >
            {running ? "Dừng phân tích" : "Bật phân tích"}
          </button>
          {running && capture?.mode !== mode && (
            <button
              disabled={busy}
              onClick={() => act(async () => { await api.captureStop(); await startCapture(); })}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition disabled:opacity-50 shadow-xs"
            >
              Chuyển sang chế độ đã chọn
            </button>
          )}
          <button
            onClick={() => setTestCam((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition shadow-xs sm:ml-auto ${
              testCam
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {testCam ? "Tắt camera thử" : "Bật camera thử"}
          </button>
          <button
            onClick={() => setPreview((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 shadow-xs"
          >
            {preview ? "Ẩn preview" : "Xem preview máy chủ"}
          </button>
        </div>

        {/* Browser publisher status */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${ingest?.connected ? "bg-[var(--accent)]" : "bg-[var(--muted)]"}`}
              />
              <span className="font-medium">Màn hình đang gửi camera</span>
            </span>
            <span className="tabular text-[var(--muted)]">
              {ingest?.connected
                ? `#${ingest.client} · ${ingest.fps} fps · ${ingest.frames} khung${ingest.dropped ? ` · ${ingest.dropped} hỏng` : ""}`
                : "chưa có màn hình nào gửi camera"}
            </span>
          </div>
          {browserMode && !ingest?.connected && (
            <p className="mt-1.5 text-[var(--warn)]">
              Đang chờ khung hình. Mở <code>/screen</code> trên máy có webcam và cho phép quyền camera.
            </p>
          )}
        </div>

        {/* Camera Preview */}
        {(testCam || preview) && (
          <div className={`grid gap-2 ${testCam && preview ? "md:grid-cols-2" : ""}`}>
            {testCam && (
              <figure className="overflow-hidden rounded-lg border border-[var(--border)] bg-black">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className="aspect-video w-full object-contain"
                />
                <figcaption className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-[var(--muted)]">
                  <span>Camera thử cục bộ</span>
                  <span className="tabular">
                    {camera.phase === "live" && ` · ${camera.fps} fps · ${camera.sent} khung`}
                  </span>
                </figcaption>
              </figure>
            )}
            {preview && (
              <figure className="overflow-hidden rounded-lg border border-[var(--border)] bg-black">
                {running ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${API_BASE}/api/capture/stream.mjpg`}
                    alt="Camera khán giả"
                    className="aspect-video w-full object-contain"
                  />
                ) : (
                  <p className="flex aspect-video items-center justify-center p-8 text-center text-xs text-[var(--muted)]">
                    Bật phân tích để xem khung hình.
                  </p>
                )}
                <figcaption className="px-3 py-1.5 text-[11px] text-[var(--muted)]">
                  Máy chủ nhận được — đã vẽ khung nhận diện YOLOv8 + MiVOLO
                </figcaption>
              </figure>
            )}
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* SECTION 4: PLAYBACK CONTROLS                              */}
      {/* ========================================================= */}
      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Phát quảng cáo trên màn hình</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={() => act(() => (playing ? api.playerStop() : api.playerStart()))}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] disabled:opacity-50"
          >
            {playing ? "Dừng chiếu" : "Chiếu quảng cáo"}
          </button>
          <button
            disabled={busy || !playing}
            onClick={() => act(() => api.playerSkip())}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] disabled:opacity-50"
          >
            Bỏ qua
          </button>
          <span className="tabular ml-2 text-xs text-[var(--muted)]">
            {nowPlaying?.creative
              ? `${nowPlaying.creative.name} · còn ${nowPlaying.remaining.toFixed(0)}s · airing #${nowPlaying.airing_id}`
              : "chưa phát"}
          </span>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 5: SYSTEM HEALTH                                  */}
      {/* ========================================================= */}
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
