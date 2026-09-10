"use client";

import {
  PlaylistPublic,
  api,
  mediaUrl,
} from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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

  const handleActivate = async (plId: number) => {
    act(async () => {
      await api.activatePlaylist(plId);
      await api.playerStart().catch(() => undefined);
      setInfo("Đã kích hoạt phát playlist này lên thiết bị / Homescreen!");
      setTimeout(() => setInfo(null), 4000);
    });
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
    <div className="min-h-screen bg-[#111215] text-zinc-200 selection:bg-emerald-500 selection:text-white">
      {/* ==================== TOP NAVIGATION / BREADCRUMB BAR ==================== */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#22242a] bg-[#14161a]/95 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3 text-xs">
          {/* Sidebar icon */}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-[#202228] hover:text-white"
            title="Menu điều hướng"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>

          <span className="text-zinc-700">|</span>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 font-medium">
            <Link href="/" className="text-zinc-400 hover:text-white transition">
              Trang chủ
            </Link>
            <span className="text-zinc-600">›</span>
            <span className="text-white font-semibold">Playlist</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/playlists/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-900 shadow-sm transition hover:bg-zinc-200"
          >
            <span>+</span>
            <span>Tạo playlist</span>
          </Link>

          {/* Bell Notification */}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-[#202228] hover:text-white"
            title="Thông báo"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
        {/* Notifications */}
        {info && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-4 py-2.5 text-xs font-medium text-emerald-300">
            <span>{info}</span>
            <button onClick={() => setInfo(null)} className="font-bold text-emerald-400 hover:text-emerald-200 ml-2">Đóng</button>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-950/40 px-4 py-2.5 text-xs font-medium text-rose-300">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold text-rose-400 hover:text-rose-200 ml-2">Đóng</button>
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
                className="h-9 w-64 rounded-lg border border-[#272930] bg-[#16171b] px-3 text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-zinc-500 focus:bg-[#1b1d22] sm:w-72"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  X
                </button>
              )}
            </div>

            {/* Type filter */}
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              className="h-9 rounded-lg border border-[#272930] bg-[#16171b] px-3 text-xs text-zinc-300 outline-none transition hover:bg-[#1b1d22] focus:border-zinc-500"
            >
              <option value="all">Tất cả loại</option>
              <option value="default">Mặc định (Slideshow)</option>
              <option value="videowall">Video Wall</option>
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-zinc-400">
            <span>
              Hiển thị: <strong className="font-semibold text-zinc-200">{filteredPlaylists.length}</strong> Playlist
            </span>
            <button
              type="button"
              disabled={loading || busy}
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#272930] bg-[#16171b] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-[#202228] hover:text-white active:scale-95 disabled:opacity-50"
            >
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* ==================== PLAYLISTS DATA TABLE ==================== */}
        <div className="overflow-hidden rounded-xl border border-[#23252b] bg-[#141518] shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[840px]">
              {/* Header */}
              <thead className="border-b border-[#23252b] bg-[#17191e] text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                <tr>
                  {/* Select all */}
                  <th className="w-10 px-3 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredPlaylists.length > 0 && selectedIds.size === filteredPlaylists.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-[#3f4148] bg-[#1c1e24] text-emerald-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                  </th>
                  <th className="w-24 px-3 py-3.5">HÌNH ẢNH</th>
                  <th
                    className="px-3 py-3.5 cursor-pointer hover:text-white transition select-none"
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
                      <span className="text-[10px] text-zinc-500">
                        {sortField === "name" ? (sortAsc ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>
                  <th className="w-28 px-3 py-3.5 text-center">LOẠI</th>
                  <th className="w-48 px-3 py-3.5 text-center">TRẠNG THÁI PUBLISH</th>
                  <th
                    className="w-24 px-3 py-3.5 text-center cursor-pointer hover:text-white transition select-none"
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
                      <span className="text-[10px] text-zinc-500">
                        {sortField === "item_count" ? (sortAsc ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>
                  <th
                    className="w-48 px-3 py-3.5 cursor-pointer hover:text-white transition select-none"
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
                      <span className="text-[10px] text-zinc-500">
                        {sortField === "created_at" ? (sortAsc ? "▲" : "▼") : "⇅"}
                      </span>
                    </div>
                  </th>
                  <th className="w-14 px-3 py-3.5 text-center"></th>
                </tr>
              </thead>

              {/* Rows */}
              <tbody className="divide-y divide-[#1e2025]">
                {filteredPlaylists.map((pl) => {
                  const isSelected = selectedIds.has(pl.id);
                  const isPublished = pl.is_active || pl.publish_status === "Đang phát ở 1 thiết bị";
                  const isMenuOpen = activeMenuId === pl.id;

                  return (
                    <tr
                      key={pl.id}
                      className={`group transition hover:bg-[#1a1c22] ${
                        isSelected ? "bg-[#181a20]" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(pl.id)}
                          className="rounded border-[#3f4148] bg-[#1c1e24] text-emerald-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                      </td>

                      {/* Thumbnail */}
                      <td className="px-3 py-3">
                        <Link href={`/playlists/${pl.id}`}>
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0e0f12] border border-[#272930] shadow-inner transition group-hover:border-zinc-500 cursor-pointer overflow-hidden">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs text-zinc-300">
                              ▶
                            </span>
                          </div>
                        </Link>
                      </td>

                      {/* Name */}
                      <td className="px-3 py-3">
                        <Link
                          href={`/playlists/${pl.id}`}
                          className="font-semibold text-zinc-100 transition hover:text-emerald-400 line-clamp-1 cursor-pointer"
                        >
                          {pl.name}
                        </Link>
                        {pl.description && (
                          <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">{pl.description}</p>
                        )}
                      </td>

                      {/* Kind Pill */}
                      <td className="px-3 py-3 text-center">
                        {pl.kind === "videowall" ? (
                          <span className="inline-block rounded-full bg-[#27282d] border border-[#3f4148] px-2.5 py-0.5 text-[11px] font-bold text-zinc-100">
                            Video Wall
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-[#1c1d22] border border-[#2a2c33] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
                            Mặc định
                          </span>
                        )}
                      </td>

                      {/* Publish Status */}
                      <td className="px-3 py-3 text-center">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#064e3b]/30 border border-[#059669]/50 px-3 py-0.5 text-[11px] font-bold text-[#34d399]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                            <span>Đang phát ở 1 thiết bị</span>
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-[#1c1d22] border border-[#2a2c33] px-3 py-0.5 text-[11px] font-medium text-zinc-500">
                            Chưa publish
                          </span>
                        )}
                      </td>

                      {/* Item Count */}
                      <td className="px-3 py-3 text-center font-bold text-zinc-200">
                        {pl.item_count}
                      </td>

                      {/* Created At */}
                      <td className="px-3 py-3 font-mono text-[11px] text-zinc-400">
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
                          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-[#23252b] hover:text-white transition mx-auto"
                          title="Tùy chọn"
                        >
                          •••
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-3 top-10 z-50 w-44 rounded-xl border border-[#2e313a] bg-[#1a1c22] p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100 text-left"
                          >
                            <Link
                              href={`/playlists/${pl.id}`}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 hover:bg-[#252830] transition"
                            >
                              <span>Chỉnh sửa CMS</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => {
                                handleActivate(pl.id);
                                setActiveMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-emerald-400 hover:bg-[#252830] transition"
                            >
                              <span>Phát lên thiết bị</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                handleDuplicate(pl);
                                setActiveMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 hover:bg-[#252830] transition"
                            >
                              <span>Nhân bản</span>
                            </button>

                            <div className="my-1 border-t border-[#2a2c34]" />

                            <button
                              type="button"
                              onClick={() => {
                                handleDelete(pl);
                                setActiveMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-950/30 transition"
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
                    <td colSpan={8} className="py-16 text-center text-zinc-500">
                      <div className="mx-auto max-w-sm space-y-2">
                        <p className="text-sm font-semibold text-zinc-300">Không có playlist nào</p>
                        <p className="text-xs text-zinc-500">
                          {searchQuery
                            ? "Không tìm thấy playlist phù hợp với từ khoá tìm kiếm."
                            : "Hãy bấm nút '+ Tạo playlist' ở góc trên để tạo danh sách phát đầu tiên!"}
                        </p>
                        <div className="pt-2">
                          <Link
                            href="/playlists/new"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-900 shadow-sm transition hover:bg-zinc-200"
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
      </main>
    </div>
  );
}
