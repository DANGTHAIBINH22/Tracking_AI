"use client";

import {
  Creative,
  CreativeProfileResult,
  PlaylistPublic,
  api,
  mediaUrl,
} from "@/lib/api";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconClock,
  IconClose,
  IconEdit,
  IconGrid,
  IconImage,
  IconList,
  IconMedia,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconVideo,
} from "@/components/icons/Icons";
import { UploadMediaModal } from "@/components/UploadMediaModal";
import { EditMediaModal } from "@/components/EditMediaModal";
import { CustomSelect } from "@/components/CustomSelect";
import { AGE_OPTIONS, CATEGORY_OPTIONS, CROWD_OPTIONS, GENDER_OPTIONS, WEATHER_OPTIONS, labelFor } from "@/lib/taxonomy";

const SOURCE_LABELS: Record<string, string> = {
  faces: "đo khuôn mặt trong video",
  vlm: "AI đọc nội dung",
  "faces+vlm": "đo khuôn mặt + AI đọc nội dung",
  none: "không đọc được gì",
};


/** The analyser's proposal, shown for confirmation rather than applied. */
function ProfilePanel({
  profile,
  onApply,
  onDismiss,
  busy,
}: {
  profile: CreativeProfileResult;
  onApply: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Thể loại", value: profile.category },
    {
      label: "Nhóm tuổi",
      value: profile.target_age_group && labelFor(AGE_OPTIONS, profile.target_age_group),
    },
    {
      label: "Giới tính",
      value: profile.target_gender && labelFor(GENDER_OPTIONS, profile.target_gender),
    },
    {
      label: "Quy mô",
      value: profile.target_crowd && labelFor(CROWD_OPTIONS, profile.target_crowd),
    },
  ];
  const hasAny = rows.some((r) => r.value);

  return (
    <div className="mt-2.5 rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-[11px] shadow-2xs">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-violet-200/60 pb-1.5">
        <span className="font-bold text-violet-900 flex items-center gap-1.5">
          <IconSparkles className="h-3.5 w-3.5 text-violet-600" />
          <span>Kết quả phân tích AI</span>
          <span className="font-normal text-violet-700">
            ({SOURCE_LABELS[profile.source] ?? profile.source})
          </span>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-violet-400 hover:text-violet-700 text-xs font-semibold transition"
          title="Đóng"
        >
          Đóng
        </button>
      </div>

      {hasAny ? (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-2">
              <span className="text-slate-500">{r.label}</span>
              <span
                className={
                  r.value ? "text-right font-semibold text-slate-800" : "text-right text-slate-400"
                }
              >
                {r.value || "không xác định"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-500">Không suy ra được cấu hình nào từ tệp này.</p>
      )}

      {profile.notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-violet-200/60 pt-1.5 text-[10px] text-slate-500">
          {profile.notes.map((note, i) => (
            <li key={i}>• {note}</li>
          ))}
        </ul>
      )}

      {hasAny && (
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
          className="mt-2.5 w-full rounded-lg bg-violet-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-violet-700 disabled:opacity-50 shadow-2xs"
        >
          Áp dụng cấu hình này
        </button>
      )}
    </div>
  );
}

