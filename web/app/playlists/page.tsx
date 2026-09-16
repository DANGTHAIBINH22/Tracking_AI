"use client";

import {
  PlaylistPublic,
  api,
  mediaUrl,
} from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconDevices, IconPlaylist, IconPlus, IconTV } from "@/components/icons/Icons";
import SelectScreenModal from "@/components/SelectScreenModal";

export default function PlaylistsListPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<PlaylistPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [sortField, setSortField] = useState<"name" | "item_count" | "created_at">("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Action Menu Open
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  // Screen selection publish modal
  const [screenModalPlaylist, setScreenModalPlaylist] = useState<PlaylistPublic | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listPlaylists();
      setPlaylists(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const closeMenu = () => setActiveMenuId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

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

  const handleActivate = (plOrId: PlaylistPublic | number) => {
    if (typeof plOrId === "number") {
      const found = playlists.find((p) => p.id === plOrId);
      if (found) setScreenModalPlaylist(found);
    } else if (plOrId) {
      setScreenModalPlaylist(plOrId);
    }
  };

  const handleDelete = async (pl: PlaylistPublic) => {
    if (!confirm(`Xoá playlist "${pl.name}"? (Các tệp media trong kho vẫn được giữ nguyên)`)) return;
    act(async () => {
      await api.deletePlaylist(pl.id);
      setInfo(`Đã xoá playlist "${pl.name}".`);
      setTimeout(() => setInfo(null), 3500);
    });
  };

  const handleDuplicate = async (pl: PlaylistPublic) => {
    act(async () => {
      const copy = await api.createPlaylist({
        name: `${pl.name} (Bản sao)`,
        description: pl.description,
        kind: pl.kind || "default",
        aspect_ratio: pl.aspect_ratio || "FullHD Nghiêng",
        sync_playback: pl.sync_playback,
        fit_screen: pl.fit_screen,
      });
      // Copy items
      const full = await api.getPlaylist(pl.id);
      for (const it of full.items) {
        await api.addPlaylistItem(copy.id, it.creative_id, it.duration);
      }
      setInfo(`Đã nhân bản thành "${copy.name}"!`);
      setTimeout(() => setInfo(null), 4000);
    });
  };

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPlaylists.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlaylists.map((p) => p.id)));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter & Sort
  const filteredPlaylists = useMemo(() => {
    return playlists
      .filter((p) => {
        const matchesName = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesKind =
          filterKind === "all"
            ? true
            : filterKind === "videowall"
            ? p.kind === "videowall"
            : p.kind !== "videowall";
        return matchesName && matchesKind;
      })
      .sort((a, b) => {
        if (sortField === "name") {
          return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        if (sortField === "item_count") {
          return sortAsc ? a.item_count - b.item_count : b.item_count - a.item_count;
        }
        return sortAsc ? a.created_at - b.created_at : b.created_at - a.created_at;
      });
  }, [playlists, searchQuery, filterKind, sortField, sortAsc]);

  const formatDate = (ts: number) => {
    if (!ts) return "—";
    const d = new Date(ts * 1000);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const secs = String(d.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year}, ${hours}:${mins}:${secs}`;
  };

  return (
    <main className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8 max-w-[1920px] mx-auto text-slate-800">
      {/* ==================== HEADER CARD ==================== */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              <IconPlaylist className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-0.5">
                <Link href="/" className="hover:text-emerald-700 transition">Trang chủ</Link>
                <span>›</span>
                <span className="text-slate-600 font-semibold">Playlist</span>
              </div>
              <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl tracking-tight">
                Quản lý Playlist
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Tổ chức danh sách phát video, hình ảnh và phân phối nội dung tới các thiết bị hiển thị.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/playlists/new"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-sm cursor-pointer"
            >
              <IconPlus className="h-4 w-4" />
              <span>Tạo playlist mới</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Notifications */}
      {info && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 shadow-2xs">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-semibold text-emerald-700 hover:text-emerald-950 ml-2 cursor-pointer">Đóng</button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 shadow-2xs">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-semibold text-rose-700 hover:text-rose-950 ml-2 cursor-pointer">Đóng</button>
        </div>
      )}

      {/* ==================== FILTER TOOLBAR ==================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm playlist theo tên..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9.5 w-64 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 sm:w-72 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Type filter */}
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="h-9.5 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition hover:bg-slate-50 focus:border-emerald-500 shadow-2xs cursor-pointer"
          >
            <option value="all">Tất cả loại</option>
            <option value="default">Mặc định (Slideshow)</option>
            <option value="videowall">Video Wall</option>
          </select>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500">
          <span>
            Hiển thị: <strong className="font-semibold text-slate-900">{filteredPlaylists.length}</strong> Playlist
          </span>
          <button
            type="button"
            disabled={loading || busy}
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* ==================== PLAYLISTS DATA TABLE ==================== */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[840px]">
            {/* Header */}
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                {/* Select all */}
                <th className="w-10 px-3 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredPlaylists.length > 0 && selectedIds.size === filteredPlaylists.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
                  />
                </th>
                <th className="w-24 px-3 py-3.5">HÌNH ẢNH</th>
                <th
                  className="px-3 py-3.5 cursor-pointer hover:text-slate-900 transition select-none"
                  onClick={() => {
                    if (sortField === "name") setSortAsc(!sortAsc);
                    else {
                      setSortField("name");
                      setSortAsc(true);
                    }
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span>TÊN PLAYLIST</span>
                    <span className="text-[10px] text-slate-400">
                      {sortField === "name" ? (sortAsc ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>
                <th className="w-28 px-3 py-3.5 text-center">LOẠI</th>
                <th className="w-48 px-3 py-3.5 text-center">TRẠNG THÁI PUBLISH</th>
                <th
                  className="w-24 px-3 py-3.5 text-center cursor-pointer hover:text-slate-900 transition select-none"
                  onClick={() => {
                    if (sortField === "item_count") setSortAsc(!sortAsc);
                    else {
                      setSortField("item_count");
                      setSortAsc(false);
                    }
                  }}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>SỐ MỤC</span>
                    <span className="text-[10px] text-slate-400">
                      {sortField === "item_count" ? (sortAsc ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>
                <th
                  className="w-48 px-3 py-3.5 cursor-pointer hover:text-slate-900 transition select-none"
                  onClick={() => {
                    if (sortField === "created_at") setSortAsc(!sortAsc);
                    else {
                      setSortField("created_at");
                      setSortAsc(false);
                    }
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span>NGÀY TẠO</span>
                    <span className="text-[10px] text-slate-400">
                      {sortField === "created_at" ? (sortAsc ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>
                <th className="w-14 px-3 py-3.5 text-center"></th>
              </tr>
            </thead>

            {/* Rows */}
            <tbody className="divide-y divide-slate-100">
              {filteredPlaylists.map((pl) => {
                const isSelected = selectedIds.has(pl.id);
                const isPublished = pl.is_active || Boolean(pl.assigned_screen_ids && pl.assigned_screen_ids.length > 0);
                const isMenuOpen = activeMenuId === pl.id;

                return (
                  <tr
                    key={pl.id}
                    className={`group transition hover:bg-slate-50/80 ${
                      isSelected ? "bg-emerald-50/40" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(pl.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
                      />
                    </td>

                    {/* Thumbnail */}
                    <td className="px-3 py-3">
                      <Link href={`/playlists/${pl.id}`}>
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 shadow-2xs transition group-hover:border-emerald-500/50 cursor-pointer overflow-hidden text-slate-600 group-hover:text-emerald-700">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-xs text-xs text-emerald-700 font-bold">
                            ▶
                          </span>
                        </div>
                      </Link>
                    </td>

                    {/* Name */}
                    <td className="px-3 py-3">
                      <Link
                        href={`/playlists/${pl.id}`}
                        className="font-bold text-slate-900 transition hover:text-emerald-700 line-clamp-1 cursor-pointer"
                      >
                        {pl.name}
                      </Link>
                      {pl.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{pl.description}</p>
                      )}
                    </td>

                    {/* Kind Pill */}
                    <td className="px-3 py-3 text-center">
                      {pl.kind === "videowall" ? (
                        <span className="inline-block rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
                          Video Wall
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                          Mặc định
                        </span>
                      )}
                    </td>

                    {/* Publish Status */}
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActivate(pl);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition hover:opacity-85 cursor-pointer shadow-2xs ${
                          isPublished
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100/70"
                            : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200"
                        }`}
                        title="Bấm để chọn thiết bị phát"
                      >
                        {isPublished && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        )}
                        <span className="line-clamp-1">
                          {pl.publish_status || (isPublished ? "Đang phát" : "Chưa publish")}
                        </span>
                      </button>
                    </td>

                    {/* Item Count */}
                    <td className="px-3 py-3 text-center font-bold text-slate-800">
                      {pl.item_count}
                    </td>

                    {/* Created At */}
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-500">
                      {formatDate(pl.created_at)}
                    </td>

                    {/* Actions Menu ••• */}
                    <td className="px-3 py-3 text-center relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : pl.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition mx-auto cursor-pointer"
                        title="Tùy chọn"
                      >
                        •••
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-3 top-10 z-50 w-48 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 text-left"
                        >
                          <Link
                            href={`/playlists/${pl.id}`}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            <span>Chỉnh sửa CMS</span>
                          </Link>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveMenuId(null);
                              handleActivate(pl);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                          >
                            <span>Phát lên thiết bị</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleDuplicate(pl);
                              setActiveMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            <span>Nhân bản</span>
                          </button>

                          <div className="my-1 border-t border-slate-100" />

                          <button
                            type="button"
                            onClick={() => {
                              handleDelete(pl);
                              setActiveMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <span>Xoá playlist</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredPlaylists.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="mx-auto max-w-sm space-y-2">
                      <p className="text-sm font-bold text-slate-800">Không có playlist nào</p>
                      <p className="text-xs text-slate-500">
                        {searchQuery
                          ? "Không tìm thấy playlist phù hợp với từ khoá tìm kiếm."
                          : "Hãy bấm nút '+ Tạo playlist' ở góc trên để tạo danh sách phát đầu tiên!"}
                      </p>
                      <div className="pt-2">
                        <Link
                          href="/playlists/new"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                          <span>+ Tạo playlist mới</span>
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Screen Selection Modal */}
      {screenModalPlaylist && (
        <SelectScreenModal
          playlist={screenModalPlaylist}
          onClose={() => setScreenModalPlaylist(null)}
          onSuccess={() => {
            setScreenModalPlaylist(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}
