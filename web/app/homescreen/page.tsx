"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE, api, mediaUrl } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { useCameraIngest } from "@/lib/useCameraIngest";

type DisplayMode = "auto" | "pip";

export default function HomeScreenPage() {
  const { stats, connected } = useLive();
  const [displayMode, setDisplayMode] = useState<DisplayMode>("auto");
  const [showHud, setShowHud] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Camera Ingest: Only actively captures when tracking is running
  const isCaptureRunning = Boolean(stats?.running);
  const { videoRef, state: cameraState } = useCameraIngest(isCaptureRunning);

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nowPlaying = stats?.now_playing ?? null;
  const isPlaying = Boolean(nowPlaying?.playing && nowPlaying.creative);
  const creative = nowPlaying?.creative ?? null;

  const toggleTracking = async () => {
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
  }, [isCaptureRunning]);

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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs">
            TV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-wide">Homescreen Display</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  connected
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                  }`}
                />
                {connected ? "Đang nhận tín hiệu" : "Mất kết nối..."}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Phát <strong className="text-emerald-400">Vòng lặp Playlist liên tục (Infinite Loop)</strong> từ trang <strong>/ads</strong>
            </p>
          </div>
        </div>

        {/* Right: Actions (Tracking, PiP, Sound, HUD, Fullscreen) */}
        <div className="flex items-center gap-2">
          {/* Tracking control toggle button */}
          <button
            type="button"
            onClick={toggleTracking}
            title="Bật/Tắt hệ thống AI tracking camera (T)"
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
              isCaptureRunning
                ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-white"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isCaptureRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
              }`}
            />
            <span>{isCaptureRunning ? "Tracking: Đang chạy" : "Tracking: Đã dừng"}</span>
          </button>

          {/* PiP AI Camera Toggle */}
          <button
            type="button"
            onClick={() => setDisplayMode((v) => (v === "pip" ? "auto" : "pip"))}
            title="Bật/Tắt cửa sổ xem Camera AI nhận diện khuôn mặt (P)"
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${
              displayMode === "pip"
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <span>Camera AI PiP</span>
          </button>

          {/* Audio toggle */}
          <button
            type="button"
            onClick={() => setIsMuted((v) => !v)}
            title={isMuted ? "Bật âm thanh (M)" : "Tắt âm thanh (M)"}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            <span>{isMuted ? "Muted" : "Sound ON"}</span>
          </button>

          {/* Toggle HUD button */}
          <button
            type="button"
            onClick={() => setShowHud((v) => !v)}
            title="Ẩn/hiện thanh chỉ số người xem (H)"
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs transition ${
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
            className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            <span>{isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. MAIN SCREEN AREA                                       */}
      {/* ========================================================= */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center">
        {/* CASE 1: Active Video/Creative projected from /ads */}
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
          /* CASE 2: Standby - Waiting for admin to choose & play a video from /ads */
          <div className="flex flex-col items-center justify-center px-6 text-center max-w-lg z-10 space-y-6">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-36 w-36 rounded-full bg-emerald-500/15 blur-2xl animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-900 border border-zinc-800 text-xl font-bold text-emerald-400 shadow-2xl">
                TV
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-4 py-1.5 text-xs font-semibold text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span>Homescreen đang chờ phát Vòng lặp</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Màn Hình Trình Chiếu Homescreen
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Màn hình này phát danh sách quảng cáo theo chế độ <strong className="text-emerald-400">Vòng lặp tuần hoàn liên tục (Infinite Loop 24/7)</strong> từ trang <strong>Quản lý quảng cáo (/ads)</strong>. Tự động chuyển tuần tự từ clip đầu đến clip cuối rồi lặp lại vô tận.
              </p>
            </div>

            <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-left text-xs space-y-2.5 backdrop-blur-md">
              <p className="font-semibold text-zinc-200">Cách bắt đầu phát Playlist lên Homescreen:</p>
              <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-zinc-400">
                <li>
                  Mở trang <strong className="text-white">Quản lý Playlist</strong> tại đường dẫn:{" "}
                  <a href="/playlists" target="_blank" className="text-emerald-400 underline font-mono">
                    /playlists
                  </a>
                </li>
                <li>
                  Chọn Playlist bạn muốn phát và bấm nút{" "}
                  <strong className="text-emerald-400">&quot;Phát Playlist này lên Homescreen&quot;</strong>.
                </li>
                <li>
                  Màn hình Homescreen sẽ lập tức xoay tua phát lặp đi lặp lại tất cả các clip trong playlist và camera AI liên tục đo lường khán giả xem quảng cáo!
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* --- OPTIONAL PiP WINDOW: Live AI Bounding Box Stream --- */}
        {displayMode === "pip" && (
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
          {creative && creative.duration > 0 && (
            <div className="w-full bg-zinc-800/80 h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* HUD status bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent text-xs text-zinc-300">
            {/* Active video metadata */}
            <div className="flex items-center gap-3">
              {creative ? (
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
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Đang chờ chọn video từ trang /ads...</span>
                </span>
              )}
            </div>

            {/* Audience Tracking Metrics in real-time */}
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
          </div>
        </div>
      )}
    </div>
  );
}
