"use client";

import React from "react";
import { LiveStats } from "@/lib/api";
import { IngestState } from "@/lib/useCameraIngest";
import { genderLabel } from "@/lib/taxonomy";

interface TrackingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Tracking states
  isCaptureRunning: boolean;
  hasPlaylistAssigned: boolean;
  stats: LiveStats | null;
  ingestState?: IngestState;
  onToggleTracking: () => void;
  // PiP states
  displayMode: "auto" | "pip";
  onTogglePip: () => void;
  pipPosition: "bottom-right" | "top-right" | "bottom-left" | "top-left";
  onChangePipPosition: (pos: "bottom-right" | "top-right" | "bottom-left" | "top-left") => void;
  pipSize: "small" | "medium" | "large";
  onChangePipSize: (size: "small" | "medium" | "large") => void;
  // HUD states
  showHud: boolean;
  onToggleHud: () => void;
  // Audio states
  isMuted: boolean;
  onToggleMute: () => void;
  // Kiosk / Fullscreen
  isKioskLocked: boolean;
  onToggleKioskLock: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function TrackingSettingsModal({
  isOpen,
  onClose,
  isCaptureRunning,
  hasPlaylistAssigned,
  stats,
  ingestState,
  onToggleTracking,
  displayMode,
  onTogglePip,
  pipPosition,
  onChangePipPosition,
  pipSize,
  onChangePipSize,
  showHud,
  onToggleHud,
  isMuted,
  onToggleMute,
  isKioskLocked,
  onToggleKioskLock,
  isFullscreen,
  onToggleFullscreen,
}: TrackingSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* macOS Style Window */}
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-white/15 bg-zinc-900/95 backdrop-blur-2xl shadow-2xl text-white overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* macOS Titlebar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-800/40">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-3 w-3 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors"
              title="Đóng"
            />
            <div className="h-3 w-3 rounded-full bg-amber-500/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
            <span className="ml-2 text-xs font-medium text-zinc-300">
              Cài Đặt Thiết Bị &amp; Cảm Biến
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span
              className={`h-2 w-2 rounded-full ${
                isCaptureRunning ? "bg-emerald-400" : "bg-zinc-600"
              }`}
            />
            <span>{isCaptureRunning ? "Cảm biến đang chạy" : "Cảm biến tắt"}</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* GROUP 1: CẢM BIẾN & THU THẬP */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Cảm biến &amp; Phân tích
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-800/40 divide-y divide-white/5 overflow-hidden">
              {/* Row 1: Nhận diện người xem */}
              <div className="p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-100">
                        Nhận diện người xem
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Đo lường lưu lượng khán giả và thời gian chú ý trước màn hình
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isCaptureRunning}
                    onClick={onToggleTracking}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isCaptureRunning
                        ? "bg-emerald-500"
                        : "bg-zinc-700 hover:bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isCaptureRunning ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {!hasPlaylistAssigned && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-[11px] text-emerald-300">
                    Sẵn sàng: Bật công tắc để camera AI theo dõi và đếm khán giả trực tiếp trên màn hình Kiosk.
                  </div>
                )}
              </div>

              {/* Row 2: Cửa sổ xem trước camera (PiP) */}
              <div className="p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-sm">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-100">
                        Cửa sổ xem trước camera (Picture in Picture)
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Hiển thị khung hình camera thu nhỏ trực tiếp ở góc màn hình
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={displayMode === "pip"}
                    onClick={onTogglePip}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      displayMode === "pip" ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        displayMode === "pip" ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {displayMode === "pip" && (
                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-white/5">
                    <div>
                      <label className="text-zinc-400 block mb-1 text-[11px]">Vị trí hiển thị:</label>
                      <select
                        value={pipPosition}
                        onChange={(e) =>
                          onChangePipPosition(
                            e.target.value as "bottom-right" | "top-right" | "bottom-left" | "top-left"
                          )
                        }
                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-500"
                      >
                        <option value="bottom-right">Góc dưới - Phải</option>
                        <option value="top-right">Góc trên - Phải</option>
                        <option value="bottom-left">Góc dưới - Trái</option>
                        <option value="top-left">Góc trên - Trái</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-zinc-400 block mb-1 text-[11px]">Kích thước khung hình:</label>
                      <select
                        value={pipSize}
                        onChange={(e) =>
                          onChangePipSize(e.target.value as "small" | "medium" | "large")
                        }
                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-500"
                      >
                        <option value="small">Nhỏ</option>
                        <option value="medium">Tiêu chuẩn</option>
                        <option value="large">Lớn</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* GROUP 2: HIỂN THỊ & ÂM THANH */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Hiển thị &amp; Âm thanh
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-800/40 divide-y divide-white/5 overflow-hidden">
              {/* Row 1: Thanh HUD */}
              <div className="flex items-center justify-between p-3.5 gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500 text-white shadow-sm">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-100">
                      Thanh thông tin người xem (HUD)
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Hiển thị số lượng người xem và tiến trình nội dung ở cạnh dưới màn hình
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={showHud}
                  onClick={onToggleHud}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    showHud ? "bg-emerald-500" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      showHud ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Row 2: Âm thanh */}
              <div className="flex items-center justify-between p-3.5 gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-100">
                      Âm thanh phát sóng
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {isMuted ? "Đang tắt âm thanh (Muted)" : "Đang bật âm thanh"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={!isMuted}
                  onClick={onToggleMute}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    !isMuted ? "bg-emerald-500" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      !isMuted ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* GROUP 3: CHẾ ĐỘ KIOSK TOÀN MÀN HÌNH */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Chế độ hiển thị Kiosk
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-800/40 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-100">
                      Khóa toàn màn hình Kiosk
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Tự động duy trì toàn màn hình khi người dùng chạm hoặc tương tác
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isKioskLocked}
                  onClick={onToggleKioskLock}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isKioskLocked ? "bg-emerald-500" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isKioskLocked ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                <span className="text-zinc-400">
                  Trạng thái:{" "}
                  <span className={isFullscreen ? "text-emerald-400 font-medium" : "text-zinc-300"}>
                    {isFullscreen ? "Toàn màn hình" : "Cửa sổ thu nhỏ"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200 transition cursor-pointer"
                >
                  {isFullscreen ? "Thoát toàn màn hình tạm thời" : "Vào toàn màn hình"}
                </button>
              </div>
            </div>
          </div>

          {/* GROUP 4: THÔNG SỐ VẬN HÀNH THỜI GIAN THỰC */}
          <div className="space-y-1.5">
            <div className="px-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Thông số vận hành trực tiếp
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-800/30 p-3.5 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                  <span className="text-[10px] text-zinc-400 block font-medium">Người quan sát</span>
                  <span className="font-mono text-xl font-semibold text-zinc-100 tabular-nums">
                    {stats?.people_now ?? 0}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                  <span className="text-[10px] text-zinc-400 block font-medium">Đang nhìn màn hình</span>
                  <span className="font-mono text-xl font-semibold text-emerald-400 tabular-nums">
                    {stats?.attentive_now ?? 0}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                  <span className="text-[10px] text-zinc-400 block font-medium">Tốc độ khung hình</span>
                  <span className="font-mono text-xl font-semibold text-zinc-100 tabular-nums">
                    {stats?.fps ? `${stats.fps.toFixed(1)} fps` : "0.0 fps"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                  <span className="text-[10px] text-zinc-400 block font-medium">Trạng thái Ingest</span>
                  <span className="font-mono text-xs font-semibold text-zinc-300 mt-1 block uppercase truncate">
                    {ingestState?.phase || "Standby"}
                  </span>
                </div>
              </div>

              {stats?.recommendation?.viewer_approx_age && (
                <div className="flex items-center justify-between text-xs px-1 text-zinc-400">
                  <span>Nhận diện gần nhất:</span>
                  <span className="text-zinc-200 font-medium">
                    ~{stats.recommendation.viewer_approx_age} tuổi ·{" "}
                    {genderLabel(stats.recommendation.viewer_gender) ?? "—"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* macOS Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-zinc-800/30 flex items-center justify-between text-xs text-zinc-400">
          <span className="text-[11px] text-zinc-500">
            Phím tắt: F (Toàn màn hình) · P (Cửa sổ PiP) · M (Âm thanh)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
