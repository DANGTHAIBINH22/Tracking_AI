"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { CircleAlert, MonitorOff, Radio, Tv } from "lucide-react";
import { PlaylistPublic, ScreenPublic, api } from "@/lib/api";
import { IconClose, IconExternal } from "@/components/icons/Icons";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Checkbox } from "@/components/motion/checkbox";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

interface SelectScreenModalProps {
  playlist: PlaylistPublic;
  onClose: () => void;
  onSuccess: () => void;
}

function formatDuration(sec: number) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}p ${s % 60 ? `${s % 60}s` : ""}`.trim();
}

/** What the screen is actually showing, in the order an operator cares. */
function screenState(screen: ScreenPublic, playlistId: number) {
  if (screen.playlist_id === playlistId && screen.playlist_on_air)
    return { tone: "success" as const, text: "Đang phát playlist này" };
  if (screen.playlist_id === playlistId) return { tone: "warning" as const, text: "Đã gán · đang dừng" };
  if (screen.playlist_name && screen.playlist_on_air)
    return { tone: "info" as const, text: `Đang phát: ${screen.playlist_name}` };
  // Assigned to a playlist that is not on air: the screen is idle, and saying
  // "Đang phát" here is how a black screen used to look healthy.
  if (screen.playlist_name) return { tone: "neutral" as const, text: `Đã gán "${screen.playlist_name}" · không phát` };
  return { tone: "neutral" as const, text: "Chưa gán playlist" };
}

export default function SelectScreenModal({ playlist, onClose, onSuccess }: SelectScreenModalProps) {
  const reduce = useReducedMotion();
  const [screens, setScreens] = useState<ScreenPublic[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    api
      .listScreens()
      .then((data) => {
        if (ignore) return;
        const paired = data.filter((s) => s.status === "paired");
        setScreens(paired);
        // Start from what this playlist already reaches; with a single screen
        // there is nothing to choose, so it starts ticked.
        const initial = new Set(paired.filter((s) => s.playlist_id === playlist.id).map((s) => s.id));
        if (initial.size === 0 && paired.length === 1) initial.add(paired[0].id);
        setSelectedIds(initial);
      })
      .catch((err) => !ignore && setError((err as Error).message))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [playlist.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const toggle = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isEmpty = playlist.item_count === 0;
  const isOnAir = playlist.is_active;
  const selectedOffline = screens.filter((s) => selectedIds.has(s.id) && !s.online).length;
  const allSelected = screens.length > 0 && selectedIds.size === screens.length;

  const publish = async () => {
    if (!selectedIds.size) {
      setError("Chọn ít nhất 1 thiết bị để phát playlist.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // activate starts the player itself; no separate start call is needed.
      await api.activatePlaylist(playlist.id, Array.from(selectedIds));
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!confirm(`Dừng phát "${playlist.name}" trên tất cả thiết bị?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deactivatePlaylist(playlist.id);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      onClick={() => !busy && onClose()}
      className="fixed inset-0 z-9999 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="my-8 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              <Radio className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="publish-title" className="text-sm font-bold text-slate-900">
                Phát lên thiết bị
              </h2>
              <p className="truncate text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{playlist.name}</span> · {playlist.item_count} media ·{" "}
                {formatDuration(playlist.total_duration)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          {isEmpty && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Playlist chưa có media nào. Thêm nội dung trong trình sửa trước khi phát.
            </p>
          )}
          {!isOnAir && !isEmpty && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Hệ thống phát <strong className="text-slate-700">một playlist tại một thời điểm</strong>. Phát playlist này
              sẽ dừng playlist đang phát hiện tại; những màn hình vẫn gán playlist cũ sẽ đứng yên cho tới khi được gán lại.
            </p>
          )}

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400">
              <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              Đang tải danh sách thiết bị…
            </div>
          ) : screens.length === 0 ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <MonitorOff className="mx-auto h-7 w-7 text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Chưa có thiết bị nào được ghép nối</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                  Mở <code className="font-mono text-emerald-700">/homescreen</code> trên màn hình TV, rồi nhập mã hiển thị
                  ở trang Quản trị.
                </p>
              </div>
              <a
                href="/admin"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Ghép nối thiết bị <IconExternal className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-0.5 text-xs">
                <span className="font-semibold text-slate-700">
                  Thiết bị · {selectedIds.size}/{screens.length} đã chọn
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(allSelected ? new Set() : new Set(screens.map((s) => s.id)))}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              </div>

              <ul className="space-y-1.5">
                {screens.map((screen) => {
                  const checked = selectedIds.has(screen.id);
                  const state = screenState(screen, playlist.id);
                  return (
                    <li key={screen.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggle(screen.id)}
                        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle(screen.id))}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition select-none",
                          checked ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 hover:border-slate-300",
                        )}
                      >
                        <span onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(screen.id)}
                            aria-label={`Chọn ${screen.name || `màn hình #${screen.id}`}`}
                          />
                        </span>
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            screen.online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400",
                          )}
                        >
                          <Tv className="h-4.5 w-4.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-900">
                            <span className="truncate">{screen.name || `Màn hình #${screen.id}`}</span>
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                screen.online ? "bg-emerald-500" : "bg-slate-300",
                              )}
                              aria-hidden
                            />
                            <span className={cn("text-[10px] font-medium", screen.online ? "text-emerald-700" : "text-slate-400")}>
                              {screen.online ? "Online" : "Offline"}
                            </span>
                          </p>
                          <p className="truncate text-[11px] text-slate-500">{screen.location || "Chưa đặt vị trí"}</p>
                        </div>
                        <AnimatedBadge size="sm" status={state.tone} showIcon={false} className="max-w-[45%] shrink-0 truncate">
                          {state.text}
                        </AnimatedBadge>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {selectedOffline > 0 && (
                <p className="px-0.5 text-[11px] text-slate-500">
                  {selectedOffline} thiết bị đang offline sẽ bắt đầu phát khi được mở lại.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <div>
            {isOnAir && (
              <button
                type="button"
                disabled={busy}
                onClick={stop}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                Dừng phát
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={busy || isEmpty || screens.length === 0 || selectedIds.size === 0}
              onClick={publish}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Radio className="h-3.5 w-3.5" />
              {busy ? "Đang phát…" : `Phát lên ${selectedIds.size} thiết bị`}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
