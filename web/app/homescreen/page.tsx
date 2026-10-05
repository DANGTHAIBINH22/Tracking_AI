"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { API_BASE, api, mediaUrl } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { useCameraIngest } from "@/lib/useCameraIngest";
import {
} from "@/components/icons/Icons";
import { MacOSDock } from "@/components/homescreen/MacOSDock";
import { DevicePairingModal } from "@/components/homescreen/DevicePairingModal";
import { TrackingSettingsModal } from "@/components/homescreen/TrackingSettingsModal";
import { genderLabel } from "@/lib/taxonomy";

type DisplayMode = "auto" | "pip";
type PipPosition = "bottom-right" | "top-right" | "bottom-left" | "top-left";
type PipSize = "small" | "medium" | "large";

export default function HomeScreenPage() {
  const { stats } = useLive();
  const [displayMode, setDisplayMode] = useState<DisplayMode>("auto");
  const [pipPosition, setPipPosition] = useState<PipPosition>("bottom-right");
  const [pipSize, setPipSize] = useState<PipSize>("medium");
  const [showHud, setShowHud] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isKioskLocked, setIsKioskLocked] = useState(true);

  // Modals state
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // ---------- DEVICE PAIRING / CONNECTION STATE ----------
  const [screenToken, setScreenToken] = useState<string | null>(null);
  const [screenInfo, setScreenInfo] = useState<{
    id?: number | null;
    name: string | null;
    location: string | null;
    playlist_id?: number | null;
    playlist_name?: string | null;
    /** This screen's playlist is the one on air (see api.verifyScreenToken). */
    on_air?: boolean;
    user_id?: number | null;
    account_name?: string | null;
    account_username?: string | null;
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

    // Both branches end in one promise, so `loadingToken` is cleared from a
    // callback rather than synchronously inside this effect.
    const checked = savedToken
      ? api
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
              on_air: Boolean(res.on_air),
              user_id: res.user_id ?? null,
              account_name: res.account_name || null,
              account_username: res.account_username || null,
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
      : Promise.resolve();
    checked.finally(() => setLoadingToken(false));
  }, []);

  // Periodic poll to synchronize screen assignment (playlist_id, name, location, account)
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
                prev?.on_air === Boolean(res.on_air) &&
                prev?.name === res.name &&
                prev?.location === res.location &&
                prev?.id === res.id &&
                prev?.account_name === res.account_name &&
                prev?.account_username === res.account_username
              ) {
                return prev;
              }
              return {
                id: res.id ?? null,
                name: res.name || null,
                location: res.location || null,
                playlist_id: res.playlist_id ?? null,
                playlist_name: res.playlist_name || null,
                on_air: Boolean(res.on_air),
                user_id: res.user_id ?? null,
                account_name: res.account_name || null,
                account_username: res.account_username || null,
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
    if (loadingToken || screenToken || pairingCode) return;
    let ignore = false;
    api
      .registerScreenCode()
      .then((res) => {
        if (ignore) return;
        setPairingCode(res.pairing_code);
        setCodeExpiresAt(res.expires_at);
      })
      .catch((err) => console.error("Lỗi lấy mã ghép nối:", err));
    return () => {
      ignore = true;
    };
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
          api.verifyScreenToken(res.screen_token).then((data) => {
            if (data.valid) {
              setScreenInfo({
                id: data.id ?? null,
                name: data.name || res.name || null,
                location: data.location || res.location || null,
                playlist_id: data.playlist_id ?? null,
                playlist_name: data.playlist_name || null,
                on_air: Boolean(data.on_air),
                user_id: data.user_id ?? null,
                account_name: data.account_name || null,
                account_username: data.account_username || null,
              });
            }
          });
          setIsPairingModalOpen(false);
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
      setIsPairingModalOpen(false);
    }
  };

  // Device must be connected (paired token) to allow tracking and playback
  const isDeviceConnected = Boolean(screenToken);
  const hasPlaylistAssigned = Boolean(screenInfo?.playlist_id);
  // One playlist airs system-wide. Unless it is this screen's, the screen must
  // neither show it (another account's adverts) nor feed its camera into the
  // engine (this room's viewers would be credited to that account's airing).
  const isOnAir = Boolean(hasPlaylistAssigned && screenInfo?.on_air);

  // Camera Ingest: Actively captures when tracking is running
  const isCaptureRunning = Boolean(stats?.running);
  const isBrowserIngestActive = Boolean(isCaptureRunning && stats?.mode === "browser");
  const { videoRef, state: ingestState } = useCameraIngest(isBrowserIngestActive);

  // Stream cache-busting key: forces reconnect when source or running state switches
  // Bumped during render whenever any of the three changes (React's "adjust
  // state on prop change"), instead of from an effect after a stale paint.
  const [streamKey, setStreamKey] = useState<number>(() => Date.now());
  const streamSig = `${stats?.source}|${stats?.running}|${stats?.mode}`;
  const [seenStreamSig, setSeenStreamSig] = useState(streamSig);
  if (streamSig !== seenStreamSig) {
    setSeenStreamSig(streamSig);
    setStreamKey((k) => k + 1);
  }

  const nowPlaying = stats?.now_playing ?? null;
  // STRICT RULE: Playlist playback is ONLY permitted when device is connected AND selected to play a playlist
  const isPlaying = Boolean(
    isDeviceConnected && isOnAir && nowPlaying?.playing && nowPlaying.creative
  );
  const creative = nowPlaying?.creative ?? null;

  const toggleTracking = async () => {
    try {
      setStreamKey(Date.now());
      if (stats?.running) {
        await api.captureStop();
      } else {
        const scrId = typeof screenInfo?.id === "number" ? screenInfo.id : undefined;
        await api.captureStart("browser", String(screenInfo?.id || "browser"), scrId);
      }
      setStreamKey(Date.now());
    } catch (err) {
      console.error("Lỗi điều khiển tracking:", err);
    }
  };

  // Fullscreen helper
  const enterFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => undefined);
      setIsFullscreen(true);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      enterFullscreen();
    } else {
      document.exitFullscreen?.().catch(() => undefined);
      setIsFullscreen(false);
    }
  };

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // KIOSK LOCK: Block exiting or automatically re-enter fullscreen on user interaction
  useEffect(() => {
    if (!isKioskLocked) return;

    const handleGlobalInteraction = () => {
      // Re-enter fullscreen whenever user touches / clicks anywhere if currently not fullscreen
      if (!document.fullscreenElement) {
        enterFullscreen();
      }
    };

    window.addEventListener("click", handleGlobalInteraction);
    window.addEventListener("touchstart", handleGlobalInteraction);
    return () => {
      window.removeEventListener("click", handleGlobalInteraction);
      window.removeEventListener("touchstart", handleGlobalInteraction);
    };
  }, [isKioskLocked]);

  // Block context menu (right-click) for authentic Kiosk presentation
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  // Auto-hide controls when idle
  const handleMouseMove = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      // Do not hide if any modal is open
      if (!isPairingModalOpen && !isSettingsModalOpen) {
        setControlsVisible(false);
      }
    }, 4000);
  };

  // Keyboard shortcuts
  // Keyboard shortcuts. An effect event always sees the latest handlers and
  // modal flags, so the listener is attached once instead of on every change.
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === "f") {
      toggleFullscreen();
    } else if (key === "h") {
      setShowHud((v) => !v);
    } else if (key === "m") {
      setIsMuted((v) => !v);
    } else if (key === "p") {
      setDisplayMode((v) => (v === "pip" ? "auto" : "pip"));
    } else if (key === "t") {
      toggleTracking();
    } else if (key === "s") {
      setIsSettingsModalOpen((v) => !v);
    } else if (key === "c") {
      setIsPairingModalOpen((v) => !v);
    } else if (e.key === "Escape") {
      if (isPairingModalOpen) setIsPairingModalOpen(false);
      else if (isSettingsModalOpen) setIsSettingsModalOpen(false);
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
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


  // Helper for PiP positioning
  const getPipPositionClass = () => {
    switch (pipPosition) {
      case "top-right":
        return "top-18 right-6";
      case "bottom-left":
        return "bottom-24 left-6";
      case "top-left":
        return "top-18 left-6";
      case "bottom-right":
      default:
        return "bottom-24 right-6";
    }
  };

  const getPipSizeClass = () => {
    switch (pipSize) {
      case "small":
        return "w-64";
      case "large":
        return "w-96";
      case "medium":
      default:
        return "w-80";
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={() => {
        if (isKioskLocked && !isFullscreen) enterFullscreen();
      }}
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
      {/* 2. MAIN SCREEN CANVAS                                     */}
      {/* ========================================================= */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center">
        {/* CASE 1: PLAYING MEDIA (Active Playlist with Creative) */}
        {isPlaying && creative ? (
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
            ) : creative.kind === "web" ? (
              // A web creative's url is the page itself; as an <img> it
              // rendered a broken-image icon for the whole airing.
              <iframe
                key={nowPlaying?.airing_id ?? creative.id}
                src={creative.url}
                title={creative.name}
                className="h-full w-full border-0 bg-white"
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
          /* CASE 2: VISUAL PRODUCT SHOWCASE (Image-driven presentation, no heavy text or buttons) */
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden animate-in fade-in duration-700">
            {/* Ambient Background Aura */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 z-10" />

            {/* Showcase Hero Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/smart_signage_showcase.jpg"
              alt="Tracking AI Smart Signage Showcase"
              className="w-full h-full object-cover select-none"
            />
          </div>
        )}


        {/* --- OPTIONAL PiP WINDOW: Live AI Bounding Box Stream --- */}
        {displayMode === "pip" && (
          <div
            className={`absolute ${getPipPositionClass()} z-20 ${getPipSizeClass()} aspect-video rounded-2xl overflow-hidden border-2 border-emerald-500/60 shadow-2xl bg-black backdrop-blur-md transition-all duration-300 hover:scale-105`}
          >
            {/* Top Bar inside Preview */}
            <div className="absolute top-2 inset-x-2 z-10 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md text-[10px] text-emerald-300 font-mono border border-emerald-500/30 shadow-md">
                <span className={`h-1.5 w-1.5 rounded-full ${(isCaptureRunning || stats?.running) ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                <span>Camera Tracking {(isCaptureRunning || stats?.running) ? "ON" : "STANDBY"}</span>
              </div>
              <div className="px-2 py-1 rounded-lg bg-black/80 backdrop-blur-md text-[10px] text-zinc-300 font-mono border border-white/10 shadow-md">
                {stats?.mode === "server" ? "Video Server" : "Webcam Kiosk"}
              </div>
            </div>

            {/* Video / Camera Feed */}
            {(isCaptureRunning || stats?.running) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${stats?.source}-${streamKey}`}
                src={`${API_BASE}/api/capture/stream.mjpg?t=${streamKey}`}
                alt="Camera AI PiP"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-500 bg-zinc-900">
                Đang khởi động camera AI...
              </div>
            )}

            {/* Bottom Bar inside Preview: Audience metrics */}
            <div className="absolute bottom-2 inset-x-2 z-10 px-2.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 flex items-center justify-between text-[11px] shadow-lg pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-[10px]">Khán giả:</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {stats?.people_now ?? 0}
                </span>
              </div>

              <div className="h-3 w-px bg-white/20" />

              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-[10px]">Đang nhìn:</span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    (stats?.attentive_now ?? 0) > 0 ? "text-emerald-400 animate-pulse" : "text-zinc-300"
                  }`}
                >
                  {stats?.attentive_now ?? 0}
                </span>
              </div>

              {stats?.recommendation?.viewer_approx_age ? (
                <>
                  <div className="h-3 w-px bg-white/20" />
                  <div className="text-[10px] font-mono text-teal-300 truncate max-w-[80px]">
                    ~{stats.recommendation.viewer_approx_age}t · {genderLabel(stats.recommendation.viewer_gender) ?? "—"}
                  </div>
                </>
              ) : stats?.fps ? (
                <>
                  <div className="h-3 w-px bg-white/20" />
                  <span className="text-[10px] font-mono text-zinc-400">
                    {Math.round(stats.fps)} fps
                  </span>
                </>
              ) : null}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* 3. BOTTOM INFO HUD & PROGRESS BAR                         */}
      {/* ========================================================= */}
      {showHud && (
        <footer
          className={`absolute bottom-0 inset-x-0 z-20 transition-opacity duration-300 ${
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

          {/* HUD status bar (with padding bottom to not overlap dock) */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-3 pb-20 bg-gradient-to-t from-black/95 via-black/75 to-transparent text-xs text-zinc-300">
            {/* Active video metadata or connection notice */}
            <div className="flex items-center gap-3">
              {!isDeviceConnected ? (
                <span className="text-amber-400 font-medium flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Chưa kết nối thiết bị: Bấm vào Dock hoặc nút phía trên để ghép nối</span>
                </span>
              ) : !hasPlaylistAssigned ? (
                <span className="text-amber-300 font-medium flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Thiết bị đã kết nối · Vào mục Playlists để kích hoạt phát quảng cáo</span>
                </span>
              ) : !isOnAir ? (
                <span className="text-zinc-400 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-zinc-500" />
                  <span>Playlist &quot;{screenInfo?.playlist_name}&quot; đang chờ tới lượt phát</span>
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

            {/* Audience Tracking Metrics in real-time (shown in HUD only when PiP is off) */}
            {isDeviceConnected && displayMode !== "pip" && (
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Khán giả:</span>
                  <span className="font-mono font-bold text-white tabular-nums text-sm">
                    {stats?.people_now ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Đang nhìn:</span>
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
                      {genderLabel(stats.recommendation.viewer_gender) ?? "—"}
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
        </footer>
      )}

      {/* ========================================================= */}
      {/* 4. MACOS STYLE DOCK AT BOTTOM                             */}
      {/* ========================================================= */}
      <MacOSDock
        isDeviceConnected={isDeviceConnected}
        screenName={screenInfo?.name || null}
        isCaptureRunning={isCaptureRunning}
        onOpenPairingModal={() => setIsPairingModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        controlsVisible={controlsVisible}
      />

      {/* ========================================================= */}
      {/* 5. MODALS                                                 */}
      {/* ========================================================= */}
      {/* Device Pairing Modal */}
      <DevicePairingModal
        isOpen={isPairingModalOpen}
        onClose={() => setIsPairingModalOpen(false)}
        screenToken={screenToken}
        screenInfo={screenInfo}
        pairingCode={pairingCode}
        timeLeft={timeLeft}
        copiedCode={copiedCode}
        onCopyCode={handleCopyCode}
        onRefreshCode={requestNewCode}
        onConnectAdmin={handleConnectAdmin}
        onUnpair={handleUnpair}
      />

      {/* Tracking & Camera Settings Modal */}
      <TrackingSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        isCaptureRunning={isCaptureRunning}
        hasPlaylistAssigned={hasPlaylistAssigned}
        stats={stats}
        ingestState={ingestState}
        onToggleTracking={toggleTracking}
        displayMode={displayMode}
        onTogglePip={() => setDisplayMode((v) => (v === "pip" ? "auto" : "pip"))}
        pipPosition={pipPosition}
        onChangePipPosition={setPipPosition}
        pipSize={pipSize}
        onChangePipSize={setPipSize}
        showHud={showHud}
        onToggleHud={() => setShowHud((v) => !v)}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted((v) => !v)}
        isKioskLocked={isKioskLocked}
        onToggleKioskLock={() => setIsKioskLocked((v) => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  );
}
