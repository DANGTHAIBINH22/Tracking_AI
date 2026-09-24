"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  IconClose,
  IconEye,
  IconImage,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconVideo,
} from "@/components/icons/Icons";
import { CustomSelect } from "@/components/CustomSelect";
import { AGE_OPTIONS, ANY, CATEGORY_OPTIONS, CROWD_OPTIONS, GENDER_OPTIONS, PET_OPTIONS, STYLE_OPTIONS, WEATHER_OPTIONS, labelFor } from "@/lib/taxonomy";

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
  target_crowd: string;
  target_weather: string;
  target_pet?: string;
  target_style?: string;
};

/** A file waiting to be uploaded, with the targeting that will go up with it.
 *  `id` is a counter rather than the file name: two files can share a name, and
 *  the row a user clicked must keep pointing at the same entry when the list
 *  above it changes. */
type QueuedFile = { id: number; file: File; target: Targeting };

const DEFAULT_TARGET: Targeting = {
  category: "Chung",
  target_age_group: ANY,
  target_gender: ANY,
  target_crowd: ANY,
  target_weather: ANY,
  target_pet: ANY,
  target_style: ANY,
};

/** One line summarising a file's targeting, for the row under its name.
 *  Only the dimensions actually narrowed are worth the space. */
function targetSummary(t: Targeting): string {
  const parts = [
    t.category !== "Chung" ? t.category : null,
    t.target_age_group !== ANY ? labelFor(AGE_OPTIONS, t.target_age_group).split(" (")[0] : null,
    t.target_gender !== ANY ? labelFor(GENDER_OPTIONS, t.target_gender) : null,
    t.target_crowd !== ANY ? labelFor(CROWD_OPTIONS, t.target_crowd).split(" (")[0] : null,
    t.target_weather !== ANY ? labelFor(WEATHER_OPTIONS, t.target_weather) : null,
    t.target_pet && t.target_pet !== ANY ? labelFor(PET_OPTIONS, t.target_pet).split(" (")[0] : null,
    t.target_style && t.target_style !== ANY ? labelFor(STYLE_OPTIONS, t.target_style).split(" (")[0] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Mọi khán giả";
}

export function UploadMediaModal({
  isOpen,
  onClose,
  onUploadSuccess,
}: UploadMediaModalProps) {
  const [items, setItems] = useState<QueuedFile[]>([]);
  // Which file the panel on the right is editing. Null only while the queue is
  // empty — every other state keeps exactly one row selected.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const nextId = useRef(1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setItems([]);
      setEditingId(null);
      setError(null);
      setUploading(false);
      setUploadProgress(0);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !uploading) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, uploading, onClose]);

  const editing = items.find((i) => i.id === editingId) ?? null;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Generate and manage preview URL for currently selected file
  useEffect(() => {
    if (!editing?.file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(editing.file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [editing?.file]);

  if (!isOpen) return null;

  /** Queue files, each carrying its own copy of the targeting.
   *
   *  New arrivals inherit whatever is on screen rather than resetting to the
   *  defaults: dropping ten clips that share an audience should not mean
   *  filling in the same form ten times. Use "Áp dụng cho tất cả" to push the
   *  current settings back over files queued earlier. */
  const addFiles = (files: File[]) => {
    if (!files.length) return;
    const inherited = editing ? { ...editing.target } : { ...DEFAULT_TARGET };
    const queued = files.map((file) => ({
      id: nextId.current++,
      file,
      target: { ...inherited },
    }));
    setItems((prev) => [...prev, ...queued]);
    setEditingId((prev) => prev ?? queued[0].id);
    setError(null);
  };

  const handleFileChange = (files: FileList | null) => {
    if (files?.length) addFiles(Array.from(files));
  };

  const handleRemoveFile = (id: number) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      // Never leave the panel editing a file that is gone: fall back to the
      // neighbour so the right-hand column always has something to show.
      if (id === editingId) setEditingId(next.length ? next[0].id : null);
      return next;
    });
  };

  const handleClearAllFiles = () => {
    setItems([]);
    setEditingId(null);
  };

  /** Edit only the file currently selected. */
  const patchTarget = (patch: Partial<Targeting>) =>
    setItems((prev) =>
      prev.map((i) => (i.id === editingId ? { ...i, target: { ...i.target, ...patch } } : i)),
    );

  /** Copy the selected file's targeting onto every queued file. */
  const applyToAll = () => {
    if (!editing) return;
    const target = { ...editing.target };
    setItems((prev) => prev.map((i) => ({ ...i, target: { ...target } })));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      const newFiles = Array.from(e.dataTransfer.files).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      );
      if (newFiles.length) {
        addFiles(newFiles);
      } else {
        setError("Chỉ chấp nhận các tệp định dạng hình ảnh hoặc video.");
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSizeBytes = items.reduce((acc, i) => acc + i.file.size, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!items.length) {
      setError("Vui lòng chọn ít nhất một tệp để tải lên.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      let completed = 0;
      for (const item of items) {
        // Each file carries its own targeting, so a batch can mix a clip aimed
        // at teenagers with one aimed at pensioners.
        await api.uploadAd(item.file, item.target);
        completed += 1;
        setUploadProgress(Math.round((completed / items.length) * 100));
      }

      onUploadSuccess(items.length);
      onClose();
    } catch (err) {
      setError((err as Error).message || "Đã xảy ra lỗi trong quá trình tải tệp lên.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200/90 animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* ==================== HEADER ==================== */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              <IconUpload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Tải lên Media mới
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thêm hình ảnh hoặc video quảng cáo chất lượng cao vào Thư viện Media
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            title="Đóng modal"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* ==================== BODY (HORIZONTAL 2-COLUMN) ==================== */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {error && (
            <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* ===== LEFT COLUMN: Drag & Drop Zone + Selected Files List (col-span-7) ===== */}
            <div className="lg:col-span-7 space-y-4 flex flex-col">
              
              {/* Compact Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group flex items-center justify-between rounded-xl border-2 border-dashed px-4 py-2.5 cursor-pointer transition ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-50/60"
                    : "border-slate-200 hover:border-emerald-400 bg-slate-50/40 hover:bg-slate-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="video/*,image/*"
                  onChange={(e) => handleFileChange(e.target.files)}
                  className="hidden"
                />
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-2xs border border-slate-200 text-emerald-600 group-hover:scale-105 transition">
                    <IconUpload className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800">
                      Kéo thả tệp tại đây hoặc <span className="text-emerald-600 underline">duyệt từ thiết bị</span>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      MP4, WebM, PNG, JPG, WebP. Tối đa 250MB mỗi tệp.
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-2xs group-hover:bg-emerald-50 group-hover:text-emerald-700 group-hover:border-emerald-200 transition">
                  Chọn tệp
                </span>
              </div>

              {/* Media Preview Player */}
              {editing && previewUrl && (
                <div className="rounded-xl border border-slate-200/90 bg-slate-900 overflow-hidden shadow-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between bg-slate-800/90 px-3.5 py-2 text-[11px] text-slate-200 border-b border-slate-700/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 items-center gap-1 rounded bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-300">
                        <IconEye className="h-3 w-3" />
                        <span>Xem trước</span>
                      </span>
                      <span className="truncate font-medium text-slate-200">{editing.file.name}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400 ml-2 font-mono">
                      {formatFileSize(editing.file.size)}
                    </span>
                  </div>
                  <div className="relative flex items-center justify-center bg-black/60 aspect-video max-h-48 sm:max-h-52 w-full overflow-hidden">
                    {editing.file.type.startsWith("video/") ? (
                      <video
                        key={previewUrl}
                        src={previewUrl}
                        controls
                        playsInline
                        autoPlay
                        muted
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <img
                        key={previewUrl}
                        src={previewUrl}
                        alt={editing.file.name}
                        className="h-full w-full object-contain"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Selected Files Header & List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Tệp đã chọn ({items.length})
                  </span>
                  {items.length > 0 && !uploading && (
                    <button
                      type="button"
                      onClick={handleClearAllFiles}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 transition"
                    >
                      Xóa tất cả
                    </button>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
                    Chưa có tệp nào được chọn. Kéo thả tệp hoặc duyệt từ thiết bị phía trên.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {items.map((item) => {
                      const active = item.id === editingId;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setEditingId(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setEditingId(item.id);
                            }
                          }}
                          className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-xs transition ${
                            active
                              ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/30"
                              : "border-slate-200 bg-white shadow-2xs hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {item.file.type.startsWith("video/") ? (
                                <IconVideo className="h-4 w-4" />
                              ) : (
                                <IconImage className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800 text-xs">
                                {item.file.name}
                              </p>
                              {/* The targeting is the point of the row now, so it
                                  gets the line the file size used to have. */}
                              <p className="truncate text-[10px] text-slate-400">
                                {formatFileSize(item.file.size)} · {targetSummary(item.target)}
                              </p>
                            </div>
                          </div>

                          {!uploading && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile(item.id);
                              }}
                              className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Bỏ tệp này"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ===== RIGHT COLUMN: Cấu hình mục tiêu AI dạng cột (col-span-5) ===== */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 sm:p-5 flex flex-col gap-4">
              
              {/* Header của cột cấu hình */}
              <div className="flex items-center gap-2.5 border-b border-slate-200/70 pb-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <IconSparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Cấu hình mục tiêu AI
                  </h3>
                  {/* Naming the file is what makes it obvious these settings are
                      per-file now, not one config for the whole batch. */}
                  <p className="truncate text-[11px] text-slate-500">
                    {editing ? (
                      <>
                        Đang sửa: <span className="font-semibold text-slate-700">{editing.file.name}</span>
                      </>
                    ) : (
                      "Chọn một tệp bên trái để gắn mục tiêu riêng"
                    )}
                  </p>
                </div>
              </div>

              {/* Stack các trường cấu hình theo cột dọc */}
              <div className="space-y-3 text-xs">
                <CustomSelect
                  label="Thể loại"
                  value={editing?.target.category ?? DEFAULT_TARGET.category}
                  onChange={(v) => patchTarget({ category: v })}
                  options={CATEGORY_OPTIONS}
                  disabled={!editing || uploading}
                />

                <CustomSelect
                  label="Độ tuổi ưu tiên"
                  value={editing?.target.target_age_group ?? ANY}
                  onChange={(v) => patchTarget({ target_age_group: v })}
                  options={AGE_OPTIONS}
                  disabled={!editing || uploading}
                />

                <CustomSelect
                  label="Giới tính ưu tiên"
                  value={editing?.target.target_gender ?? ANY}
                  onChange={(v) => patchTarget({ target_gender: v })}
                  options={GENDER_OPTIONS}
                  disabled={!editing || uploading}
                />

                <CustomSelect
                  label="Quy mô đám đông"
                  value={editing?.target.target_crowd ?? ANY}
                  onChange={(v) => patchTarget({ target_crowd: v })}
                  options={CROWD_OPTIONS}
                  disabled={!editing || uploading}
                />

                <CustomSelect
                  label="Thời tiết"
                  value={editing?.target.target_weather ?? ANY}
                  onChange={(v) => patchTarget({ target_weather: v })}
                  options={WEATHER_OPTIONS}
                  disabled={!editing || uploading}
                />

                <CustomSelect
                  label="Thú cưng đi kèm"
                  value={editing?.target.target_pet ?? ANY}
                  onChange={(v) => patchTarget({ target_pet: v })}
                  options={PET_OPTIONS}
                  disabled={!editing || uploading}
                />

                <CustomSelect
                  label="Phong cách trang phục"
                  value={editing?.target.target_style ?? ANY}
                  onChange={(v) => patchTarget({ target_style: v })}
                  options={STYLE_OPTIONS}
                  disabled={!editing || uploading}
                />

                {/* The old behaviour — one config for the whole batch — in one
                    click, for the common case where every file shares an
                    audience. */}
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={applyToAll}
                    disabled={!editing || uploading}
                    className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                  >
                    Áp dụng cấu hình này cho cả {items.length} tệp
                  </button>
                )}
              </div>

              {/* Gợi ý / giải thích nhỏ */}
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-2.5 text-[11px] text-emerald-800 leading-relaxed">
                Các tệp sau khi tải lên sẽ có thể sử dụng tính năng <span className="font-semibold">AI Phân tích</span> để tự động tinh chỉnh metadata mục tiêu chính xác hơn.
              </div>
            </div>
          </div>

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="space-y-1.5 px-6 py-2.5 bg-emerald-50/50 border-t border-emerald-100">
              <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
                <span>Đang tải lên các tệp vào Thư viện Media...</span>
                <span className="font-mono font-bold text-emerald-700">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full bg-emerald-600 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* ==================== FOOTER ACTIONS ==================== */}
          <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3.5 flex items-center justify-between text-xs">
            <div className="text-slate-500 font-medium text-xs">
              {items.length > 0 ? (
                <span>
                  Đã chọn <strong className="text-slate-800">{items.length}</strong> tệp ({formatFileSize(totalSizeBytes)})
                </span>
              ) : (
                <span>Chưa chọn tệp nào</span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={uploading}
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={uploading || !items.length}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                <IconUpload className="h-4 w-4" />
                <span>
                  {uploading
                    ? `Đang tải lên (${uploadProgress}%)...`
                    : `Tải lên ngay (${items.length} tệp)`}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
