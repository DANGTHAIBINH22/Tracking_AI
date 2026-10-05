"use client";

import React, { useState, useEffect } from "react";
import { PinSecurityModal } from "./PinSecurityModal";

interface MacOSDockProps {
  // Device state
  isDeviceConnected: boolean;
  screenName: string | null;
  // Tracking state
  isCaptureRunning: boolean;
  // Modal openers
  onOpenPairingModal: () => void;
  onOpenSettingsModal: () => void;
  // Controls
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  // Visibility
  controlsVisible: boolean;
}

export function MacOSDock({
  isDeviceConnected,
  screenName,
  isCaptureRunning,
  onOpenPairingModal,
  onOpenSettingsModal,
  isFullscreen,
  onToggleFullscreen,
  controlsVisible,
}: MacOSDockProps) {
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Auto re-lock after 5 minutes of inactivity if unlocked
  useEffect(() => {
    if (isLocked) return;

    const timer = setTimeout(() => {
      setIsLocked(true);
    }, 5 * 60 * 1000);

    return () => clearTimeout(timer);
  }, [isLocked]);

  const handleProtectedAction = (action: () => void) => {
    if (isLocked) {
      setPendingAction(() => action);
      setIsPinModalOpen(true);
    } else {
      action();
    }
  };

  const handlePinSuccess = () => {
    setIsLocked(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleToggleLock = () => {
    if (isLocked) {
      setPendingAction(null);
      setIsPinModalOpen(true);
    } else {
      setIsLocked(true);
    }
  };

  return (
    <>
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-out ${
          controlsVisible
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-6 pointer-events-none"
        }`}
      >
        {/* Frosted Glass Container */}
        <nav
          aria-label="macOS Dock"
          className="flex items-end gap-2.5 px-3.5 py-2.5 rounded-3xl bg-zinc-900/75 backdrop-blur-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.7)]"
        >
          {/* ITEM 1: THIẾT BỊ & GHÉP NỐI (DEVICE STATUS & PAIRING) */}
          <div
            className="group relative flex flex-col items-center"
          >
            {/* Tooltip */}
            <div className="absolute -top-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 bg-zinc-900/90 text-white border border-white/15 text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap z-50">
              {isDeviceConnected
                ? `Màn hình: ${screenName || "Homescreen"} (Đã kết nối)`
                : "Ghép nối thiết bị (Chưa kết nối)"}
              {isLocked && " 🔒"}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900/90" />
            </div>

            <button
              type="button"
              onClick={() => handleProtectedAction(onOpenPairingModal)}
              className={`relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg transition-all duration-200 ease-out group-hover:scale-115 group-hover:-translate-y-2 group-active:scale-95 cursor-pointer ${
                isDeviceConnected
                  ? "bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 text-white shadow-emerald-500/25"
                  : "bg-gradient-to-tr from-blue-600 via-indigo-500 to-amber-500 text-white shadow-blue-500/25"
              }`}
            >
              {/* TV Screen with Link Badge SVG */}
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <rect x="2" y="3.5" width="20" height="13" rx="2.5" />
                <path d="M8 20.5h8M12 16.5v4" strokeLinecap="round" />
                <path d="M10 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>

              {/* Notification Badge if not connected */}
              {!isDeviceConnected && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 border-2 border-zinc-900" />
                </span>
              )}

              {/* Lock Badge if dock is locked */}
              {isLocked && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900/90 border border-amber-400/50 text-[9px] text-amber-300 shadow">
                  🔒
                </span>
              )}
            </button>

            {/* Running Dot */}
            <span
              className={`mt-1 h-1 w-1 rounded-full ${
                isDeviceConnected
                  ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                  : "bg-amber-400 shadow-[0_0_6px_#fbbf24]"
              }`}
            />
          </div>

          {/* ITEM 2: CÀI ĐẶT TRACKING & CẢM BIẾN */}
          <div
            className="group relative flex flex-col items-center"
          >
            {/* Tooltip */}
            <div className="absolute -top-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 bg-zinc-900/90 text-white border border-white/15 text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap z-50">
              Cài đặt thiết bị &amp; cảm biến {isCaptureRunning ? "(Đang bật)" : "(Tắt)"}
              {isLocked && " 🔒"}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900/90" />
            </div>

            <button
              type="button"
              onClick={() => handleProtectedAction(onOpenSettingsModal)}
              className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 text-white shadow-lg shadow-purple-500/25 transition-all duration-200 ease-out group-hover:scale-115 group-hover:-translate-y-2 group-active:scale-95 cursor-pointer"
            >
              {/* Camera Settings SVG */}
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <circle cx="9" cy="12" r="2" fill="currentColor" opacity={0.6} />
              </svg>

              {/* Glowing dot on icon if tracking is running */}
              {isCaptureRunning && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
              )}

              {/* Lock Badge if dock is locked */}
              {isLocked && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900/90 border border-amber-400/50 text-[9px] text-amber-300 shadow">
                  🔒
                </span>
              )}
            </button>

            {/* Running Dot */}
            <span
              className={`mt-1 h-1 w-1 rounded-full ${
                isCaptureRunning
                  ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                  : "bg-white/80"
              }`}
            />
          </div>

          {/* DOCK SEPARATOR */}
          <div className="h-9 w-px bg-white/15 my-auto mx-1" />

          {/* ITEM 3: SECURITY PIN LOCK TOGGLE */}
          <div
            className="group relative flex flex-col items-center"
          >
            <div className="absolute -top-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 bg-zinc-900/90 text-white border border-white/15 text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap z-50">
              {isLocked ? "Bảo mật: Đang khoá (Bấm mở khoá)" : "Bảo mật: Đã mở khoá (Bấm để khoá)"}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900/90" />
            </div>

            <button
              type="button"
              onClick={handleToggleLock}
              className={`relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg transition-all duration-200 ease-out group-hover:scale-115 group-hover:-translate-y-2 group-active:scale-95 cursor-pointer ${
                isLocked
                  ? "bg-gradient-to-tr from-amber-600 via-orange-600 to-rose-500 text-white shadow-amber-500/25"
                  : "bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 text-white shadow-emerald-500/25"
              }`}
            >
              {isLocked ? (
                /* Closed Lock SVG */
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="4" y="11" width="16" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              ) : (
                /* Open Lock SVG */
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="4" y="11" width="16" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 019.9-1" />
                </svg>
              )}
            </button>

            {/* Running Dot */}
            <span
              className={`mt-1 h-1 w-1 rounded-full ${
                isLocked
                  ? "bg-amber-400 shadow-[0_0_6px_#fbbf24]"
                  : "bg-emerald-400 shadow-[0_0_6px_#34d399]"
              }`}
            />
          </div>

          {/* ITEM 4: FULLSCREEN & KIOSK TOGGLE */}
          <div
            className="group relative flex flex-col items-center"
          >
            <div className="absolute -top-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 bg-zinc-900/90 text-white border border-white/15 text-[11px] font-medium px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap z-50">
              {isFullscreen ? "Thu nhỏ (F)" : "Toàn màn hình Kiosk (F)"}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900/90" />
            </div>

            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 ease-out group-hover:scale-115 group-hover:-translate-y-2 group-active:scale-95 cursor-pointer ${
                isFullscreen
                  ? "bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 text-white shadow-lg shadow-emerald-500/25"
                  : "bg-gradient-to-tr from-slate-700 via-zinc-600 to-zinc-500 text-white shadow-lg shadow-slate-700/20"
              }`}
            >
              {isFullscreen ? (
                // Contract Icon
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                // Expand Fullscreen Icon
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
            </button>

            {/* Running Dot if fullscreen */}
            <span
              className={`mt-1 h-1 w-1 rounded-full ${
                isFullscreen ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-transparent"
              }`}
            />
          </div>
        </nav>
      </div>

      {/* PIN Security Modal */}
      <PinSecurityModal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={handlePinSuccess}
      />
    </>
  );
}
