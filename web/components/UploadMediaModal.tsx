"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleCheck, CircleAlert, LoaderCircle, Play, WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import { IconClose, IconImage, IconTrash, IconUpload } from "@/components/icons/Icons";
import { FieldSelect } from "@/components/FieldSelect";
import { TargetMultiSelect } from "@/components/TargetMultiSelect";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import {
  AGE_OPTIONS,
  ANY,
  CATEGORY_OPTIONS,
  GENDER_OPTIONS,
  PET_OPTIONS,
  STYLE_OPTIONS,
  WEATHER_OPTIONS,
  tagsLabel,
} from "@/lib/taxonomy";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

interface UploadMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (count: number) => void;
}

/** Targeting for one file. Mirrors the Form fields `POST /api/ads` accepts. */
type Targeting = {
  category: string;
  target_age_group: string;
  target_gender: string;
  target_weather: string;
  target_pet: string;
  target_style: string;
};

type Status = "queued" | "uploading" | "done" | "error";

/** A file waiting to be uploaded, with the targeting that will go up with it.
 *  `id` is a counter rather than the file name: two files can share a name, and
 *  the row a user clicked must keep pointing at the same entry when the list
 *  above it changes. `url` is the file's object URL, owned by this entry. */
type QueuedFile = {
  id: number;
  file: File;
  url: string;
  target: Targeting;
  status: Status;
  error?: string;
  note?: string;
};

const DEFAULT_TARGET: Targeting = {
  category: "Chung",
  target_age_group: ANY,
  target_gender: ANY,
  target_weather: ANY,
  target_pet: ANY,
  target_style: ANY,
};

