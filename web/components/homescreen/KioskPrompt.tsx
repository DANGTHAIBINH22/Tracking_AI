"use client";

import React from "react";

interface KioskPromptProps {
  isFullscreen: boolean;
  isKioskLocked: boolean;
  onRequestFullscreen: () => void;
}

export function KioskPrompt({
  isFullscreen,
  isKioskLocked,
  onRequestFullscreen,
}: KioskPromptProps) {
  if (isFullscreen || !isKioskLocked) return null;

  return (
    <div
      onClick={onRequestFullscreen}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 cursor-pointer animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-amber-500/20 backdrop-blur-xl border border-amber-500/40 text-amber-200 shadow-2xl shadow-amber-950/50 hover:bg-amber-500/30 transition-all active:scale-98">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
        </span>
        <div className="text-xs font-semibold">
          Chế độ Kiosk Toàn Màn Hình · Chạm vào đây hoặc màn hình để kích hoạt (F)
        </div>
        <div className="px-2 py-0.5 rounded-lg bg-amber-400/20 text-[10px] font-bold text-amber-300 uppercase">
          Kích hoạt
        </div>
      </div>
    </div>
  );
}
