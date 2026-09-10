"use client";

import {
  Creative,
  PlaylistPublic,
  api,
  mediaUrl,
} from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SlideItem = {
  id: string; // local unique id for slide
  dbItemId?: number; // if existing in playlist_items
  creative: Creative | null;
  duration: number;
};

interface PlaylistCmsEditorProps {
  mode: "create" | "edit";
  playlistId?: number;
}

export function PlaylistCmsEditor({ mode, playlistId }: PlaylistCmsEditorProps) {
  const router = useRouter();

  // Basic info & configurations
  const [playlistName, setPlaylistName] = useState(
    mode === "create" ? `Playlist Sảnh Rực Rỡ ${Math.floor(100 + Math.random() * 900)}` : ""
  );
  const [playlistKind, setPlaylistKind] = useState<"slideshow" | "videowall">("slideshow");
  const [aspectRatio, setAspectRatio] = useState<string>("FullHD Nghiêng");
  const [syncPlayback, setSyncPlayback] = useState(false);
  const [fitScreen, setFitScreen] = useState(false);

  // Slides list
  const [slides, setSlides] = useState<SlideItem[]>([
    { id: "slide-1", creative: null, duration: 5 },
  ]);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);

  // Media Library
  const [mediaList, setMediaList] = useState<Creative[]>([]);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image" | "web">("all");

  // Web URL Modal
  const [showWebUrlModal, setShowWebUrlModal] = useState(false);
  const [webTitle, setWebTitle] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [webDuration, setWebDuration] = useState(15);

  // States
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing playlist for edit mode
  useEffect(() => {
    if (mode === "edit" && playlistId) {
      setLoading(true);
      api
        .getPlaylist(playlistId)
        .then((data) => {
          setPlaylistName(data.name);
          setPlaylistKind((data.kind as "slideshow" | "videowall") || "slideshow");
          setAspectRatio(data.aspect_ratio || "FullHD Nghiêng");
          setSyncPlayback(Boolean(data.sync_playback));
          setFitScreen(Boolean(data.fit_screen));

          if (data.items && data.items.length > 0) {
            const loadedSlides: SlideItem[] = data.items.map((it) => ({
              id: `item-${it.id}`,
              dbItemId: it.id,
              creative: it.creative,
              duration: it.duration || 5,
            }));
            setSlides(loadedSlides);
          } else {
            setSlides([{ id: "slide-1", creative: null, duration: 5 }]);
          }
        })
        .catch((err) => setError((err as Error).message))
        .finally(() => setLoading(false));
    }
  }, [mode, playlistId]);

  // Fetch Media Library
  const refreshMedia = useCallback(async () => {
    try {
      const ads = await api.listAds();
      setMediaList(ads);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    refreshMedia();
  }, [refreshMedia]);

  // Current selected slide
  const currentSlide = slides[selectedSlideIndex] || slides[0] || null;

  // Assign media to currently selected slide
  const handleAssignMedia = (creative: Creative) => {
    setSlides((prev) => {
      const next = [...prev];
      if (next[selectedSlideIndex]) {
        next[selectedSlideIndex] = {
          ...next[selectedSlideIndex],
          creative,
          duration: creative.duration > 0 ? creative.duration : next[selectedSlideIndex].duration,
        };
      }
      return next;
    });
    setInfo(`Đã gán "${creative.name}" vào Trang ${selectedSlideIndex + 1}!`);
    setTimeout(() => setInfo(null), 3000);
  };

  // Add a new slide
  const handleAddSlide = () => {
    const newSlide: SlideItem = {
      id: `slide-${Date.now()}`,
      creative: null,
      duration: 5,
    };
    setSlides((prev) => [...prev, newSlide]);
    setSelectedSlideIndex(slides.length);
  };

  // Move slide
  const handleMoveSlide = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelectedSlideIndex(target);
  };

  // Delete slide
  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) {
      setSlides([{ id: `slide-${Date.now()}`, creative: null, duration: 5 }]);
      setSelectedSlideIndex(0);
      return;
    }
    setSlides((prev) => prev.filter((_, i) => i !== index));
    setSelectedSlideIndex((prev) => Math.max(0, prev - 1));
  };

  // Update slide duration
  const handleSlideDurationChange = (index: number, dur: number) => {
    if (dur <= 0) return;
    setSlides((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], duration: dur };
      }
      return next;
    });
  };

  // File Upload handler
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const file = files[0];
      const creative = await api.uploadAd(file);
      await refreshMedia();
      // Auto assign to selected slide
      handleAssignMedia(creative);
      setInfo(`Đã tải lên và gán "${creative.name}" vào trang hiện tại!`);
      setTimeout(() => setInfo(null), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Web URL Add handler
  const handleAddWebUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webUrl.trim() || !webTitle.trim()) return;
    setSaving(true);
    try {
      const creative = await api.addUrlCreative({
        name: webTitle.trim(),
        url: webUrl.trim(),
        duration: webDuration,
        category: "Web/Dashboard",
      });
      await refreshMedia();
      handleAssignMedia(creative);
      setShowWebUrlModal(false);
      setWebTitle("");
      setWebUrl("");
      setInfo(`Đã thêm nội dung Web "${creative.name}"!`);
      setTimeout(() => setInfo(null), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Save Playlist
  const handleSavePlaylist = async () => {
    if (!playlistName.trim()) {
      setError("Vui lòng nhập tên Playlist");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let savedPlaylistId = playlistId;

      if (mode === "create" || !savedPlaylistId) {
        const created = await api.createPlaylist({
          name: playlistName.trim(),
          kind: playlistKind,
          aspect_ratio: aspectRatio,
          sync_playback: syncPlayback,
          fit_screen: fitScreen,
          is_active: false,
        });
        savedPlaylistId = created.id;
      } else {
        await api.updatePlaylist(savedPlaylistId, {
          name: playlistName.trim(),
          kind: playlistKind,
          aspect_ratio: aspectRatio,
          sync_playback: syncPlayback,
          fit_screen: fitScreen,
        });
      }

      // Sync items:
      // Remove all existing items if edit mode
      if (mode === "edit" && playlistId) {
        const existing = await api.getPlaylist(playlistId);
        for (const it of existing.items) {
          await api.removePlaylistItem(playlistId, it.id);
        }
      }

      // Add each valid slide to playlist
      for (const slide of slides) {
        if (slide.creative) {
          await api.addPlaylistItem(savedPlaylistId, slide.creative.id, slide.duration);
        }
      }

      setInfo("Đã lưu playlist thành công!");
      setTimeout(() => {
        router.push("/playlists");
      }, 800);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  // Filtered media list
  const filteredMedia = useMemo(() => {
    return mediaList.filter((item) => {
      const matchSearch = item.name.toLowerCase().includes(mediaSearch.toLowerCase());
      const matchType =
        mediaFilter === "all"
          ? true
          : mediaFilter === "video"
          ? item.kind === "video"
          : mediaFilter === "image"
          ? item.kind === "image"
          : item.kind === "web";
      return matchSearch && matchType;
    });
  }, [mediaList, mediaSearch, mediaFilter]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#111215] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-zinc-400">Đang tải cấu hình Playlist CMS...</p>
        </div>
      </div>
    );
  }

  // Calculate canvas aspect ratio
  const isPortrait = aspectRatio.includes("Nghiêng") || aspectRatio.includes("1080x1920");

  return (
    <div className="flex h-screen flex-col bg-[#111215] text-zinc-200 overflow-hidden select-none">
      {/* ==================== 1. TOP BAR ==================== */}
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-[#22242a] bg-[#14161a] px-4">
        {/* Left: Breadcrumbs */}
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-[#202228] hover:text-white"
            title="Menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5 font-medium">
            <Link href="/" className="text-zinc-400 hover:text-white transition">
              Trang chủ
            </Link>
            <span className="text-zinc-600">›</span>
            <Link href="/playlists" className="text-zinc-400 hover:text-white transition">
              Playlist
            </Link>
            <span className="text-zinc-600">›</span>
            <span className="text-white font-semibold">
              {mode === "create" ? "Tạo mới" : playlistName || "Chỉnh sửa"}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/playlists"
            className="px-3 py-1 text-xs font-medium text-zinc-400 hover:text-white transition"
          >
            Hủy
          </Link>

          <button
            type="button"
            disabled={saving}
            onClick={handleSavePlaylist}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:opacity-50 active:scale-95"
          >
            {saving ? "Đang lưu..." : "Lưu playlist"}
          </button>

          {/* Bell icon */}
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-[#202228] hover:text-white"
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

      {/* ==================== 2. CONFIGURATION CONTROLS BAR ==================== */}
      <section className="shrink-0 border-b border-[#22242a] bg-[#16171c] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Tên playlist */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-zinc-400">Tên playlist</label>
            <input
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              placeholder="Nhập tên playlist..."
              className="h-8 w-56 rounded-md border border-[#2a2d35] bg-[#121316] px-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-400"
            />
          </div>

          {/* Loại playlist: Segmented toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-zinc-400">Loại playlist</label>
            <div className="flex h-8 items-center rounded-md border border-[#2a2d35] bg-[#121316] p-0.5">
              <button
                type="button"
                onClick={() => setPlaylistKind("slideshow")}
                className={`h-full rounded px-3 text-xs font-semibold transition ${
                  playlistKind === "slideshow"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Slideshow
              </button>
              <button
                type="button"
                onClick={() => setPlaylistKind("videowall")}
                className={`h-full rounded px-3 text-xs font-semibold transition ${
                  playlistKind === "videowall"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Video Wall
              </button>
            </div>
          </div>

          {/* Tỷ lệ màn hình */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-zinc-400">Tỷ lệ màn hình</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="h-8 rounded-md border border-[#2a2d35] bg-[#121316] px-2.5 text-xs text-zinc-200 outline-none focus:border-zinc-400"
            >
              <option value="FullHD Nghiêng">FullHD Nghiêng (1080x1920)</option>
              <option value="FullHD Ngang">FullHD Ngang (1920x1080)</option>
              <option value="4K (3840x2160)">4K (3840x2160)</option>
              <option value="Vuông (1:1)">Vuông (1:1)</option>
            </select>
          </div>

          {/* Chế độ phát đồng bộ */}
          <div className="flex items-center gap-2 pt-4">
            <span className="text-[11px] font-semibold text-zinc-400">Chế độ phát đồng bộ</span>
            <button
              type="button"
              onClick={() => setSyncPlayback(!syncPlayback)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                syncPlayback ? "bg-emerald-600" : "bg-[#2d3038]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  syncPlayback ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Vừa khung hình */}
          <div className="flex items-center gap-2 pt-4">
            <span className="text-[11px] font-semibold text-zinc-400">Vừa khung hình</span>
            <button
              type="button"
              onClick={() => setFitScreen(!fitScreen)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                fitScreen ? "bg-emerald-600" : "bg-[#2d3038]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  fitScreen ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Notifications */}
          {(info || error) && (
            <div className="ml-auto flex items-center gap-2 pt-3">
              {info && <span className="text-xs text-emerald-400">{info}</span>}
              {error && <span className="text-xs text-rose-400">{error}</span>}
            </div>
          )}
        </div>
      </section>

      {/* ==================== 3. MAIN WORKSPACE (LEFT RAIL + CENTER CANVAS + RIGHT MEDIA) ==================== */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3.1 Left Icon Rail */}
        <aside className="flex w-12 shrink-0 flex-col items-center border-r border-[#22242a] bg-[#141519] py-3 gap-4">
          {/* Logo icon */}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/30">
            <span className="font-bold text-sm">⊞</span>
          </div>

          <div className="flex flex-col items-center gap-2 text-zinc-400 text-xs font-semibold">
            <Link href="/ads" className="p-2 hover:text-white rounded-lg hover:bg-[#20222a]" title="Thư viện media">
              Media
            </Link>
            <Link href="/" className="p-2 hover:text-white rounded-lg hover:bg-[#20222a]" title="Tổng quan">
              Stats
            </Link>
            <Link href="/playlists" className="p-2 text-emerald-400 rounded-lg bg-[#20222a]" title="Quản lý Playlist">
              Playlists
            </Link>
            <Link href="/admin" className="p-2 hover:text-white rounded-lg hover:bg-[#20222a]" title="Thiết bị">
              Thiết bị
            </Link>
          </div>

          {/* User profile bubble at bottom */}
          <div className="mt-auto flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-300">
            N
          </div>
        </aside>

        {/* 3.2 Center Preview Canvas */}
        <main className="relative flex flex-1 flex-col items-center justify-center bg-[#0d0e11] p-4 overflow-hidden">
          {/* Top Simulator Mode Badge */}
          <div className="absolute top-4 flex items-center justify-center">
            <span className="rounded-full bg-[#1b1d24] border border-[#2a2c36] px-3.5 py-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
              Chế độ mô phỏng trình phát ({isPortrait ? "1080x1920PX" : "1920x1080PX"})
            </span>
          </div>

          {/* Canvas Box */}
          <div
            className={`relative flex items-center justify-center overflow-hidden rounded-xl border border-[#22242c] bg-[#131418] shadow-2xl transition-all duration-200 ${
              isPortrait
                ? "h-[72%] aspect-[9/16]"
                : "w-[72%] max-w-4xl aspect-video"
            }`}
          >
            {currentSlide && currentSlide.creative ? (
              <div className="relative h-full w-full bg-black flex items-center justify-center">
                {currentSlide.creative.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(currentSlide.creative.url)}
                    alt={currentSlide.creative.name}
                    className={`h-full w-full ${fitScreen ? "object-cover" : "object-contain"}`}
                  />
                ) : currentSlide.creative.kind === "video" ? (
                  <video
                    src={mediaUrl(currentSlide.creative.url)}
                    autoPlay
                    loop
                    muted
                    className={`h-full w-full ${fitScreen ? "object-cover" : "object-contain"}`}
                  />
                ) : (
                  <iframe
                    src={currentSlide.creative.url}
                    title={currentSlide.creative.name}
                    className="h-full w-full border-0 bg-white"
                  />
                )}

                {/* Floating slide info tag */}
                <div className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-xs">
                  Trang {selectedSlideIndex + 1}: {currentSlide.creative.name} ({currentSlide.duration}s)
                </div>
              </div>
            ) : (
              /* Empty state matching Image 2 */
              <div className="flex flex-col items-center justify-center text-center p-8 space-y-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1b1d24] text-xs font-bold text-zinc-500 border border-[#292b35]">
                  Trống
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-200">Trang này chưa có nội dung</h3>
                  <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                    Chọn một hình ảnh hoặc video ở Thư viện Media bên phải để gán vào trang này.
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* 3.3 Right Media Library Drawer */}
        <aside className="flex w-72 sm:w-80 shrink-0 flex-col border-l border-[#22242a] bg-[#141519]">
          {/* Header */}
          <div className="border-b border-[#22242a] p-3.5 space-y-1">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Thư Viện Media</h3>
            <p className="text-[11px] text-zinc-500">Bấm vào media để gán cho trang đang chọn.</p>
          </div>

          {/* Search & Filter */}
          <div className="p-3 border-b border-[#22242a] space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm theo tên..."
                value={mediaSearch}
                onChange={(e) => setMediaSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-[#262830] bg-[#111215] px-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="text-[11px]">Lọc loại</span>
              <select
                value={mediaFilter}
                onChange={(e) => setMediaFilter(e.target.value as "all" | "video" | "image" | "web")}
                className="h-7 rounded border border-[#262830] bg-[#111215] px-2 text-[11px] text-zinc-300 outline-none"
              >
                <option value="all">Tất cả</option>
                <option value="video">Chỉ Video</option>
                <option value="image">Chỉ Hình ảnh</option>
                <option value="web">Chỉ Web URL</option>
              </select>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="p-3 border-b border-[#22242a] space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf"
              onChange={handleUploadFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2e313b] bg-[#1a1c22] py-2 text-xs font-semibold text-zinc-200 hover:bg-[#23262f] transition shadow-xs disabled:opacity-50"
            >
              <span>{uploading ? "Đang tải..." : "+ Tải ảnh/video/PDF lên"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowWebUrlModal(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2e313b] bg-[#1a1c22] py-2 text-xs font-semibold text-zinc-200 hover:bg-[#23262f] transition shadow-xs"
            >
              <span>+ Thêm nội dung Web (URL)</span>
            </button>
          </div>

          {/* Media Items Scrollable List */}
          <div className="flex-1 overflow-y-auto p-2 divide-y divide-[#1e2026]">
            {filteredMedia.map((ad) => {
              const isCurrent = currentSlide?.creative?.id === ad.id;

              return (
                <div
                  key={ad.id}
                  onClick={() => handleAssignMedia(ad)}
                  className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition ${
                    isCurrent
                      ? "bg-emerald-950/40 border border-emerald-500/40"
                      : "hover:bg-[#1b1d24]"
                  }`}
                  title="Bấm để gán vào trang đang chọn"
                >
                  {/* Icon */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#101114] border border-[#282a32] text-[10px] font-bold text-zinc-400">
                    {ad.kind === "video" ? "VID" : ad.kind === "web" ? "WEB" : "IMG"}
                  </div>

                  {/* Title & Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{ad.name}</p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {ad.kind === "video"
                        ? `Video (${ad.duration}s)`
                        : ad.kind === "web"
                        ? "Web URL"
                        : `Ảnh (${ad.duration}s)`}
                    </p>
                  </div>

                  {isCurrent && (
                    <span className="text-[11px] font-bold text-emerald-400">Đã gán</span>
                  )}
                </div>
              );
            })}

            {filteredMedia.length === 0 && (
              <div className="py-12 text-center text-xs text-zinc-500">
                Chưa có media nào. Hãy bấm nút &quot;Tải ảnh/video/PDF lên&quot; ở trên!
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ==================== 4. BOTTOM PANEL: DANH SÁCH TRANG (SLIDES TIMELINE) ==================== */}
      <footer className="shrink-0 border-t border-[#22242a] bg-[#14161a] p-3">
        <div className="flex items-center justify-between pb-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-300 uppercase tracking-wider">
              Danh Sách Trang ({slides.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1b1d24] px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-[#272a33]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>120 FPS</span>
            </span>
          </div>
        </div>

        {/* Carousel of Slide Cards */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {slides.map((slide, index) => {
            const isSelected = selectedSlideIndex === index;

            return (
              <div
                key={slide.id}
                onClick={() => setSelectedSlideIndex(index)}
                className={`relative flex flex-col justify-between rounded-xl border p-2 w-36 h-36 shrink-0 cursor-pointer transition ${
                  isSelected
                    ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-[#191b22]"
                    : "border-[#252832] bg-[#121317] hover:border-zinc-500"
                }`}
              >
                {/* Header of card: Index & Drag handle */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-[#20222a] font-bold text-[10px] text-zinc-200">
                    {index + 1}
                  </span>
                  <span className="text-zinc-600">⋮⋮</span>
                </div>

                {/* Thumbnail Preview */}
                <div className="relative my-1 flex h-16 w-full items-center justify-center rounded-md bg-[#0a0b0e] border border-[#20222a] overflow-hidden">
                  {slide.creative ? (
                    slide.creative.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaUrl(slide.creative.url)}
                        alt={slide.creative.name}
                        className="h-full w-full object-cover"
                      />
                    ) : slide.creative.kind === "video" ? (
                      <video
                        src={mediaUrl(slide.creative.url)}
                        muted
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-zinc-400">WEB</span>
                    )
                  ) : (
                    <span className="text-xs font-bold text-zinc-600">IMG</span>
                  )}
                </div>

                {/* Duration & Card Actions Toolbar */}
                <div className="flex items-center justify-between pt-1 border-t border-[#20222a] text-[11px]">
                  {/* Duration input */}
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-500 text-[10px]">Giây:</span>
                    <input
                      type="number"
                      min={1}
                      value={slide.duration}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleSlideDurationChange(index, Number(e.target.value))}
                      className="w-8 rounded bg-[#1c1e26] border border-[#2b2e38] text-center font-bold text-white text-[10px] outline-none"
                    />
                  </div>

                  {/* Actions: Reorder & Delete */}
                  <div className="flex items-center gap-1 text-zinc-400">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveSlide(index, -1);
                      }}
                      className="hover:text-white disabled:opacity-20"
                      title="Chuyển sang trái"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={index === slides.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveSlide(index, 1);
                      }}
                      className="hover:text-white disabled:opacity-20"
                      title="Chuyển sang phải"
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSlide(index);
                      }}
                      className="hover:text-rose-400 text-xs font-semibold"
                      title="Xoá trang"
                    >
                      Xoá
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* "+ Thêm trang" Card */}
          <button
            type="button"
            onClick={handleAddSlide}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#282a35] bg-[#121317]/50 w-36 h-36 shrink-0 text-zinc-400 hover:border-emerald-500 hover:text-emerald-400 transition"
          >
            <span className="text-2xl font-bold mb-1">+</span>
            <span className="text-xs font-semibold">Thêm trang</span>
          </button>
        </div>
      </footer>

      {/* ==================== MODAL: THÊM NỘI DUNG WEB (URL) ==================== */}
      {showWebUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <form
            onSubmit={handleAddWebUrl}
            className="w-full max-w-md rounded-xl border border-[#2b2d38] bg-[#171920] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#262832] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Thêm Nội Dung Web (URL)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowWebUrlModal(false)}
                className="text-zinc-400 hover:text-white font-bold"
              >
                Đóng
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-300 mb-1">Tên hiển thị</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bảng giá chứng khoán, Live Dashboard..."
                  value={webTitle}
                  onChange={(e) => setWebTitle(e.target.value)}
                  className="w-full rounded-lg border border-[#2c2f3a] bg-[#101115] px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-300 mb-1">Đường dẫn Website (URL)</label>
                <input
                  type="url"
                  placeholder="https://example.com/widget..."
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  className="w-full rounded-lg border border-[#2c2f3a] bg-[#101115] px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-300 mb-1">Thời lượng phát (giây)</label>
                <input
                  type="number"
                  min={5}
                  value={webDuration}
                  onChange={(e) => setWebDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#2c2f3a] bg-[#101115] px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262832] text-xs">
              <button
                type="button"
                onClick={() => setShowWebUrlModal(false)}
                className="rounded-lg border border-[#2e313b] bg-[#1b1d24] px-3.5 py-1.5 font-medium text-zinc-300 hover:bg-[#242630]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!webUrl.trim() || !webTitle.trim() || saving}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Đang thêm..." : "Thêm vào Playlist"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
