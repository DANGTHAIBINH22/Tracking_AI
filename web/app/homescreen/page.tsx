"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE, api, mediaUrl } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { useCameraIngest } from "@/lib/useCameraIngest";
import {
  IconCheck,
  IconCopy,
  IconDevices,
  IconExternal,
  IconTV,
} from "@/components/icons/Icons";

type DisplayMode = "auto" | "pip";

export default function HomeScreenPage() {
  const { stats, connected } = useLive();
  const [displayMode, setDisplayMode] = useState<DisplayMode>("auto");
  const [showHud, setShowHud] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ---------- DEVICE PAIRING / CONNECTION STATE ----------
  const [screenToken, setScreenToken] = useState<string | null>(null);
  const [screenInfo, setScreenInfo] = useState<{
    id?: number | null;
    name: string | null;
    location: string | null;
    playlist_id?: number | null;
    playlist_name?: string | null;
  } | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loadingToken, setLoadingToken] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check saved token on mount (from localStorage and cookie)
  useEffect(() => {
    let savedToken = localStorage.getItem("signage_screen_token");
    if (!savedToken) {
      const match = document.cookie.match(/(?:^|;\s*)signage_screen_token=([^;]+)/);
      if (match) savedToken = decodeURIComponent(match[1]);
    }

    if (savedToken) {
      api
        .verifyScreenToken(savedToken)
        .then((res) => {
          if (res.valid) {
            setScreenToken(savedToken);
            setScreenInfo({
              id: res.id ?? null,
              name: res.name || null,
              location: res.location || null,
              playlist_id: res.playlist_id ?? null,
              playlist_name: res.playlist_name || null,
            });
          } else {
            localStorage.removeItem("signage_screen_token");
            document.cookie = "signage_screen_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            setScreenToken(null);
          }
        })
        .catch(() => {
          // Keep saved token if temporary network glitch
          setScreenToken(savedToken);
        })
        .finally(() => setLoadingToken(false));
    } else {
      setLoadingToken(false);
    }
  }, []);

  // Periodic poll to synchronize screen assignment (playlist_id, name, location)
  useEffect(() => {
    if (!screenToken) return;

    const interval = setInterval(() => {
      api
        .verifyScreenToken(screenToken)
        .then((res) => {
          if (res.valid) {
            setScreenInfo((prev) => {
              if (
                prev?.playlist_id === res.playlist_id &&
                prev?.playlist_name === res.playlist_name &&
                prev?.name === res.name &&
                prev?.location === res.location &&
                prev?.id === res.id
              ) {
                return prev;
              }
              return {
                id: res.id ?? null,
                name: res.name || null,
                location: res.location || null,
                playlist_id: res.playlist_id ?? null,
                playlist_name: res.playlist_name || null,
              };
            });
          } else {
            localStorage.removeItem("signage_screen_token");
            document.cookie = "signage_screen_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            setScreenToken(null);
            setScreenInfo(null);
          }
        })
        .catch(() => undefined);
    }, 3000);

    return () => clearInterval(interval);
  }, [screenToken]);

  // Request pairing code when not paired
  const requestNewCode = async () => {
    try {
      const res = await api.registerScreenCode();
      setPairingCode(res.pairing_code);
      setCodeExpiresAt(res.expires_at);
    } catch (err) {
      console.error("Lỗi lấy mã ghép nối:", err);
    }
  };

  useEffect(() => {
    if (!loadingToken && !screenToken && !pairingCode) {
      requestNewCode();
    }
  }, [loadingToken, screenToken, pairingCode]);

  // Countdown timer for pairing code
  useEffect(() => {
    if (!codeExpiresAt || screenToken) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round(codeExpiresAt - Date.now() / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        requestNewCode();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [codeExpiresAt, screenToken]);

  // Polling check if Admin has approved / paired this code
  useEffect(() => {
    if (!pairingCode || screenToken) return;

    const poll = async () => {
      try {
        const res = await api.checkScreenStatus(pairingCode);
        if (res.status === "paired" && res.screen_token) {
          localStorage.setItem("signage_screen_token", res.screen_token);
          document.cookie = `signage_screen_token=${encodeURIComponent(res.screen_token)}; path=/; max-age=31536000; SameSite=Lax`;
          setScreenToken(res.screen_token);
          setScreenInfo({
            name: res.name,
            location: res.location,
            playlist_id: null,
            playlist_name: null,
          });
        } else if (res.status === "expired") {
          requestNewCode();
        }
      } catch {
        // ignore poll errors
      }
    };

    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [pairingCode, screenToken]);

  const handleCopyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode).catch(() => undefined);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleConnectAdmin = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode).catch(() => undefined);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
    const targetUrl = pairingCode ? `/admin?code=${encodeURIComponent(pairingCode)}` : "/admin";
    window.open(targetUrl, "_blank");
  };

  const handleUnpair = () => {
    if (confirm("Huỷ kết nối thiết bị này và đăng ký lại bằng mã mới?")) {
      localStorage.removeItem("signage_screen_token");
      document.cookie = "signage_screen_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      setScreenToken(null);
      setScreenInfo(null);
      setPairingCode(null);
    }
  };

  // Device must be connected (paired token) to allow tracking and playback
  const isDeviceConnected = Boolean(screenToken);
  const hasPlaylistAssigned = Boolean(screenInfo?.playlist_id);

  // Camera Ingest: Only actively captures when tracking is running AND device is connected AND selected for a playlist
  const isCaptureRunning = Boolean(stats?.running && isDeviceConnected && hasPlaylistAssigned);
  const { videoRef } = useCameraIngest(isCaptureRunning);

  const nowPlaying = stats?.now_playing ?? null;
  // STRICT RULE: Playlist playback is ONLY permitted when device is connected AND selected to play a playlist
  const isPlaying = Boolean(
    isDeviceConnected && hasPlaylistAssigned && nowPlaying?.playing && nowPlaying.creative
  );
  const creative = nowPlaying?.creative ?? null;

  const toggleTracking = async () => {
    if (!isDeviceConnected) return;
    try {
      if (isCaptureRunning) {
        await api.captureStop();
      } else {
        await api.captureStart("browser");
      }
    } catch (err) {
      console.error("Lỗi điều khiển tracking:", err);
    }
  };

  // Auto-hide controls when idle
  const handleMouseMove = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3500);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === "h") {
        setShowHud((v) => !v);
      } else if (e.key.toLowerCase() === "m") {
        setIsMuted((v) => !v);
      } else if (e.key.toLowerCase() === "p") {
        setDisplayMode((v) => (v === "pip" ? "auto" : "pip"));
      } else if (e.key.toLowerCase() === "t") {
        toggleTracking();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCaptureRunning, isDeviceConnected]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => undefined);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const progress =
    creative && creative.duration > 0
      ? Math.min(100, ((nowPlaying?.elapsed ?? 0) / creative.duration) * 100)
      : 0;

  if (loadingToken) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-xs text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p>Đang kiểm tra kết nối thiết bị Homescreen...</p>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none overflow-hidden"
    >
      {/* Hidden camera element: captures viewers standing in front of this Homescreen */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute -left-[9999px] top-0 h-48 w-64 opacity-0"
      />

      {/* ========================================================= */}
      {/* 1. TOP OVERLAY HUD / CONTROLS                             */}
      {/* ========================================================= */}
      <div
        className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-opacity duration-300 ${
          controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Left: Device & Live Connection Info */}
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-xs border ${
            isDeviceConnected
              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/20 border-amber-500/30 text-amber-400"
          }`}>
            TV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-wide">
                {screenInfo?.name || "Homescreen Display"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  !isDeviceConnected
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : hasPlaylistAssigned
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    !isDeviceConnected
                      ? "bg-amber-400 animate-pulse"
                      : hasPlaylistAssigned
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-amber-400 animate-pulse"
                  }`}
                />
                {!isDeviceConnected
                  ? "Chưa kết nối thiết bị"
                  : hasPlaylistAssigned
                  ? `Đang phát: ${screenInfo?.playlist_name || "Playlist"}`
                  : "Chưa chọn thiết bị phát"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  connected
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                }`}
              >
                {connected ? "Máy chủ online" : "Mất kết nối..."}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {!isDeviceConnected ? (
                <span className="text-amber-400/90 font-medium">
                  Cần kết nối thiết bị tại trang Quản trị (/admin) để phát playlist
                </span>
              ) : !hasPlaylistAssigned ? (
                <span className="text-amber-300/90 font-medium">
                  Đã kết nối{screenInfo?.location ? ` (${screenInfo.location})` : ""} · Cần chọn thiết bị này trong Playlist để bắt đầu phát
                </span>
              ) : (
                <>Vị trí: {screenInfo?.location || "Chưa thiết lập"} · Đang phát: {screenInfo?.playlist_name || "Playlist kích hoạt"}</>
              )}
            </p>
          </div>
        </div>

        {/* Right: Actions (Connect Device / Admin, Tracking, PiP, Sound, HUD, Fullscreen) */}
        <div className="flex items-center gap-2">
          {/* PROMINENT BUTTON: CONNECT DEVICE / GO TO ADMIN */}
          {!isDeviceConnected ? (
            <button
              type="button"
              onClick={handleConnectAdmin}
              className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 text-xs font-bold text-black shadow-lg shadow-amber-500/20 transition hover:brightness-110 active:scale-95 cursor-pointer animate-pulse"
            >
              <IconDevices className="h-4 w-4" />
              <span>Kết nối thiết bị ngay</span>
              <IconExternal className="h-3 w-3 opacity-70" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <a
                href="/admin"
                target="_blank"
                rel="noreferrer"
                className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white cursor-pointer"
                title="Mở trang Quản trị thiết bị (/admin)"
              >
                <IconDevices className="h-3.5 w-3.5 text-emerald-400" />
                <span>Admin</span>
                <IconExternal className="h-2.5 w-2.5 opacity-60" />
              </a>

              <button
                type="button"
                onClick={handleUnpair}
                className="flex h-9 items-center rounded-xl border border-zinc-800 bg-zinc-900/80 px-2.5 text-xs text-zinc-400 transition hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-900/50 cursor-pointer"
                title="Huỷ kết nối thiết bị"
              >
                Huỷ ghép
              </button>
            </div>
          )}

          {/* AI Tracking control toggle */}
          <button
            type="button"
            onClick={toggleTracking}
            disabled={!isDeviceConnected || !hasPlaylistAssigned}
            title={
              !isDeviceConnected
                ? "Thiết bị chưa kết nối"
                : !hasPlaylistAssigned
                ? "Chưa chọn thiết bị phát Playlist"
                : isCaptureRunning
                ? "Tạm dừng AI Audience Tracking (T)"
                : "Bật AI Audience Tracking (T)"
            }
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
              !isDeviceConnected || !hasPlaylistAssigned
                ? "border-zinc-800/60 bg-zinc-900/40 text-zinc-500 cursor-not-allowed"
                : isCaptureRunning
                ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-white cursor-pointer"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                !isDeviceConnected || !hasPlaylistAssigned
                  ? "bg-zinc-600"
                  : isCaptureRunning
                  ? "bg-emerald-400 animate-ping"
                  : "bg-zinc-500"
              }`}
            />
            <span>{isCaptureRunning ? "AI Tracking BẬT" : "AI Tracking TẮT"}</span>
          </button>

          {/* PiP AI Camera Toggle */}
          {isDeviceConnected && (
            <button
              type="button"
              onClick={() => setDisplayMode((v) => (v === "pip" ? "auto" : "pip"))}
              title="Bật/Tắt cửa sổ xem Camera AI nhận diện khuôn mặt (P)"
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition cursor-pointer ${
                displayMode === "pip"
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span>Camera AI PiP</span>
            </button>
          )}

          {/* Audio toggle */}
          {isDeviceConnected && (
            <button
              type="button"
              onClick={() => setIsMuted((v) => !v)}
              title={isMuted ? "Bật âm thanh (M)" : "Tắt âm thanh (M)"}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white cursor-pointer"
            >
              <span>{isMuted ? "Muted" : "Sound ON"}</span>
            </button>
          )}

          {/* Toggle HUD button */}
          <button
            type="button"
            onClick={() => setShowHud((v) => !v)}
            title="Ẩn/hiện thanh chỉ số người xem (H)"
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs transition cursor-pointer ${
              showHud
                ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-white"
            }`}
          >
            <span>HUD</span>
          </button>

          {/* Fullscreen button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toàn màn hình (F)"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white cursor-pointer"
          >
            <span>{isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. MAIN SCREEN AREA                                       */}
      {/* ========================================================= */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center">
        {/* CASE A: DEVICE NOT CONNECTED -> BLOCK PLAYBACK & SHOW CONNECT BUTTON */}
        {!isDeviceConnected ? (
          <div className="flex flex-col items-center justify-center px-6 text-center max-w-lg z-10 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Ambient Aura */}
            <div className="relative flex items-center justify-center">
              <div className="absolute h-44 w-44 rounded-full bg-amber-500/15 blur-3xl animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-900 border border-amber-500/40 text-amber-400 shadow-2xl">
                <IconTV className="h-10 w-10 text-amber-400" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-950/40 px-4 py-1.5 text-xs font-semibold text-amber-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <span>Chặn phát sóng · Chưa kết nối thiết bị</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Thiết Bị Chưa Được Kết Nối
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Màn hình Homescreen này cần được kết nối và phê duyệt từ trang <strong>Quản Trị (/admin)</strong> trước khi có thể bắt đầu phát Playlist quảng cáo.
              </p>
            </div>

            {/* Prominent Pairing Code Box */}
            <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/85 p-6 shadow-2xl backdrop-blur-md space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Mã Kết Nối Màn Hình (Pairing Code)
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="font-mono text-4xl font-extrabold tracking-widest text-emerald-400 sm:text-5xl select-all">
                  {pairingCode || "------"}
                </div>
                {pairingCode && (
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition cursor-pointer"
                    title="Sao chép mã"
                  >
                    {copiedCode ? (
                      <IconCheck className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <IconCopy className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
              {timeLeft > 0 && (
                <p className="text-[11px] text-zinc-500 font-mono">
                  Mã hết hạn sau: <span className="text-amber-400 font-semibold">{formattedTime}</span>
                </p>
              )}
            </div>

            {/* 1-Click Connect Button */}
            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={handleConnectAdmin}
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 px-6 py-4 text-sm font-bold text-black shadow-xl shadow-emerald-500/25 transition hover:brightness-110 active:scale-[0.99] cursor-pointer"
              >
                <IconDevices className="h-5 w-5" />
                <span>Vào Admin Kết Nối Thiết Bị Ngay</span>
                <IconExternal className="h-4 w-4 opacity-75" />
              </button>
              <p className="text-[11px] text-zinc-500">
                (Sẽ mở tab /admin mới và tự động điền mã ghép nối này)
              </p>
            </div>

            {/* Step-by-step simple instructions */}
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left text-xs text-zinc-400 space-y-2">
              <p className="font-semibold text-zinc-300">Hướng dẫn nhanh:</p>
              <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                <li>
                  Bấm nút <strong className="text-emerald-400">&quot;Vào Admin Kết Nối Thiết Bị Ngay&quot;</strong> ở trên (mã kết nối sẽ được tự động điền sẵn).
                </li>
                <li>
                  Đặt tên màn hình (ví dụ: <span className="text-zinc-200 italic font-medium">TV Sảnh TTTM</span>) và bấm <strong className="text-indigo-300">&quot;Kích hoạt màn hình&quot;</strong>.
                </li>
                <li>
                  Sau khi kết nối, hãy vào <strong>Playlists</strong> và bấm <strong>&quot;Phát lên thiết bị&quot;</strong> để chọn màn hình này phát quảng cáo!
                </li>
              </ol>
            </div>
          </div>
        ) : !hasPlaylistAssigned ? (
          /* CASE B: DEVICE CONNECTED BUT NOT YET SELECTED IN ANY PLAYLIST */
          <div className="flex flex-col items-center justify-center px-6 text-center max-w-lg z-10 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-40 w-40 rounded-full bg-amber-500/15 blur-2xl animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-900 border border-amber-500/30 text-xl font-bold text-amber-400 shadow-2xl">
                <IconTV className="h-10 w-10 text-amber-400" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-950/40 px-4 py-1.5 text-xs font-semibold text-amber-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <span>Thiết bị đã kết nối · Chưa chọn phát Playlist</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {screenInfo?.name || "Màn Hình Homescreen"}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Màn hình này đã kết nối và được phê duyệt thành công{screenInfo?.location ? ` tại ${screenInfo.location}` : ""}.
                <br />
                Tuy nhiên, bạn chưa chọn thiết bị này trong bất kỳ Playlist nào. Để phát nội dung, hãy vào trang <strong>Playlists</strong> và bấm <strong>&quot;Phát lên thiết bị&quot;</strong> rồi chọn màn hình này.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <a
                href="/playlists"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 hover:brightness-110 transition cursor-pointer"
              >
                <span>Vào Quản Lý Playlist Chọn Thiết Bị Phát</span>
                <IconExternal className="h-3.5 w-3.5 opacity-80" />
              </a>

              <a
                href="/admin"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-xs font-medium text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <span>Quản trị thiết bị (/admin)</span>
              </a>
            </div>
          </div>
        ) : isPlaying && creative ? (
          /* CASE C: DEVICE CONNECTED & ACTIVE PLAYLIST SELECTED -> PLAY MEDIA */
          <div className="w-full h-full flex items-center justify-center">
            {creative.kind === "video" ? (
              <video
                key={nowPlaying?.airing_id ?? creative.id}
                src={mediaUrl(creative.url)}
                autoPlay
                muted={isMuted}
                playsInline
                loop
                className="h-full w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={nowPlaying?.airing_id ?? creative.id}
                src={mediaUrl(creative.url)}
                alt={creative.name}
                className="h-full w-full object-contain"
              />
            )}
          </div>
        ) : (
          /* CASE D: DEVICE CONNECTED & ASSIGNED BUT PLAYLIST EMPTY / WAITING */
          <div className="flex flex-col items-center justify-center px-6 text-center max-w-lg z-10 space-y-6">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-36 w-36 rounded-full bg-emerald-500/15 blur-2xl animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-900 border border-emerald-500/30 text-xl font-bold text-emerald-400 shadow-2xl">
                TV
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-4 py-1.5 text-xs font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span>Đang phát: {screenInfo?.playlist_name || "Playlist"}</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {screenInfo?.name || "Màn Hình Trình Chiếu Homescreen"}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Thiết bị đã được chọn để phát Playlist <strong>{screenInfo?.playlist_name}</strong>. Đang tải tệp media hoặc danh sách phát đang trống.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <a
                href={`/playlists/${screenInfo?.playlist_id || ""}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition cursor-pointer"
              >
                <span>Chỉnh sửa nội dung Playlist</span>
                <IconExternal className="h-3.5 w-3.5 opacity-80" />
              </a>

              <a
                href="/playlists"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <span>Danh sách Playlists</span>
              </a>
            </div>
          </div>
        )}

        {/* --- OPTIONAL PiP WINDOW: Live AI Bounding Box Stream --- */}
        {isDeviceConnected && displayMode === "pip" && (
          <div className="absolute bottom-20 right-6 z-20 w-80 aspect-video rounded-xl overflow-hidden border-2 border-emerald-500/60 shadow-2xl bg-black backdrop-blur-md transition hover:scale-105">
            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/70 text-[10px] text-emerald-300 font-mono">
              Live AI Tracking ({stats?.people_now ?? 0} người)
            </div>
            {isCaptureRunning ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${API_BASE}/api/capture/stream.mjpg`}
                alt="Camera AI PiP"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-500 bg-zinc-900">
                Đang khởi động camera AI...
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 3. BOTTOM INFO HUD & PROGRESS BAR                         */}
      {/* ========================================================= */}
      {showHud && (
        <div
          className={`absolute bottom-0 inset-x-0 z-30 transition-opacity duration-300 ${
            controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Media progress bar */}
          {creative && creative.duration > 0 && isPlaying && (
            <div className="w-full bg-zinc-800/80 h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* HUD status bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent text-xs text-zinc-300">
            {/* Active video metadata or connection notice */}
            <div className="flex items-center gap-3">
              {!isDeviceConnected ? (
                <span className="text-amber-400 font-medium flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Chưa kết nối thiết bị: Bấm nút &quot;Kết nối thiết bị ngay&quot; phía trên để ghép nối</span>
                </span>
              ) : !hasPlaylistAssigned ? (
                <span className="text-amber-300 font-medium flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Thiết bị đã kết nối · Vào mục Playlists và bấm &quot;Phát lên thiết bị&quot; để chọn màn hình này</span>
                </span>
              ) : creative && isPlaying ? (
                <>
                  <span className="font-semibold text-white tracking-wide truncate max-w-[280px]">
                    {creative.name}
                  </span>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                    {creative.kind}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    Vòng lặp liên tục
                  </span>
                  {creative.category && (
                    <span className="rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300">
                      {creative.category}
                    </span>
                  )}
                  {creative.duration > 0 && (
                    <span className="text-[11px] font-mono text-zinc-400">
                      {Math.round(nowPlaying?.elapsed ?? 0)}s / {creative.duration}s
                    </span>
                  )}
                </>
              ) : (
                <span className="text-zinc-400 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Đang tải nội dung Playlist: {screenInfo?.playlist_name}...</span>
                </span>
              )}
            </div>

            {/* Audience Tracking Metrics in real-time */}
            {isDeviceConnected && (
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Khán giả trước màn hình:</span>
                  <span className="font-mono font-bold text-white tabular-nums text-sm">
                    {stats?.people_now ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Đang nhìn video:</span>
                  <span
                    className={`font-mono font-bold tabular-nums text-sm ${
                      (stats?.attentive_now ?? 0) > 0 ? "text-emerald-400 animate-pulse" : "text-zinc-400"
                    }`}
                  >
                    {stats?.attentive_now ?? 0}
                  </span>
                </div>
                {stats?.recommendation?.crowd_context && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="rounded bg-amber-950/60 border border-amber-600/40 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                      {stats.recommendation.crowd_context === "single"
                        ? "1 Khán giả"
                        : stats.recommendation.crowd_context === "group"
                        ? `Nhóm ${stats.recommendation.people_count || 2} người`
                        : `Đám đông ${stats.recommendation.people_count || 5} người`}
                    </span>
                  </div>
                )}
                {stats?.recommendation?.viewer_approx_age && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="text-zinc-400">Nhận diện:</span>
                    <span className="rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 font-mono text-teal-300">
                      ~{stats.recommendation.viewer_approx_age} tuổi ·{" "}
                      {stats.recommendation.viewer_gender === "F" || stats.recommendation.viewer_gender === "female" ? "Nữ" : "Nam"}
                    </span>
                  </div>
                )}
                <div className="hidden md:flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                  <span>●</span>
                  <span>Camera Tracking ON</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
