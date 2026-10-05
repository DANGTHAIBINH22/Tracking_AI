"use client";

import React, { useState } from "react";
import {
  Creative,
  api,
  mediaUrl,
} from "@/lib/api";
import {
  AGE_OPTIONS,
  CATEGORY_OPTIONS,
  GENDER_OPTIONS,
  PET_OPTIONS,
  STYLE_OPTIONS,
  WEATHER_OPTIONS,
} from "@/lib/taxonomy";
import { TargetMultiSelect } from "@/components/TargetMultiSelect";
import {
  IconClose,
  IconImage,
  IconSearch,
  IconSparkles,
  IconVideo,
} from "@/components/icons/Icons";

interface EditMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: Creative | null;
  onSaveSuccess: (updated: Creative) => void;
}

export function EditMediaModal({
  isOpen,
  onClose,
  media,
  onSaveSuccess,
}: EditMediaModalProps) {
  // Form fields start from `media`. The parent keys this component by the
  // media id, so opening another creative remounts it with fresh fields —
  // no effect copying props into state after the first paint.
  const [name, setName] = useState(media?.name || "");
  const [duration, setDuration] = useState<number>(media?.duration || 10);
  const [category, setCategory] = useState(media?.category || "Chung");
  const [targetAgeGroup, setTargetAgeGroup] = useState(media?.target_age_group || "all");
  const [targetGender, setTargetGender] = useState(media?.target_gender || "all");
  const [targetWeather, setTargetWeather] = useState(media?.target_weather || "all");
  const [targetPet, setTargetPet] = useState(media?.target_pet || "all");
  const [targetStyle, setTargetStyle] = useState(media?.target_style || "all");
  const [description, setDescription] = useState(media?.description || "");

  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isOpen || !media) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Vui lòng nhập tên media.");
      return;
    }
    if (duration <= 0) {
      setError("Thời lượng phát phải lớn hơn 0 giây.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateAd(media.id, {
        name: name.trim(),
        duration: Number(duration),
        category,
        target_age_group: targetAgeGroup,
        target_gender: targetGender,
        target_weather: targetWeather,
        target_pet: targetPet,
        target_style: targetStyle,
        description: description.trim(),
      });
      onSaveSuccess(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoSuggest = async () => {
    if (!name.trim()) return;
    try {
      setSuggesting(true);
      setError(null);
      const res = await api.suggestTarget(name.trim());
      // "all"/"Chung" is the matcher saying it found no keyword, not a
      // finding — it must not wipe a target the operator already chose.
      if (res.category && res.category !== "Chung") setCategory(res.category);
      if (res.target_age_group && res.target_age_group !== "all") setTargetAgeGroup(res.target_age_group);
      if (res.target_gender && res.target_gender !== "all") setTargetGender(res.target_gender);
      setInfo(`AI gợi ý: ${res.reason || "Đã áp dụng các thông số phù hợp"}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  };

  const handleAiAnalyze = async () => {
    try {
      setAnalyzing(true);
      setError(null);
      const res = await api.analyzeAd(media.id);
      if (res.category) setCategory(res.category);
      if (res.target_age_group) setTargetAgeGroup(res.target_age_group);
      if (res.target_gender) setTargetGender(res.target_gender);
      const noteMsg = res.notes && res.notes.length > 0 ? res.notes.join("; ") : "Đã cập nhật các thuộc tính tự động";
      setInfo(`AI phân tích video (${res.source}): ${noteMsg}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              Chỉnh Sửa Thuộc Tính Media
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cập nhật tên, thời lượng và thông số mục tiêu thông minh cho video.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Notifications */}
        {info && (
          <div className="mx-6 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 flex items-center justify-between shadow-2xs">
            <span>{info}</span>
            <button
              type="button"
              onClick={() => setInfo(null)}
              className="text-emerald-700 hover:text-emerald-950 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700 flex items-center justify-between shadow-2xs">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-700 hover:text-rose-950 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Media Preview Box */}
          <div className="flex items-center gap-4 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-slate-950 shadow-inner">
              {media.kind === "video" ? (
                <video
                  src={mediaUrl(media.url)}
                  muted
                  controls
                  className="h-full w-full object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl(media.url)}
                  alt={media.name}
                  className="h-full w-full object-contain"
                />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    media.kind === "video"
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {media.kind === "video" ? <IconVideo className="h-3 w-3" /> : <IconImage className="h-3 w-3" />}
                  <span>{media.kind === "video" ? "Video" : "Hình ảnh"}</span>
                </span>
                <span className="text-xs font-mono text-slate-500">ID: #{media.id}</span>
              </div>
              <p className="text-xs text-slate-600 font-medium truncate font-mono">
                {media.filename}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={suggesting}
                  onClick={handleAutoSuggest}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 transition shadow-2xs cursor-pointer"
                >
                  <IconSparkles className="h-3 w-3" />
                  <span>{suggesting ? "Đang gợi ý..." : "AI Gợi ý"}</span>
                </button>
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={handleAiAnalyze}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800 hover:bg-violet-100 transition shadow-2xs cursor-pointer"
                >
                  <IconSearch className="h-3 w-3" />
                  <span>{analyzing ? "Đang quét..." : "Quét nội dung AI"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Row 1: Name & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Tên hiển thị <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên video / quảng cáo..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-2xs"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Thời lượng (giây) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-2xs"
                required
              />
            </div>
          </div>

          {/* Row 2: Category & Target Age */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Thể loại / Ngành hàng
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-emerald-500 transition shadow-2xs cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Độ tuổi mục tiêu <span className="font-normal text-slate-400">(chọn được nhiều)</span>
              </label>
              <TargetMultiSelect value={targetAgeGroup} onChange={setTargetAgeGroup} options={AGE_OPTIONS} />
            </div>
          </div>

          {/* Row 3: Target Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Giới tính mục tiêu
              </label>
              <select
                value={targetGender}
                onChange={(e) => setTargetGender(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-emerald-500 transition shadow-2xs cursor-pointer"
              >
                {GENDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {/* Crowd size is no longer a tag: the scorer reads it, and the
                age/gender mix, off the camera. */}
            <p className="self-end rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] leading-snug text-slate-500">
              Quy mô người xem được tự tính từ camera: quảng cáo nhắm đúng nhóm đông nhất trước màn hình sẽ được ưu tiên.
            </p>
          </div>

          {/* Row 4: Target Weather & Target Pet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Bối cảnh thời tiết
              </label>
              <TargetMultiSelect value={targetWeather} onChange={setTargetWeather} options={WEATHER_OPTIONS} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Thú cưng đi kèm
              </label>
              <TargetMultiSelect value={targetPet} onChange={setTargetPet} options={PET_OPTIONS} exclusive={["none"]} />
            </div>
          </div>

          {/* Row 5: Target Style & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Phong cách trang phục
              </label>
              <TargetMultiSelect value={targetStyle} onChange={setTargetStyle} options={STYLE_OPTIONS} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Mô tả / Ghi chú
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ghi chú thêm về video..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-emerald-500 transition shadow-2xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
