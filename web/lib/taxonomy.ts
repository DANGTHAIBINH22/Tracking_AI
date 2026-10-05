/**
 * The targeting vocabulary, mirrored from `server/audience.py` and
 * `server/creative_profiler.py`.
 *
 * These lists were duplicated verbatim in the ads page and the upload modal.
 * That is how the age brackets drifted out of step with the backend in the
 * first place: there was no single place to change, so one copy moved and the
 * other did not. Both screens now import from here.
 *
 * The `value` of every option is what gets stored in the database and compared
 * against a measured viewer. Change one of those and you must change
 * `server/audience.py` with it — the label is free to say anything.
 */

export type Option = { value: string; label: string };

/** Every dropdown offers "no preference" first; it is never a real bracket. */
export const ANY = "all";

/** Matches AGE_GROUPS in server/audience.py, in the same order.
 *
 *  `<18` is deliberately absent: it was split into the three brackets below.
 *  Adverts saved before the split keep it, and `target_covers` in
 *  server/audience.py still matches them against all three, but the form no
 *  longer offers it — picking it would mean declining to say which child. */
export const AGE_OPTIONS: Option[] = [
  { value: ANY, label: "Tất cả độ tuổi" },
  { value: "<6", label: "<6 tuổi (Mầm non)" },
  { value: "6-13", label: "6-13 tuổi (Thiếu nhi)" },
  { value: "13-18", label: "13-18 tuổi (Thiếu niên / Học sinh)" },
  { value: "18-35", label: "18-35 tuổi (Thanh niên / GenZ)" },
  { value: "35-55", label: "35-55 tuổi (Trung niên / Gia đình)" },
  { value: ">55", label: ">55 tuổi (Cao tuổi / Dưỡng sinh)" },
];

/** Matches GENDERS in server/creative_profiler.py and the model's own labels. */
export const GENDER_OPTIONS: Option[] = [
  { value: ANY, label: "Tất cả giới tính" },
  { value: "M", label: "Nam" },
  { value: "F", label: "Nữ" },
];

/** Read from the async VLM branch; "all" when that branch is off. */
export const WEATHER_OPTIONS: Option[] = [
  { value: ANY, label: "Mọi thời tiết" },
  { value: "sunny", label: "Trời nắng" },
  { value: "cloudy", label: "Trời nhiều mây" },
  { value: "rainy", label: "Trời mưa" },
];

/** Matches CATEGORIES in server/creative_profiler.py. */
export const CATEGORY_OPTIONS: string[] = [
  "Chung",
  "Thời trang & Làm đẹp",
  "Thời trang Nam",
  "Thanh niên & Xu hướng",
  "Công nghệ & Gaming",
  "Thực phẩm & Đồ uống",
  "Gia đình & Đồ gia dụng",
  "Sức khỏe & Dưỡng sinh",
  "Đồ chơi & Trẻ em",
];

/** The animals the pipeline detects (pet_tracker.ANIMALS): API value -> icon + name. */
export const ANIMALS: Record<string, { icon: string; vi: string }> = {
  bird: { icon: "🐦", vi: "Chim" },
  cat: { icon: "🐈", vi: "Mèo" },
  dog: { icon: "🐕", vi: "Chó" },
  horse: { icon: "🐎", vi: "Ngựa" },
  sheep: { icon: "🐑", vi: "Cừu" },
  cow: { icon: "🐄", vi: "Bò" },
  elephant: { icon: "🐘", vi: "Voi" },
  bear: { icon: "🐻", vi: "Gấu" },
  zebra: { icon: "🦓", vi: "Ngựa vằn" },
  giraffe: { icon: "🦒", vi: "Hươu cao cổ" },
};

/** "🐕 Chó" for a known type, "🐾 Thú cưng" otherwise. */
export function animalLabel(type?: string | null): string {
  const a = type ? ANIMALS[type.toLowerCase()] : undefined;
  return a ? `${a.icon} ${a.vi}` : "🐾 Thú cưng";
}

/** Matches PET targeting in server/engine.py: "yes" is any animal, a type
 *  name is that animal only. Only the ones a shop audience plausibly brings
 *  are offered; the large animals still count under "yes". */
export const PET_OPTIONS: Option[] = [
  { value: ANY, label: "Mọi trường hợp" },
  { value: "yes", label: "Có động vật / thú cưng đi cùng" },
  { value: "dog", label: "Dắt theo Chó" },
  { value: "cat", label: "Dắt theo Mèo" },
  { value: "bird", label: "Mang theo Chim" },
  { value: "none", label: "Không có thú cưng" },
];

/** Matches STYLE targeting in server/engine.py. */
export const STYLE_OPTIONS: Option[] = [
  { value: ANY, label: "Mọi phong cách" },
  { value: "Formal", label: "Công sở / Lịch sự (Formal)" },
  { value: "Sport", label: "Thể thao / Năng động (Sport)" },
  { value: "Casual", label: "Thường ngày (Casual)" },
];

