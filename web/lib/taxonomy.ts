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

/** Matches AGE_GROUPS in server/audience.py, in the same order. */
export const AGE_OPTIONS: Option[] = [
  { value: ANY, label: "Tất cả độ tuổi" },
  { value: "<18", label: "<18 tuổi (Thiếu nhi / Học sinh)" },
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

/** Matches CROWDS in server/creative_profiler.py. */
export const CROWD_OPTIONS: Option[] = [
  { value: ANY, label: "Mọi quy mô" },
  { value: "single", label: "1 người (Cá nhân)" },
  { value: "group", label: "2 - 4 người (Nhóm)" },
  { value: "crowd", label: "Từ 5 người (Đám đông)" },
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

/** Human label for a stored value; falls back to the raw value so an
 *  unrecognised one is visible rather than blank. */
export function labelFor(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
