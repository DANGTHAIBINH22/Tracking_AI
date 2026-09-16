"use client";

import React, { useEffect, useState } from "react";
import { PlaylistPublic, ScreenPublic, api } from "@/lib/api";
import { IconCheck, IconClose, IconDevices, IconExternal, IconTV } from "@/components/icons/Icons";

interface SelectScreenModalProps {
  playlist: PlaylistPublic;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SelectScreenModal({
  playlist,
  onClose,
  onSuccess,
}: SelectScreenModalProps) {
  const [screens, setScreens] = useState<ScreenPublic[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Get stored user or fetch from api.me
    const stored = typeof window !== "undefined" ? localStorage.getItem("admin_user") : null;
    if (stored) {
      try {
        setCurrentUser(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
    api.me().then((u) => setCurrentUser(u)).catch(() => {
      if (!stored) {
        setCurrentUser({ full_name: "Quản trị viên", username: "admin", role: "admin" });
      }
    });
  }, []);

  useEffect(() => {
    let ignore = false;
    api
      .listScreens()
      .then((data) => {
        if (!ignore) {
          const paired = data.filter((s) => s.status === "paired");
          setScreens(paired);

          // Pre-select screens already assigned to this playlist
          const initial = new Set<number>();
          paired.forEach((s) => {
            if (
              s.playlist_id === playlist.id ||
              playlist.assigned_screen_ids?.includes(s.id)
            ) {
              initial.add(s.id);
            }
          });
          // If none were assigned yet but there are screens and this playlist was active, select all by default
          if (initial.size === 0 && playlist.is_active && paired.length > 0) {
            paired.forEach((s) => initial.add(s.id));
          }
          setSelectedIds(initial);
        }
      })
      .catch((err) => {
        if (!ignore) setError((err as Error).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [playlist]);

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(screens.map((s) => s.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleConfirmPublish = async () => {
    if (selectedIds.size === 0) {
      setError("Vui lòng chọn ít nhất 1 thiết bị để phát Playlist.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.activatePlaylist(playlist.id, Array.from(selectedIds));
      await api.playerStart().catch(() => undefined);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm(`Dừng phát playlist "${playlist.name}" trên tất cả thiết bị?`)) return;
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

  const isCurrentlyPlaying =
    playlist.is_active || (playlist.assigned_screen_ids && playlist.assigned_screen_ids.length > 0);

  const accountDisplayName = currentUser?.full_name || currentUser?.username || "Quản trị viên";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold shadow-2xs">
              <IconTV className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Chọn Thiết Bị Phát Playlist
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Playlist: <strong className="text-slate-800 font-semibold">{playlist.name}</strong> ·{" "}
                <span>{playlist.item_count} tệp media</span> ·{" "}
                <span>{playlist.total_duration}s</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Account Profile Banner */}
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-50/90 via-slate-50 to-teal-50/60 border border-emerald-200/80 p-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-xs uppercase">
                {accountDisplayName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Tài khoản: {accountDisplayName}
                  </span>
                  <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {currentUser?.role === "admin" ? "Admin" : "User"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Danh sách thiết bị màn hình thuộc quyền quản lý của tài khoản này
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-xl bg-white border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 shadow-2xs">
                {screens.length} thiết bị
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p>Đang tải danh sách thiết bị của tài khoản...</p>
            </div>
          ) : screens.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600">
                <IconDevices className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tài khoản &quot;{accountDisplayName}&quot; chưa có thiết bị nào
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  Để phát Playlist, bạn cần mở <code className="font-mono text-emerald-700">/homescreen</code> trên màn hình TV và dùng tài khoản này để ghép nối thiết bị tại trang Quản trị.
                </p>
              </div>
              <a
                href="/admin"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition"
              >
                <span>Vào trang Quản trị ghép nối thiết bị (/admin)</span>
                <IconExternal className="h-3.5 w-3.5 opacity-80" />
              </a>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  Chọn thiết bị nhận phát sóng ({selectedIds.size}/{screens.length}):
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="font-medium text-emerald-700 hover:underline cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {/* Screens List */}
              <div className="space-y-2">
                {screens.map((screen) => {
                  const isChecked = selectedIds.has(screen.id);
                  const isAssignedHere =
                    screen.playlist_id === playlist.id ||
                    playlist.assigned_screen_ids?.includes(screen.id);
                  const screenOwner = screen.account_name || screen.account_username || accountDisplayName;

                  return (
                    <div
                      key={screen.id}
                      onClick={() => toggleSelectOne(screen.id)}
                      className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition cursor-pointer select-none ${
                        isChecked
                          ? "border-emerald-500/60 bg-emerald-50/50 shadow-xs"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(screen.id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
                        />
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl border font-bold text-xs transition ${
                            isChecked
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                              : "bg-slate-100 border-slate-200 text-slate-500"
                          }`}
                        >
                          <IconTV className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900">
                              {screen.name || `Màn hình #${screen.id}`}
                            </h4>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Online
                            </span>
                            <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              Tài khoản: {screenOwner}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {screen.location ? `Vị trí: ${screen.location}` : "Chưa đặt vị trí"}
                          </p>
                        </div>
                      </div>

                      {/* Right Status Badge */}
                      <div className="text-right">
                        {isAssignedHere ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100/70 border border-emerald-300 px-2 py-1 text-[10px] font-bold text-emerald-800">
                            <IconCheck className="h-3 w-3" />
                            <span>Đang phát playlist này</span>
                          </span>
                        ) : screen.playlist_name ? (
                          <span className="inline-block rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-medium text-amber-800">
                            Đang phát: <strong className="font-semibold">{screen.playlist_name}</strong>
                          </span>
                        ) : (
                          <span className="inline-block rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] text-slate-500">
                            Sẵn sàng
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            {isCurrentlyPlaying && (
              <button
                type="button"
                disabled={busy}
                onClick={handleDeactivate}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50 cursor-pointer"
              >
                Dừng phát trên tất cả thiết bị
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={busy || screens.length === 0}
              onClick={handleConfirmPublish}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span>Phát Lên {selectedIds.size} Thiết Bị</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