/** Human label for a stored value; falls back to the raw value so an
 *  unrecognised one is visible rather than blank. */
export function labelFor(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** A stored target as a list. Targets may hold several values, comma separated
 *  ("13-18,18-35"), mirrored by server/audience.parse_tags. "all" or nothing
 *  is the empty list: no preference. */
export function parseTags(value?: string | null): string[] {
  const tags = String(value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.includes(ANY) ? [] : tags;
}

/** The list back to what the database stores; empty means "all". Kept in the
 *  option order so the same choice is always spelt the same way. */
export function joinTags(tags: string[], options: Option[]): string {
  if (!tags.length) return ANY;
  const order = options.map((o) => o.value);
  return [...new Set(tags)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(",");
}

/** "18-35 · 35-55" for chips and summaries, with each label's parenthetical
 *  dropped; the option's "all" label when nothing is chosen. */
export function tagsLabel(options: Option[], value?: string | null): string {
  const tags = parseTags(value);
  if (!tags.length) return labelFor(options, ANY);
  return tags.map((t) => labelFor(options, t).replace(/\s*\(.*\)$/, "")).join(" · ");
}

// -------------------------------------------------------------------------
// Measured attributes: what the pipeline writes per person, as displayed.
// Every screen that shows a person reads its labels from here, so "Black ·
// Formal" on one page cannot be "Đen · Công sở" on the next.
// -------------------------------------------------------------------------

/** Colours clothing_tracker.py names (plus a few it may grow into), keyed
 *  lowercase. `swatch` is the dot drawn beside the name. */
export const CLOTHING_COLORS: Record<string, { vi: string; swatch: string }> = {
  black: { vi: "Đen", swatch: "#1e293b" },
  white: { vi: "Trắng", swatch: "#ffffff" },
  grey: { vi: "Xám", swatch: "#94a3b8" },
  gray: { vi: "Xám", swatch: "#94a3b8" },
  red: { vi: "Đỏ", swatch: "#ef4444" },
  orange: { vi: "Cam", swatch: "#f97316" },
  yellow: { vi: "Vàng", swatch: "#eab308" },
  green: { vi: "Xanh lá", swatch: "#22c55e" },
  blue: { vi: "Xanh dương", swatch: "#3b82f6" },
  navy: { vi: "Xanh navy", swatch: "#1e3a8a" },
  purple: { vi: "Tím", swatch: "#a855f7" },
  pink: { vi: "Hồng", swatch: "#ec4899" },
  brown: { vi: "Nâu", swatch: "#78350f" },
};

/** Vietnamese name + swatch for a measured colour; the raw value when unknown. */
export function clothingColor(value?: string | null): { vi: string; swatch: string } | null {
  if (!value) return null;
  return CLOTHING_COLORS[value.toLowerCase()] ?? { vi: value, swatch: "#94a3b8" };
}

/** Short style name, from the same STYLE_OPTIONS the targeting form uses. */
export function styleLabel(value?: string | null): string | null {
  if (!value) return null;
  return labelFor(STYLE_OPTIONS, value).replace(/\s*\(.*\)$/, "").split(" / ")[0];
}

/** The pipeline and the API spell gender several ways; display one. */
export function genderCode(value?: string | null): "M" | "F" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (["m", "nam", "male"].includes(v)) return "M";
  if (["f", "nữ", "nu", "female"].includes(v)) return "F";
  return null;
}

export function genderLabel(value?: string | null): string | null {
  const code = genderCode(value);
  return code ? labelFor(GENDER_OPTIONS, code) : null;
}

/** Age brackets in display order, without the "all" entry. */
export const AGE_GROUPS: string[] = AGE_OPTIONS.filter((o) => o.value !== ANY).map((o) => o.value);

/** "18-35 tuổi" — the bracket without its marketing parenthetical. */
export function ageGroupLabel(value?: string | null): string | null {
  if (!value) return null;
  return labelFor(AGE_OPTIONS, value).replace(/\s*\(.*\)$/, "");
}

// -------------------------------------------------------------------------
// Chart colours. One entity keeps one colour on every chart; validated with
// the dataviz palette checker (CVD ΔE ≥ 9 between all three). The aqua sits
// under 3:1 on white, so every mark using it also carries a visible value.
// -------------------------------------------------------------------------
export const CHART = {
  male: "#2a78d6",
  female: "#eb6834",
  /** Single-series magnitude (people, impressions) and "watched". */
  primary: "#1baf7a",
  /** Context the primary is measured against (reach, footfall). */
  context: "#cbd5e1",
  unknown: "#e2e8f0",
  grid: "#f1f5f9",
  axis: "#64748b",
} as const;

/** Same card for every recharts tooltip. */
export const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 12,
    boxShadow: "0 8px 24px -8px rgb(15 23 42 / 0.18)",
    padding: "8px 10px",
  },
  labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: "#334155", padding: 0 },
  cursor: { fill: "#f1f5f9" },
} as const;
