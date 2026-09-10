"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { IconPause, IconPlay } from "@/components/icons/Icons";

interface TrackingControlButtonProps {
  className?: string;
  showFps?: boolean;
  source?: string;
}

export function TrackingControlButton({
  className = "",
  showFps = true,
  source,
}: TrackingControlButtonProps) {
  const { stats } = useLive();
  const [busy, setBusy] = useState(false);
  const [localRunning, setLocalRunning] = useState<boolean | null>(null);

  // Sync initial state from captureState API
  useEffect(() => {
    let ignore = false;
    api
      .captureState()
      .then((st) => {
        if (!ignore) {
          setLocalRunning(st.running);
        }
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  // stats.running from websocket takes precedence when available
  const isRunning = stats !== null ? stats.running : (localRunning ?? false);
  const fps = stats?.fps ?? 0;

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    setBusy(true);
    try {
      if (isRunning) {
        await api.captureStop();
        setLocalRunning(false);
      } else {
        await api.captureStart(source);
        setLocalRunning(true);
      }
    } catch (err) {
      console.error("Lỗi khi điều khiển tracking:", err);
    } finally {
      setBusy(false);
    }
  };

  if (isRunning) {
    return (
      <button
        onClick={handleToggle}
        disabled={busy}
        title="Bấm để tạm dừng tracking camera"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 hover:border-emerald-400 disabled:opacity-50 ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600"></span>
        </span>
        <IconPause className="h-3.5 w-3.5" />
        <span>{busy ? "Đang dừng..." : "Tạm dừng tracking"}</span>
        {showFps && fps > 0 && (
          <span className="ml-1 rounded border border-emerald-200/60 bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">
            {fps.toFixed(0)} FPS
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      title="Bấm để bắt đầu tracking camera"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-700 disabled:opacity-50 ${className}`}
    >
      <IconPlay className="h-3.5 w-3.5" />
      <span>{busy ? "Đang bật..." : "Bắt đầu tracking"}</span>
    </button>
  );
}
