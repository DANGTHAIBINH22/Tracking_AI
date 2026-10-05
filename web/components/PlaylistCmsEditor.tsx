"use client";

import { useRefresh } from "@/lib/useRefresh";
import { Creative, PlaylistPublic, api, mediaUrl } from "@/lib/api";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, Globe, ImageIcon, ListVideo, Play, Plus, Radio, Upload, X } from "lucide-react";
import { IconClose, IconSearch, IconTrash } from "@/components/icons/Icons";
import SelectScreenModal from "@/components/SelectScreenModal";
import { FieldSelect } from "@/components/FieldSelect";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Input } from "@/components/motion/input";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import {
  SortableList,
  SortableListGroup,
  SortableListHandle,
  SortableListItem,
  SortableListItemContent,
  SortableListUndo,
} from "@/components/motion/sortable-list";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

/** One entry of the playlist as edited. `id` is local and stable so a row keeps
 *  its identity while being dragged, even when the same media appears twice. */
type Entry = { id: string; creative: Creative; duration: number };

interface PlaylistCmsEditorProps {
  mode: "create" | "edit";
  playlistId?: number;
}

const ASPECTS = [
  { value: "FullHD Nghiêng", label: "Dọc 9:16 (1080×1920)" },
  { value: "FullHD Ngang", label: "Ngang 16:9 (1920×1080)" },
  { value: "4K (3840x2160)", label: "4K ngang (3840×2160)" },
  { value: "Vuông (1:1)", label: "Vuông 1:1" },
];

// Exactly what POST /api/ads accepts; PDF used to be offered here and was then
// refused by the server.
const ACCEPT = ".mp4,.mov,.webm,.m4v,.avi,.mkv,.jpg,.jpeg,.png,.webp,.gif,.bmp";

function formatDuration(sec: number) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}p ${s % 60}s` : `${m}p`;
}

function MediaThumb({ creative, className }: { creative: Creative; className?: string }) {
  if (creative.kind === "video")
    return <video src={`${mediaUrl(creative.url)}#t=0.5`} muted preload="metadata" className={cn("object-cover", className)} />;
  if (creative.kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaUrl(creative.url)} alt="" className={cn("object-cover", className)} />;
  return (
    <span className={cn("flex items-center justify-center bg-slate-800 text-slate-300", className)}>
      <Globe className="h-4 w-4" />
    </span>
  );
}

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === "video") return <Play className={className} />;
  if (kind === "web") return <Globe className={className} />;
  return <ImageIcon className={className} />;
}