export default function MediaLibraryPage() {
  const [ads, setAds] = useState<Creative[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistPublic[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<number, CreativeProfileResult>>({});
  const [analyzing, setAnalyzing] = useState<number | null>(null);

  // View Mode: Bento Grid vs List Table
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<"all" | "video" | "image">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Edit Media Modal
  const [editingMedia, setEditingMedia] = useState<Creative | null>(null);

  // Add to Playlist Modal
  const [targetCreative, setTargetCreative] = useState<Creative | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [allAds, allPlaylists] = await Promise.all([
        api.listAds(),
        api.listPlaylists(),
      ]);
      setAds(allAds);
      setPlaylists(allPlaylists);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const handleAnalyze = async (ad: Creative) => {
    setAnalyzing(ad.id);
    setError(null);
    try {
      const res = await api.analyzeAd(ad.id);
      setProfiles((prev) => ({ ...prev, [ad.id]: res }));
      if (res.source === "none") {
        setInfo(`Không đọc được gì từ "${ad.name}" — xem lý do trong khung phân tích.`);
        setTimeout(() => setInfo(null), 5000);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(null);
    }
  };

  const applyProfile = (ad: Creative, profile: CreativeProfileResult) => {
    const patch: Parameters<typeof api.updateAd>[1] = {};
    if (profile.category) patch.category = profile.category;
    if (profile.target_age_group) patch.target_age_group = profile.target_age_group;
    if (profile.target_gender) patch.target_gender = profile.target_gender;
    if (profile.target_crowd) patch.target_crowd = profile.target_crowd;
    if (Object.keys(patch).length === 0) return;
    act(async () => {
      await api.updateAd(ad.id, patch);
      setProfiles((prev) => {
        const next = { ...prev };
        delete next[ad.id];
        return next;
      });
      setInfo(`Đã áp dụng cấu hình phân tích cho "${ad.name}".`);
      setTimeout(() => setInfo(null), 4000);
    });
  };

  const handleAutoSuggest = async (ad: Creative) => {
    try {
      setBusy(true);
      const res = await api.suggestTarget(ad.name);
      await api.updateAd(ad.id, {
        category: res.category,
        target_age_group: res.target_age_group,
        target_gender: res.target_gender,
      });
      setInfo(
        `Đã gợi ý cho "${ad.name}": ${res.category} (Tuổi: ${res.target_age_group}, Giới tính: ${res.target_gender})`
      );
      setTimeout(() => setInfo(null), 5000);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}p ${rem > 0 ? `${rem}s` : ""}`.trim();
  };

  const handleAddMediaToPlaylist = async (playlistId: number, creativeId: number) => {
    act(async () => {
      const pl = playlists.find((p) => p.id === playlistId);
      await api.addPlaylistItem(playlistId, creativeId);
      setInfo(`Đã thêm tệp vào Playlist "${pl?.name || "được chọn"}"!`);
      setTargetCreative(null);
      setTimeout(() => setInfo(null), 3000);
    });
  };

  // Filtered Media
  const filteredMedia = useMemo(() => {
    return ads.filter((item) => {
      if (filterKind !== "all" && item.kind !== filterKind) return false;
      if (filterCategory !== "all" && item.category !== filterCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchCat = (item.category || "").toLowerCase().includes(q);
        const matchFile = (item.filename || "").toLowerCase().includes(q);
        if (!matchName && !matchCat && !matchFile) return false;
      }
      return true;
    });
  }, [ads, filterKind, filterCategory, searchQuery]);

  return (
    <main className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8 max-w-[1920px] mx-auto">
      {/* ==================== HEADER CARD ==================== */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              <IconMedia className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl tracking-tight">
                Thư Viện Media
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Kho lưu trữ độc lập toàn bộ hình ảnh và video quảng cáo gốc. Tải lên và phân phối vào các Playlist.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-sm cursor-pointer"
            >
              <IconUpload className="h-4 w-4" />
              <span>Tải lên Media mới</span>
            </button>

            <Link
              href="/playlists/new"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 shadow-2xs"
            >
              <IconPlus className="h-4 w-4" />
              <span>Tạo Playlist</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Notifications */}
      {info && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 flex items-center justify-between shadow-2xs">
          <span>{info}</span>
          <button
            onClick={() => setInfo(null)}
            className="text-emerald-700 hover:text-emerald-950 font-semibold"
          >
            Đóng
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 flex items-center justify-between shadow-2xs">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-950 font-semibold"
          >
            Đóng
          </button>
        </div>
      )}
      {/* Upload Media Modal */}
      <UploadMediaModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={(count) => {
          setInfo(`Đã tải lên thành công ${count} tệp vào Thư viện Media!`);
          refresh();
          setTimeout(() => setInfo(null), 4000);
        }}
      />

      {/* Edit Media Modal */}
      <EditMediaModal
        isOpen={Boolean(editingMedia)}
        media={editingMedia}
        onClose={() => setEditingMedia(null)}
        onSaveSuccess={async () => {
          await refresh();
          setInfo("Đã lưu các thuộc tính media thành công!");
          setTimeout(() => setInfo(null), 4000);
        }}
      />

      {/* ==================== BENTO SECTION 2: TOOLBAR & VIEW SWITCHER ==================== */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Search and Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
              <IconSearch className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Tìm kiếm tên tệp, thể loại..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition"
            />
          </div>

          {/* Filter format */}
          <CustomSelect
            value={filterKind}
            onChange={(val) => setFilterKind(val as "all" | "video" | "image")}
            options={[
              { value: "all", label: "Tất cả định dạng" },
              { value: "video", label: "Chỉ Video" },
              { value: "image", label: "Chỉ Hình ảnh" },
            ]}
            className="w-40"
            buttonClassName="bg-slate-50/60 border-slate-200 text-slate-700"
          />

          {/* Filter category */}
          <CustomSelect
            value={filterCategory}
            onChange={setFilterCategory}
            options={[
              { value: "all", label: "Tất cả thể loại" },
              ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: c })),
            ]}
            className="w-44"
            buttonClassName="bg-slate-50/60 border-slate-200 text-slate-700"
          />
        </div>

        {/* Right: Items Count & View Mode Toggle (Grid / List) */}
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-100">
          <span className="text-slate-500 font-medium">
            Hiển thị: <strong className="text-slate-900">{filteredMedia.length}</strong> / {ads.length} tệp
          </span>

          {/* View Mode Toggle: Bento Grid vs List Table */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                viewMode === "grid"
                  ? "bg-white text-emerald-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Chế độ xem Bento Grid"
            >
              <IconGrid className="h-3.5 w-3.5" />
              <span>Lưới</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                viewMode === "list"
                  ? "bg-white text-emerald-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Chế độ xem Danh sách"
            >
              <IconList className="h-3.5 w-3.5" />
              <span>Danh sách</span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================== BENTO SECTION 3: MEDIA ITEMS (GRID OR LIST) ==================== */}
      {viewMode === "grid" ? (
        /* ==================== 3A. BENTO GRID VIEW ==================== */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4.5">
          {filteredMedia.map((item) => (
            <div
              key={item.id}
              className="group rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition hover:border-emerald-400 hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Thumbnail Preview Card */}
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                  {item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(item.url)}
                      alt={item.name}
                      className="h-full w-full object-contain transition duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <video
                      src={mediaUrl(item.url)}
                      muted
                      className="h-full w-full object-contain"
                    />
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-xs">
                      {item.kind === "video" ? (
                        <>
                          <IconVideo className="h-3 w-3" />
                          <span>Video</span>
                        </>
                      ) : (
                        <>
                          <IconImage className="h-3 w-3" />
                          <span>Ảnh</span>
                        </>
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white tabular backdrop-blur-xs">
                      <IconClock className="h-3 w-3" />
                      <span>{item.duration}s</span>
                    </span>
                  </div>
                </div>

                {/* Name & Quick Rename */}
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <input
                      defaultValue={item.name}
                      onBlur={(e) =>
                        e.target.value !== item.name &&
                        act(() => api.updateAd(item.id, { name: e.target.value }))
                      }
                      title="Bấm để sửa tên"
                      className="w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs font-bold text-slate-900 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:bg-white"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 truncate px-1">{item.filename}</p>
                </div>

                {/* Targeting Selectors */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <CustomSelect
                    size="sm"
                    value={item.category || "Chung"}
                    onChange={(val) => act(() => api.updateAd(item.id, { category: val }))}
                    options={CATEGORY_OPTIONS}
                    buttonClassName="bg-slate-50 border-slate-200 text-slate-700"
                  />

                  <CustomSelect
                    size="sm"
                    menuAlign="right"
                    value={item.target_age_group || "all"}
                    onChange={(val) => act(() => api.updateAd(item.id, { target_age_group: val }))}
                    options={AGE_OPTIONS}
                    buttonClassName="bg-indigo-50/70 border-indigo-200 text-indigo-800"
                  />
                </div>

                {/* AI Analysis Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAutoSuggest(item)}
                    disabled={busy}
                    title="AI phân tích tên để đề xuất nhóm đối tượng"
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    <IconSparkles className="h-3 w-3" />
                    <span>AI Gợi ý</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAnalyze(item)}
                    disabled={analyzing !== null}
                    title="AI xem nội dung media: nhận diện độ tuổi, giới tính"
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-50"
                  >
                    <IconSearch className="h-3 w-3" />
                    <span>{analyzing === item.id ? "Đang quét..." : "Phân tích AI"}</span>
                  </button>
                </div>

                {/* AI Result Card if analyzed */}
                {profiles[item.id] && (
                  <ProfilePanel
                    profile={profiles[item.id]}
                    onApply={() => applyProfile(item, profiles[item.id])}
                    onDismiss={() =>
                      setProfiles((prev) => {
                        const next = { ...prev };
                        delete next[item.id];
                        return next;
                      })
                    }
                    busy={busy}
                  />
                )}
              </div>

              {/* Action Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setEditingMedia(item)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs cursor-pointer"
                  title="Chỉnh sửa toàn bộ thuộc tính media"
                >
                  <IconEdit className="h-3.5 w-3.5 text-slate-500" />
                  <span>Sửa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetCreative(item)}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  <span>Playlist</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `Xoá vĩnh viễn tệp "${item.name}" khỏi Thư viện Media? Tệp tin và toàn bộ dữ liệu đo sẽ bị xoá.`
                      )
                    ) {
                      act(() => api.deleteAd(item.id));
                    }
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                  title="Xoá tệp vĩnh viễn"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {!filteredMedia.length && (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <p className="text-sm font-bold text-slate-800">Thư viện Media đang trống hoặc không tìm thấy kết quả</p>
              <p className="mt-1 text-xs text-slate-500">
                Hãy tải lên các file video hoặc hình ảnh quảng cáo bằng nút &quot;Tải lên Media mới&quot; phía trên.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ==================== 3B. LIST TABLE VIEW ==================== */
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[860px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-32">PREVIEW</th>
                  <th className="py-3 px-4">TÊN TỆP & TÊN FILE</th>
                  <th className="py-3 px-3 text-center w-28">ĐỊNH DẠNG</th>
                  <th className="py-3 px-3 text-center w-24">THỜI LƯỢNG</th>
                  <th className="py-3 px-3 w-36">THỂ LOẠI</th>
                  <th className="py-3 px-3 w-44">ĐỘ TUỔI MỤC TIÊU</th>
                  <th className="py-3 px-3 text-center w-40">AI TỰ ĐỘNG</th>
                  <th className="py-3 px-4 text-right w-44">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMedia.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    {/* Thumbnail */}
                    <td className="py-2.5 px-4">
                      <div
                        onClick={() => setEditingMedia(item)}
                        className="relative aspect-video w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 cursor-pointer hover:border-emerald-500 transition group/thumb"
                        title="Bấm để chỉnh sửa thuộc tính media"
                      >
                        {item.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={mediaUrl(item.url)}
                            alt={item.name}
                            className="h-full w-full object-contain group-hover/thumb:scale-105 transition duration-150"
                          />
                        ) : (
                          <video
                            src={mediaUrl(item.url)}
                            muted
                            className="h-full w-full object-contain group-hover/thumb:scale-105 transition duration-150"
                          />
                        )}
                      </div>
                    </td>

                    {/* Name & Filename */}
                    <td className="py-2.5 px-4 max-w-[200px]">
                      <input
                        defaultValue={item.name}
                        onBlur={(e) =>
                          e.target.value !== item.name &&
                          act(() => api.updateAd(item.id, { name: e.target.value }))
                        }
                        title="Bấm để sửa nhanh tên"
                        className="w-full font-bold text-slate-900 hover:border-slate-300 focus:border-emerald-500 focus:bg-white rounded px-1 py-0.5 border border-transparent bg-transparent outline-none truncate"
                      />
                      <p className="text-[10px] text-slate-400 truncate px-1">{item.filename}</p>
                    </td>

                    {/* Format */}
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          item.kind === "video"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {item.kind === "video" ? (
                          <>
                            <IconVideo className="h-3 w-3" />
                            <span>Video</span>
                          </>
                        ) : (
                          <>
                            <IconImage className="h-3 w-3" />
                            <span>Ảnh</span>
                          </>
                        )}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setEditingMedia(item)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono font-medium text-slate-700 hover:bg-slate-100 hover:text-emerald-700 transition cursor-pointer text-xs"
                        title="Bấm để sửa thời lượng phát"
                      >
                        <span>{item.duration}s</span>
                      </button>
                    </td>

                    {/* Category */}
                    <td className="py-2.5 px-3">
                      <select
                        value={item.category || "Chung"}
                        onChange={(e) => act(() => api.updateAd(item.id, { category: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-white hover:border-slate-300 focus:border-emerald-500 focus:bg-white transition cursor-pointer shadow-2xs"
                      >
                        {CATEGORY_OPTIONS.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Target Age */}
                    <td className="py-2.5 px-3">
                      <select
                        value={item.target_age_group || "all"}
                        onChange={(e) => act(() => api.updateAd(item.id, { target_age_group: e.target.value }))}
                        className="w-full rounded-xl border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5 text-xs font-medium text-indigo-800 outline-none hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:bg-white transition cursor-pointer shadow-2xs"
                      >
                        {AGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* AI Buttons */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAutoSuggest(item)}
                          disabled={busy}
                          title="Tự động đề xuất theo tên"
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                        >
                          Gợi ý
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnalyze(item)}
                          disabled={analyzing !== null}
                          title="Phân tích nội dung media"
                          className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50 cursor-pointer"
                        >
                          {analyzing === item.id ? "..." : "Quét AI"}
                        </button>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingMedia(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs cursor-pointer"
                          title="Chỉnh sửa toàn bộ thuộc tính media"
                        >
                          <IconEdit className="h-3.5 w-3.5 text-slate-500" />
                          <span>Sửa</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTargetCreative(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                        >
                          <IconPlus className="h-3.5 w-3.5" />
                          <span>Playlist</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Xoá vĩnh viễn tệp "${item.name}" khỏi Thư viện Media? Tệp tin và toàn bộ dữ liệu đo sẽ bị xoá.`
                              )
                            ) {
                              act(() => api.deleteAd(item.id));
                            }
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                          title="Xoá tệp vĩnh viễn"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!filteredMedia.length && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Không có tệp media nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== MODAL: ADD TO PLAYLIST ==================== */}
      {targetCreative && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Thêm vào Playlist
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-xs mt-0.5">
                  Tệp: <strong>{targetCreative.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setTargetCreative(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Đóng
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              <p className="text-xs text-slate-600 font-medium">Chọn Playlist bạn muốn thêm tệp này vào:</p>
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 transition"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                      <span>{pl.name}</span>
                      {pl.is_active && (
                        <span className="rounded bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.2 font-bold">
                          ĐANG PHÁT
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {pl.item_count} clip · {formatSeconds(pl.total_duration)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAddMediaToPlaylist(pl.id, targetCreative.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs shrink-0"
                  >
                    <IconPlus className="h-3 w-3" />
                    <span>Thêm</span>
                  </button>
                </div>
              ))}

              {!playlists.length && (
                <div className="text-center py-4 text-xs text-slate-500">
                  Chưa có playlist nào. Hãy sang trang &quot;Quản lý Playlist&quot; để tạo một playlist trước.
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link
                href="/playlists"
                className="text-emerald-700 font-semibold hover:underline flex items-center gap-1"
              >
                <IconPlus className="h-3.5 w-3.5" />
                <span>Tạo Playlist mới</span>
              </Link>
              <button
                type="button"
                onClick={() => setTargetCreative(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