// Exactly the suffixes `upload_ad` in server/routes/ads.py accepts. Checking
// here means an unsupported file is refused when it is added, not halfway
// through a batch with the files before it already uploaded.
const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
const VIDEO_EXT = [".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"];
const suffix = (name: string) => (name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
const isVideo = (f: File) => VIDEO_EXT.includes(suffix(f.name));
const isSupported = (f: File) => isVideo(f) || IMAGE_EXT.includes(suffix(f.name));

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One line summarising a file's targeting. Only narrowed dimensions count. */
function targetSummary(t: Targeting): string {
  const short = (opts: typeof AGE_OPTIONS, v: string) => tagsLabel(opts, v);
  const parts = [
    t.category !== "Chung" ? t.category : null,
    t.target_age_group !== ANY ? short(AGE_OPTIONS, t.target_age_group) : null,
    t.target_gender !== ANY ? short(GENDER_OPTIONS, t.target_gender) : null,
    t.target_weather !== ANY ? short(WEATHER_OPTIONS, t.target_weather) : null,
    t.target_pet !== ANY ? short(PET_OPTIONS, t.target_pet) : null,
    t.target_style !== ANY ? short(STYLE_OPTIONS, t.target_style) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Mọi khán giả";
}

function StatusBadge({ item }: { item: QueuedFile }) {
  if (item.status === "uploading")
    return (
      <AnimatedBadge size="sm" status="loading" className="shrink-0">
        Đang tải
      </AnimatedBadge>
    );
  if (item.status === "done")
    return (
      <AnimatedBadge size="sm" status="success" icon={<CircleCheck className="h-3 w-3" />} className="shrink-0">
        Xong
      </AnimatedBadge>
    );
  if (item.status === "error")
    return (
      <AnimatedBadge
        size="sm"
        status="danger"
        icon={<CircleAlert className="h-3 w-3" />}
        className="shrink-0"
        title={item.error}
      >
        Lỗi
      </AnimatedBadge>
    );
  return null;
}

export function UploadMediaModal({ isOpen, onClose, onUploadSuccess }: UploadMediaModalProps) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<QueuedFile[]>([]);
  // Which file the panel on the right is editing. Null only while the queue is
  // empty — every other state keeps exactly one row selected.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Clip only while the fold animates; once open, a select panel inside it
  // must be free to hang past the edge.
  const [advancedSettled, setAdvancedSettled] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const nextId = useRef(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs live exactly as long as their entry. The ref lets the unmount
  // cleanup see the latest queue without re-running on every change.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  // Reset modal state each time it opens. Adjusted during render (React's
  // "adjust state on prop change"), so last time's queue is never painted.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      items.forEach((i) => URL.revokeObjectURL(i.url));
      setItems([]);
      setEditingId(null);
      setError(null);
      setUploading(false);
      setShowAdvanced(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !uploading) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, uploading, onClose]);

  if (!isOpen) return null;

  const editing = items.find((i) => i.id === editingId) ?? null;
  const pending = items.filter((i) => i.status !== "done");
  const doneCount = items.length - pending.length;
  const locked = uploading || editing?.status === "done";

  /** Queue files, each carrying its own copy of the targeting.
   *
   *  New arrivals inherit whatever is on screen rather than resetting to the
   *  defaults: dropping ten clips that share an audience should not mean
   *  filling in the same form ten times. */
  const addFiles = (files: File[]) => {
    const ok = files.filter(isSupported);
    const rejected = files.filter((f) => !isSupported(f));
    setError(
      rejected.length
        ? `Bỏ qua ${rejected.length} tệp không hỗ trợ (${rejected.map((f) => f.name).join(", ")}). Chỉ nhận ${[...VIDEO_EXT, ...IMAGE_EXT].join(" ")}.`
        : null,
    );
    if (!ok.length) return;
    const inherited = editing ? { ...editing.target } : { ...DEFAULT_TARGET };
    const queued: QueuedFile[] = ok.map((file) => ({
      id: nextId.current++,
      file,
      url: URL.createObjectURL(file),
      target: { ...inherited },
      status: "queued",
    }));
    setItems((prev) => [...prev, ...queued]);
    setEditingId((prev) => prev ?? queued[0].id);
  };

  const handleRemoveFile = (id: number) => {
    const gone = items.find((i) => i.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    // Never leave the panel editing a file that is gone.
    if (id === editingId) setEditingId(next[0]?.id ?? null);
  };

  const handleClearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
    setEditingId(null);
  };

  const update = (id: number, patch: Partial<QueuedFile>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  /** Edit only the file currently selected. */
  const patchTarget = (patch: Partial<Targeting>) =>
    setItems((prev) =>
      prev.map((i) => (i.id === editingId ? { ...i, target: { ...i.target, ...patch }, note: undefined } : i)),
    );

  /** Copy the selected file's targeting onto every file still to upload. */
  const applyToAll = () => {
    if (!editing) return;
    const target = { ...editing.target };
    setItems((prev) => prev.map((i) => (i.status === "done" ? i : { ...i, target: { ...target } })));
  };

  /** Fill targets from the file name. Only keyword hits are applied: "all"
   *  back from the matcher means it found nothing, not "aim at everyone". */
  const suggestFromName = async () => {
    if (!editing) return;
    const id = editing.id;
    setSuggesting(true);
    try {
      const res = await api.suggestTarget(editing.file.name.replace(/\.[^.]+$/, ""));
      const patch: Partial<Targeting> = {};
      if (res.category && res.category !== "Chung") patch.category = res.category;
      if (res.target_age_group !== ANY) patch.target_age_group = res.target_age_group;
      if (res.target_gender !== ANY) patch.target_gender = res.target_gender;
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                target: { ...i.target, ...patch },
                note: Object.keys(patch).length ? res.reason : "Tên tệp không chứa từ khoá nào để gợi ý.",
              }
            : i,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  };

  /** Upload what has not gone up yet. A file that succeeded is marked done and
   *  skipped on retry: re-sending the whole queue after one failure put every
   *  earlier file in the library twice. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending.length) return;
    setUploading(true);
    setError(null);
    let ok = 0;
    let failed = 0;
    for (const item of pending) {
      update(item.id, { status: "uploading", error: undefined });
      try {
        await api.uploadAd(item.file, item.target);
        update(item.id, { status: "done" });
        ok += 1;
      } catch (err) {
        update(item.id, { status: "error", error: (err as Error).message || "Tải lên thất bại" });
        failed += 1;
      }
    }
    setUploading(false);
    if (ok) onUploadSuccess(ok);
    if (failed) {
      setError(`${failed} tệp chưa tải lên được. Kiểm tra lỗi trên từng tệp rồi bấm “Thử lại”.`);
    } else {
      onClose();
    }
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    },
    onDrop: handleDrop,
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept={[...VIDEO_EXT, ...IMAGE_EXT].join(",")}
      onChange={(e) => {
        if (e.target.files?.length) addFiles(Array.from(e.target.files));
        e.target.value = ""; // picking the same file again must fire onChange
      }}
      className="hidden"
    />
  );

  const t = editing?.target ?? DEFAULT_TARGET;
  const advancedSet = [t.target_weather, t.target_pet, t.target_style].filter((v) => v !== ANY).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs sm:p-6">
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: EASE_OUT }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl",
          items.length ? "max-w-5xl" : "max-w-2xl",
        )}
      >
        {/* ==================== HEADER ==================== */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              <IconUpload className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 id="upload-title" className="text-sm font-bold text-slate-900 sm:text-base">
                Tải lên media
              </h2>
              <p className="text-xs text-slate-500">Mỗi tệp mang đối tượng nhắm tới riêng để chọn quảng cáo thông minh.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          {error && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 sm:mx-6">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 wrap-break-word">{error}</span>
            </div>
          )}
          {fileInput}

          {!items.length ? (
            /* ==================== EMPTY: one big drop target ==================== */
            <div className="p-5 sm:p-6">
              <button
                type="button"
                {...dropHandlers}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition",
                  isDragging
                    ? "border-emerald-500 bg-emerald-50/70"
                    : "border-slate-200 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/30",
                )}
              >
                <span
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-emerald-600 shadow-xs transition",
                    isDragging ? "scale-110" : "group-hover:scale-105",
                  )}
                >
                  <IconUpload className="h-6 w-6" />
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  {isDragging ? "Thả để thêm vào hàng đợi" : "Kéo thả video hoặc hình ảnh vào đây"}
                </span>
                <span className="text-xs text-slate-500">
                  hoặc <span className="font-semibold text-emerald-700 underline underline-offset-2">chọn từ thiết bị</span>{" "}
                  — chọn được nhiều tệp cùng lúc
                </span>
                <span className="mt-1 text-[11px] text-slate-400">MP4 · MOV · WebM · M4V · AVI · MKV · JPG · PNG · WebP · GIF · BMP</span>
              </button>
            </div>
          ) : (
            /* ==================== QUEUE + EDITOR ==================== */
            <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 sm:p-6 lg:grid-cols-12">
              {/* ----- Left: queue ----- */}
              <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
                <button
                  type="button"
                  {...dropHandlers}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-xs font-semibold transition disabled:opacity-50",
                    isDragging
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700",
                  )}
                >
                  <IconUpload className="h-4 w-4" />
                  Thêm tệp
                </button>

                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Hàng đợi · {items.length}
                  </span>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[11px] font-semibold text-slate-400 transition hover:text-rose-600"
                    >
                      Xoá tất cả
                    </button>
                  )}
                </div>

                <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
                  <AnimatePresence initial={false}>
                    {items.map((item) => {
                      const active = item.id === editingId;
                      return (
                        <motion.li
                          key={item.id}
                          layout={!reduce}
                          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18, ease: EASE_OUT }}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setEditingId(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEditingId(item.id);
                              }
                            }}
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 text-xs transition",
                              active
                                ? "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-500/20"
                                : "border-slate-200 bg-white hover:border-slate-300",
                              item.status === "error" && !active && "border-rose-200",
                            )}
                          >
                            <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-slate-900">
                              {isVideo(item.file) ? (
                                <>
                                  <video src={`${item.url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />
                                  <Play className="absolute inset-0 m-auto h-3.5 w-3.5 fill-white text-white" />
                                </>
                              ) : (
                                // A local blob: preview; next/image has nothing to optimise.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.url} alt="" className="h-full w-full object-cover" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-slate-800">{item.file.name}</p>
                              <p className={cn("truncate text-[10px]", item.status === "error" ? "text-rose-600" : "text-slate-400")}>
                                {item.status === "error"
                                  ? item.error
                                  : `${formatFileSize(item.file.size)} · ${targetSummary(item.target)}`}
                              </p>
                            </div>
                            <StatusBadge item={item} />
                            {!uploading && item.status !== "done" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveFile(item.id);
                                }}
                                aria-label={`Bỏ ${item.file.name}`}
                                className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              >
                                <IconTrash className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>

              {/* ----- Right: preview + targeting of the selected file ----- */}
              {editing && (
                <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                    <div className="relative aspect-video max-h-60 w-full">
                      {isVideo(editing.file) ? (
                        <video key={editing.url} src={editing.url} controls playsInline muted className="h-full w-full object-contain" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={editing.url} src={editing.url} alt={editing.file.name} className="h-full w-full object-contain" />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-1.5 text-[11px] text-slate-300">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {isVideo(editing.file) ? <Play className="h-3 w-3 shrink-0" /> : <IconImage className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{editing.file.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-slate-400">{formatFileSize(editing.file.size)}</span>
                    </div>
                  </div>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-800">Đối tượng nhắm tới</h3>
                      <button
                        type="button"
                        onClick={suggestFromName}
                        disabled={locked || suggesting}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        {suggesting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                        Gợi ý từ tên tệp
                      </button>
                    </div>

                    <p className="text-[11px] leading-snug text-slate-500">
                      Không cần chọn quy mô: camera tự đếm người xem và ưu tiên quảng cáo nhắm đúng nhóm đông nhất.
                      Để “Tất cả” nếu quảng cáo dành cho mọi người — nó sẽ phát theo vòng bình thường.
                    </p>

                    {editing.note && (
                      <p className="rounded-lg bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900">{editing.note}</p>
                    )}

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <FieldSelect
                        label="Thể loại"
                        value={t.category}
                        onChange={(v) => patchTarget({ category: v })}
                        options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
                        disabled={locked}
                      />
                      <TargetMultiSelect
                        label="Độ tuổi (chọn được nhiều)"
                        value={t.target_age_group}
                        onChange={(v) => patchTarget({ target_age_group: v })}
                        options={AGE_OPTIONS}
                        disabled={locked}
                      />
                      <FieldSelect
                        label="Giới tính"
                        value={t.target_gender}
                        onChange={(v) => patchTarget({ target_gender: v })}
                        options={GENDER_OPTIONS}
                        disabled={locked}
                      />
                    </div>

                    {/* Weather, pets and clothing only move the score when their
                        detectors are on, so they stay folded until wanted. */}
                    <div className="rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setShowAdvanced((v) => !v)}
                        aria-expanded={showAdvanced}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-700"
                      >
                        <span className="flex items-center gap-2">
                          Bối cảnh nâng cao
                          {advancedSet > 0 && (
                            <span className="rounded-full bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-700">
                              {advancedSet} đã đặt
                            </span>
                          )}
                        </span>
                        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", showAdvanced && "rotate-180")} />
                      </button>
                      <AnimatePresence initial={false}>
                        {showAdvanced && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
                            onAnimationStart={() => setAdvancedSettled(false)}
                            onAnimationComplete={() => setAdvancedSettled(showAdvanced)}
                            className={advancedSettled ? "overflow-visible" : "overflow-hidden"}
                          >
                            <div className="grid grid-cols-1 gap-2.5 border-t border-slate-100 p-3 sm:grid-cols-3">
                              <TargetMultiSelect
                                label="Thời tiết"
                                value={t.target_weather}
                                onChange={(v) => patchTarget({ target_weather: v })}
                                options={WEATHER_OPTIONS}
                                disabled={locked}
                              />
                              <TargetMultiSelect
                                label="Thú cưng"
                                value={t.target_pet}
                                onChange={(v) => patchTarget({ target_pet: v })}
                                options={PET_OPTIONS}
                                exclusive={["none"]}
                                disabled={locked}
                              />
                              <TargetMultiSelect
                                label="Phong cách"
                                value={t.target_style}
                                onChange={(v) => patchTarget({ target_style: v })}
                                options={STYLE_OPTIONS}
                                disabled={locked}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {pending.length > 1 && (
                      <button
                        type="button"
                        onClick={applyToAll}
                        disabled={locked}
                        className="w-full rounded-xl border border-emerald-300 bg-emerald-50/50 px-3 py-2 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Áp dụng đối tượng này cho cả {pending.length} tệp
                      </button>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}

          {/* ==================== FOOTER ==================== */}
          <div className="border-t border-slate-100 bg-slate-50/60">
            {(uploading || doneCount > 0) && items.length > 0 && (
              <div className="h-1 w-full bg-slate-200/70">
                <motion.div
                  className="h-full bg-emerald-600"
                  animate={{ width: `${Math.round((doneCount / items.length) * 100)}%` }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs sm:px-6">
              <span className="font-medium text-slate-500">
                {items.length ? (
                  <>
                    <strong className="text-slate-800">{items.length}</strong> tệp ·{" "}
                    {formatFileSize(items.reduce((a, i) => a + i.file.size, 0))}
                    {doneCount > 0 && <span className="text-emerald-700"> · đã lên {doneCount}</span>}
                  </>
                ) : (
                  "Chưa chọn tệp nào"
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                >
                  {doneCount > 0 ? "Đóng" : "Huỷ"}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !pending.length}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <IconUpload className="h-4 w-4" />}
                  {uploading
                    ? `Đang tải ${doneCount + 1}/${items.length}…`
                    : items.some((i) => i.status === "error")
                      ? `Thử lại ${pending.length} tệp`
                      : `Tải lên ${pending.length} tệp`}
                </button>
              </div>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