export function PlaylistCmsEditor({ mode, playlistId }: PlaylistCmsEditorProps) {
  const reduce = useReducedMotion();
  const nextKey = useRef(1);
  const key = () => `e${nextKey.current++}`;

  // ---- playlist fields
  const [name, setName] = useState(() => (mode === "create" ? "Playlist mới" : ""));
  // Video Wall was dropped: nothing ever played it differently. Every save
  // writes "slideshow", which also normalises playlists saved as videowall.
  const kind = "slideshow";
  const [aspect, setAspect] = useState("FullHD Nghiêng");
  const [fit, setFit] = useState(false);
  // Not editable here — nothing plays it yet — but kept so a save never resets it.
  const [syncPlayback, setSyncPlayback] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ---- library
  const [library, setLibrary] = useState<Creative[]>([]);
  const [search, setSearch] = useState("");
  const [libKind, setLibKind] = useState<"all" | "video" | "image" | "web">("all");

  // ---- page state
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saved, setSaved] = useState<PlaylistPublic | null>(null);
  const [savedSig, setSavedSig] = useState<string>("");
  const [publishing, setPublishing] = useState<PlaylistPublic | null>(null);
  const [showWeb, setShowWeb] = useState(false);
  const [web, setWeb] = useState({ title: "", url: "", duration: 15 });
  const fileRef = useRef<HTMLInputElement>(null);

  const signature = (n: string, k: string, a: string, f: boolean, list: Entry[]) =>
    JSON.stringify([n.trim(), k, a, f, list.map((e) => [e.creative.id, e.duration])]);
  const dirty = signature(name, kind, aspect, fit, entries) !== savedSig;

  const flash = (msg: string) => {
    setInfo(msg);
    setTimeout(() => setInfo((cur) => (cur === msg ? null : cur)), 3000);
  };

  const applyLoaded = useCallback((data: PlaylistPublic) => {
    const list = data.items.map((it) => ({
      id: `e${nextKey.current++}`,
      creative: it.creative,
      duration: it.duration || it.creative.duration || 5,
    }));
    const k = "slideshow";
    setSaved(data);
    setName(data.name);
    setAspect(data.aspect_ratio || "FullHD Nghiêng");
    setFit(Boolean(data.fit_screen));
    setSyncPlayback(Boolean(data.sync_playback));
    setEntries(list);
    setSelectedId(list[0]?.id ?? null);
    setSavedSig(
      JSON.stringify([data.name.trim(), k, data.aspect_ratio || "FullHD Nghiêng", Boolean(data.fit_screen), list.map((e) => [e.creative.id, e.duration])]),
    );
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !playlistId) return;
    api
      .getPlaylist(playlistId)
      .then(applyLoaded)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [mode, playlistId, applyLoaded]);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await api.listAds());
    } catch (err) {
      console.error(err);
    }
  }, []);
  useRefresh(refreshLibrary);

  // Leaving with unsaved edits used to drop them silently.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
  const usage = useMemo(() => {
    const m = new Map<number, number>();
    entries.forEach((e) => m.set(e.creative.id, (m.get(e.creative.id) ?? 0) + 1));
    return m;
  }, [entries]);

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter(
      (c) => (libKind === "all" || c.kind === libKind) && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [library, search, libKind]);

  /** Append a media to the end of the playlist and select it. */
  const addEntry = (creative: Creative) => {
    const entry: Entry = { id: key(), creative, duration: creative.duration > 0 ? Math.round(creative.duration * 10) / 10 : 10 };
    setEntries((prev) => [...prev, entry]);
    setSelectedId(entry.id);
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (id === selectedId) {
        const at = prev.findIndex((e) => e.id === id);
        setSelectedId(next[Math.min(at, next.length - 1)]?.id ?? null);
      }
      return next;
    });
  };

  const setDuration = (id: string, value: number) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, duration: value } : e)));

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        addEntry(await api.uploadAd(file));
      }
      await refreshLibrary();
      flash(`Đã tải lên và thêm ${files.length} tệp.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAddWeb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!web.title.trim() || !web.url.trim()) return;
    setSaving(true);
    try {
      const creative = await api.addUrlCreative({
        name: web.title.trim(),
        url: web.url.trim(),
        duration: web.duration,
        category: "Web/Dashboard",
      });
      addEntry(creative);
      await refreshLibrary();
      setShowWeb(false);
      setWeb({ title: "", url: "", duration: 15 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** Save fields and items; the item list goes up in one transaction. */
  const save = async (): Promise<PlaylistPublic | null> => {
    if (!name.trim()) {
      setError("Nhập tên playlist.");
      return null;
    }
    if (entries.some((e) => !(e.duration > 0))) {
      setError("Mỗi mục cần thời lượng lớn hơn 0 giây.");
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const fields = { name: name.trim(), kind, aspect_ratio: aspect, fit_screen: fit, sync_playback: syncPlayback };
      const id = saved?.id ?? playlistId ?? (await api.createPlaylist({ ...fields, is_active: false })).id;
      if (saved?.id || playlistId) await api.updatePlaylist(id, fields);
      const result = await api.replacePlaylistItems(
        id,
        entries.map((e) => ({ creative_id: e.creative.id, duration: e.duration })),
      );
      applyLoaded(result);
      flash("Đã lưu playlist.");
      // A new playlist now has an address. Rewrite the URL in place rather than
      // navigating: a navigation remounts the editor and would drop the
      // publish dialog that "Lưu & phát" is about to open.
      if (mode === "create") window.history.replaceState(null, "", `/playlists/${id}`);
      return result;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveAndPublish = async () => {
    const result = dirty || !saved ? await save() : saved;
    if (!result) return;
    if (!result.item_count) {
      setError("Thêm ít nhất một media trước khi phát.");
      return;
    }
    setPublishing(result);
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-xs text-slate-500">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          Đang tải playlist…
        </div>
      </div>
    );
  }

  const isPortrait = aspect === "FullHD Nghiêng";
  const isSquare = aspect.startsWith("Vuông");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-slate-800">
      {/* ==================== TOP BAR ==================== */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Link
            href="/playlists"
            onClick={(e) => dirty && !confirm("Bỏ các thay đổi chưa lưu?") && e.preventDefault()}
            aria-label="Quay lại danh sách playlist"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên playlist"
            aria-label="Tên playlist"
            className="min-w-0 max-w-md flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-bold text-slate-900 outline-none transition hover:border-slate-200 focus:border-emerald-500 focus:bg-white"
          />
          {saved?.is_active && (
            <AnimatedBadge size="sm" status="success" pulse icon={<Radio className="h-3 w-3" />} className="shrink-0">
              Đang phát
            </AnimatedBadge>
          )}
          <span className={cn("hidden shrink-0 text-[11px] sm:inline", dirty ? "font-semibold text-amber-600" : "text-slate-400")}>
            {dirty ? "● Chưa lưu" : saved ? "Đã lưu" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving || (!dirty && Boolean(saved))}
            onClick={save}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
          <button
            type="button"
            disabled={saving || entries.length === 0}
            onClick={saveAndPublish}
            title={entries.length === 0 ? "Thêm media trước khi phát" : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Radio className="h-3.5 w-3.5" />
            {dirty || !saved ? "Lưu & phát" : "Phát lên thiết bị"}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {(error || info) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
            className="shrink-0 overflow-hidden"
          >
            <div
              className={cn(
                "flex items-center justify-between gap-2 px-4 py-2 text-xs font-medium",
                error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800",
              )}
            >
              <span className="flex items-center gap-1.5">
                {error && <CircleAlert className="h-3.5 w-3.5" />}
                {error || info}
              </span>
              <button onClick={() => (error ? setError(null) : setInfo(null))} aria-label="Đóng">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== WORKSPACE ==================== */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[340px_minmax(0,1fr)_320px] lg:overflow-hidden">
        {/* ----- Left: the playlist ----- */}
        <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-white lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-xs font-bold text-slate-900">Danh sách phát</h2>
              <p className="text-[11px] text-slate-500">
                {entries.length} mục · {formatDuration(totalDuration)} mỗi vòng
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {entries.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <ListVideo className="h-6 w-6 text-slate-300" />
                <p className="text-xs font-semibold text-slate-700">Playlist đang trống</p>
                <p className="text-[11px] text-slate-500">Bấm vào media ở thư viện bên phải để thêm vào cuối danh sách.</p>
              </div>
            ) : (
              <SortableList
                items={entries}
                onItemsChange={setEntries}
                getItemLabel={(e) => e.creative.name}
                label="Thứ tự phát"
                className="max-w-none"
              >
                {(items) => (
                  <>
                    <SortableListGroup className="space-y-1.5">
                      {items.map((entry, index) => {
                        const active = entry.id === selectedId;
                        return (
                          <SortableListItem
                            key={entry.id}
                            id={entry.id}
                            onClick={() => setSelectedId(entry.id)}
                            className={cn(
                              "cursor-pointer gap-2 rounded-xl p-1.5 pr-2",
                              active ? "border-emerald-400 bg-emerald-50/60" : "hover:border-slate-300",
                            )}
                          >
                            <SortableListHandle className="size-7" />
                            <span className="w-4 shrink-0 text-center text-[10px] font-bold text-slate-400 tabular">{index + 1}</span>
                            <MediaThumb creative={entry.creative} className="h-10 w-14 shrink-0 rounded-md bg-slate-900" />
                            <SortableListItemContent>
                              <p className="truncate text-xs font-semibold text-slate-800">{entry.creative.name}</p>
                              <label
                                className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <KindIcon kind={entry.creative.kind} className="h-3 w-3" />
                                <input
                                  type="number"
                                  min={1}
                                  step={0.5}
                                  value={entry.duration}
                                  onChange={(e) => setDuration(entry.id, Number(e.target.value))}
                                  aria-label={`Thời lượng ${entry.creative.name}`}
                                  className="w-14 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-[10px] font-semibold text-slate-800 tabular outline-none focus:border-emerald-500"
                                />
                                giây
                              </label>
                            </SortableListItemContent>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeEntry(entry.id);
                              }}
                              aria-label={`Bỏ ${entry.creative.name}`}
                              className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                            </button>
                          </SortableListItem>
                        );
                      })}
                    </SortableListGroup>
                    <SortableListUndo className="mt-2" />
                  </>
                )}
              </SortableList>
            )}
          </div>
        </aside>

        {/* ----- Center: preview + display settings ----- */}
        <main className="flex min-h-0 flex-col bg-slate-100/80">
          <div className="flex min-h-80 flex-1 items-center justify-center p-5">
            <div
              className={cn(
                "relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-slate-950 shadow-xl",
                isPortrait ? "aspect-9/16 h-full max-h-[70vh]" : isSquare ? "aspect-square h-full max-h-[60vh]" : "aspect-video w-full max-w-3xl",
              )}
            >
              {selected ? (
                <>
                  {selected.creative.kind === "video" ? (
                    <video
                      key={selected.id}
                      src={mediaUrl(selected.creative.url)}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className={cn("h-full w-full", fit ? "object-cover" : "object-contain")}
                    />
                  ) : selected.creative.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={selected.id}
                      src={mediaUrl(selected.creative.url)}
                      alt={selected.creative.name}
                      className={cn("h-full w-full", fit ? "object-cover" : "object-contain")}
                    />
                  ) : (
                    <iframe key={selected.id} src={selected.creative.url} title={selected.creative.name} className="h-full w-full border-0 bg-white" />
                  )}
                  <span className="absolute bottom-2.5 left-2.5 max-w-[85%] truncate rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                    {entries.findIndex((e) => e.id === selected.id) + 1}/{entries.length} · {selected.creative.name} · {selected.duration}s
                  </span>
                </>
              ) : (
                <p className="px-6 text-center text-xs text-slate-400">Chọn một mục trong danh sách để xem trước</p>
              )}
            </div>
          </div>

          <div className="relative z-10 flex shrink-0 flex-wrap items-end gap-4 border-t border-slate-200 bg-white px-4 py-3">
            <FieldSelect label="Tỷ lệ khung" value={aspect} onChange={setAspect} options={ASPECTS} className="w-52" />
            <div className="pb-1.5">
              <Switch checked={fit} onCheckedChange={setFit} label="Lấp đầy khung (cắt viền)" />
            </div>
            <p className="basis-full text-[11px] text-slate-400">
              Tỷ lệ và chế độ lấp đầy hiện chỉ áp dụng cho khung xem trước; màn hình thật luôn hiển thị trọn nội dung.
            </p>
          </div>
        </main>

        {/* ----- Right: media library ----- */}
        <aside className="flex min-h-0 flex-col border-t border-slate-200 bg-white lg:border-t-0 lg:border-l">
          <div className="space-y-2.5 border-b border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900">Thư viện media</h2>
              <span className="text-[11px] text-slate-400">Bấm để thêm</span>
            </div>
            <Input
              value={search}
              onChange={setSearch}
              placeholder="Tìm media…"
              aria-label="Tìm media"
              leftIcon={<IconSearch />}
              classNames={{ field: "h-8 rounded-lg bg-slate-50/60", input: "text-xs" }}
            />
            <Tabs value={libKind} onValueChange={(v) => setLibKind(v as typeof libKind)} variant="segment">
              <TabsList className="w-full border border-slate-200 bg-slate-100">
                {(
                  [
                    ["all", "Tất cả"],
                    ["video", "Video"],
                    ["image", "Ảnh"],
                    ["web", "Web"],
                  ] as const
                ).map(([v, l]) => (
                  <TabsTrigger key={v} value={v}>
                    <span className="text-[11px]">{l}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="grid grid-cols-2 gap-2">
              <input ref={fileRef} type="file" multiple accept={ACCEPT} onChange={(e) => handleUpload(e.target.files)} className="hidden" />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Đang tải…" : "Tải lên"}
              </button>
              <button
                type="button"
                onClick={() => setShowWeb(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Globe className="h-3.5 w-3.5" />
                Trang web
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {filteredLibrary.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                {library.length ? "Không có media khớp tìm kiếm." : "Thư viện trống — tải media lên để bắt đầu."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredLibrary.map((c) => {
                  const count = usage.get(c.id) ?? 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addEntry(c)}
                      title={`Thêm "${c.name}" vào cuối danh sách`}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border text-left transition",
                        count ? "border-emerald-300" : "border-slate-200 hover:border-emerald-400",
                      )}
                    >
                      <div className="relative aspect-video bg-slate-900">
                        <MediaThumb creative={c} className="h-full w-full" />
                        <span className="absolute inset-0 flex items-center justify-center bg-emerald-600/0 text-white opacity-0 transition group-hover:bg-emerald-600/45 group-hover:opacity-100">
                          <Plus className="h-6 w-6" />
                        </span>
                        {count > 0 && (
                          <span className="absolute top-1 right-1 rounded-md bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                            ×{count}
                          </span>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="truncate text-[11px] font-semibold text-slate-800">{c.name}</p>
                        <p className="flex items-center gap-1 text-[10px] text-slate-400">
                          <KindIcon kind={c.kind} className="h-2.5 w-2.5" />
                          {formatDuration(c.duration)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ==================== WEB URL ==================== */}
      {showWeb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs" onClick={() => setShowWeb(false)}>
          <form
            onSubmit={handleAddWeb}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Thêm trang web</h3>
              <button type="button" onClick={() => setShowWeb(false)} aria-label="Đóng" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input label="Tên hiển thị" value={web.title} onChange={(v) => setWeb({ ...web, title: v })} placeholder="Bảng giá, dashboard…" required autoFocus classNames={{ field: "h-9 rounded-xl", input: "text-xs", label: "text-xs" }} />
            <Input label="Địa chỉ (URL)" type="url" value={web.url} onChange={(v) => setWeb({ ...web, url: v })} placeholder="https://…" required classNames={{ field: "h-9 rounded-xl", input: "text-xs", label: "text-xs" }} />
            <Input
              label="Thời lượng (giây)"
              type="number"
              min={5}
              value={String(web.duration)}
              onChange={(v) => setWeb({ ...web, duration: Number(v) })}
              classNames={{ field: "h-9 rounded-xl", input: "text-xs", label: "text-xs" }}
            />
            <p className="text-[11px] text-slate-500">Một số trang chặn hiển thị trong khung (iframe) và sẽ hiện trống trên màn hình.</p>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setShowWeb(false)} className="rounded-xl border border-slate-200 px-3.5 py-2 font-medium text-slate-600 hover:bg-slate-50">
                Huỷ
              </button>
              <button type="submit" disabled={saving || !web.title.trim() || !web.url.trim()} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                Thêm vào playlist
              </button>
            </div>
          </form>
        </div>
      )}

      {publishing && (
        <SelectScreenModal
          playlist={publishing}
          onClose={() => setPublishing(null)}
          onSuccess={async () => {
            setPublishing(null);
            if (saved?.id) applyLoaded(await api.getPlaylist(saved.id));
            flash("Đã cập nhật phát playlist lên thiết bị.");
          }}
        />
      )}
    </div>
  );
}
