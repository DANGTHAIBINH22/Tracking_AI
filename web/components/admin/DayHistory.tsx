"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock, Download, Eye, Film, RefreshCw, Users } from "lucide-react";
import { DayLog, DayPerson, api } from "@/lib/api";
import { ageGroupLabel, animalLabel, clothingColor, genderCode, genderLabel, styleLabel } from "@/lib/taxonomy";
import { AudienceBreakdown, HourlyChart } from "@/components/admin/DayCharts";
import { Table, sortRows, type SortState, type TableColumn } from "@/components/motion/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { cn } from "@/lib/utils";

/** YYYY-MM-DD in the viewer's own calendar (toISOString would use UTC). */
function localDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

/** Calendar days from `a` to `b`, inclusive. */
function spanDays(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1;
}

const clock = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const calendarDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

const PAGE_SIZES = [25, 50, 100] as const;

/** Page numbers to show around `current`, with null for a gap ("…"). */
function pageWindow(current: number, count: number): (number | null)[] {
  const keep = new Set([1, count, current - 1, current, current + 1].filter((n) => n >= 1 && n <= count));
  const sorted = [...keep].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? [null, n] : [n]));
}

const PRESETS = [
  { label: "Hôm nay", days: 1, back: 0 },
  { label: "Hôm qua", days: 1, back: 1 },
  { label: "7 ngày", days: 7, back: 0 },
  { label: "30 ngày", days: 30, back: 0 },
] as const;

function duration(sec: number) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const whole = Math.round(sec);
  return `${Math.floor(whole / 60)}p ${whole % 60}s`;
}

function Stat({ label, value, icon, hint }: { label: string; value: ReactNode; icon: ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5" title={hint}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-base font-bold leading-none text-slate-900 tabular">{value}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/** One device's tracking history for one day: every person seen, in order of
 *  arrival, across however many sessions capture was split into. */
export function DayHistory({ deviceId }: { deviceId: string | number }) {
  const [date, setDate] = useState(localDate);
  const [endDate, setEndDate] = useState(localDate);
  const span = spanDays(date, endDate);
  const multiDay = span > 1;
  const today = localDate();
  const [log, setLog] = useState<DayLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<"all" | "viewed">("all");
  const [sort, setSort] = useState<SortState | null>({ key: "seq", direction: "asc" });
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  // The page belongs to one view of the data: a new day range, tab, sort or
  // page size starts again at page 1 without an effect to reset it.
  const view = `${date}|${endDate}|${show}|${sort?.key}:${sort?.direction}|${pageSize}`;
  const [pager, setPager] = useState({ view, page: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLog(await api.getDayLog(deviceId, date, endDate));
    } catch (err) {
      setError((err as Error).message);
      setLog(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId, date, endDate]);

  /** Move the whole window by its own length, never past today. */
  const shift = (dir: -1 | 1) => {
    const to = shiftDate(endDate, dir * span);
    if (to > today) return;
    setDate(shiftDate(date, dir * span));
    setEndDate(to);
  };
  const applyPreset = (days: number, back: number) => {
    const to = shiftDate(today, -back);
    setEndDate(to);
    setDate(shiftDate(to, -(days - 1)));
  };

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const people = useMemo(() => log?.people ?? [], [log]);
  const rows = useMemo(() => (show === "viewed" ? people.filter((p) => p.viewed) : people), [people, show]);

  const summary = useMemo(() => {
    const viewed = people.filter((p) => p.viewed);
    const known = people.filter((p) => genderCode(p.gender));
    const female = known.filter((p) => genderCode(p.gender) === "F").length;
    const ages = new Map<string, number>();
    people.forEach((p) => p.age_group && ages.set(p.age_group, (ages.get(p.age_group) ?? 0) + 1));
    const topAge = [...ages.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      viewed: viewed.length,
      avgDwell: viewed.length ? viewed.reduce((s, p) => s + p.dwell_seconds, 0) / viewed.length : 0,
      femaleShare: known.length ? female / known.length : null,
      topAge,
    };
  }, [people]);

  const exportCsv = () => {
    const header = ["STT", "Ngày", "Bắt đầu", "Kết thúc", "Có mặt (s)", "Nhìn (s)", "Đã xem", "Giới tính", "Tuổi", "Nhóm tuổi", "Màu áo", "Phong cách", "Thú cưng", "Video đã xem (giây nhìn)", "Phiên", "Track"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((p) =>
      [
        p.seq, calendarDate(p.first_seen), clock(p.first_seen),
        // A stay past midnight ends on another day; say which.
        calendarDate(p.last_seen) === calendarDate(p.first_seen) ? clock(p.last_seen) : `${calendarDate(p.last_seen)} ${clock(p.last_seen)}`, p.presence_seconds, p.dwell_seconds, p.viewed ? "có" : "",
        genderLabel(p.gender) ?? "", p.age ?? "", p.age_group ?? "", clothingColor(p.clothing_color)?.vi ?? "",
        styleLabel(p.clothing_style) ?? "", p.has_pet ? p.pet_type ?? "có" : "", p.watched.map((w) => `${w.name} (${w.seconds}s)`).join("; "),
        p.session_code, p.track_id,
      ].map(esc).join(","),
    );
    const blob = new Blob(["﻿" + [header.map(esc).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lich-su-thiet-bi-${deviceId}-${date}${multiDay ? `_${endDate}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: TableColumn<DayPerson>[] = [
    { key: "seq", header: "#", width: "60px", sortable: true, cell: (p) => <span className="font-mono text-slate-400 tabular">{p.seq}</span> },
    {
      key: "date",
      header: "Ngày",
      width: "112px",
      sortable: true,
      sortValue: (p) => p.first_seen,
      cell: (p) => <span className="font-mono text-[11px] text-slate-700 tabular">{calendarDate(p.first_seen)}</span>,
    },
    {
      key: "first_seen",
      header: "Bắt đầu",
      width: "100px",
      sortable: true,
      cell: (p) => <span className="font-mono text-[11px] text-slate-700 tabular">{clock(p.first_seen)}</span>,
    },
    {
      key: "last_seen",
      header: "Kết thúc",
      width: "104px",
      sortable: true,
      cell: (p) => (
        <span
          className="font-mono text-[11px] text-slate-700 tabular"
          title={calendarDate(p.last_seen) !== calendarDate(p.first_seen) ? `Kết thúc ngày ${calendarDate(p.last_seen)}` : undefined}
        >
          {clock(p.last_seen)}
          {calendarDate(p.last_seen) !== calendarDate(p.first_seen) && <span className="text-amber-600"> +1</span>}
        </span>
      ),
    },
    {
      key: "presence_seconds",
      header: "Có mặt",
      width: "92px",
      align: "right",
      sortable: true,
      cell: (p) => <span className="font-mono tabular text-slate-700">{duration(p.presence_seconds)}</span>,
    },
    {
      key: "dwell_seconds",
      header: "Nhìn màn hình",
      width: "140px",
      sortable: true,
      cell: (p) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono tabular text-slate-800">{duration(p.dwell_seconds)}</span>
          {p.viewed ? (
            <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">đã xem</span>
          ) : (
            <span className="text-[10px] text-slate-400">{Math.round(p.attentive_share * 100)}%</span>
          )}
        </span>
      ),
    },
    {
      key: "gender",
      header: "Giới tính",
      width: "104px",
      sortable: true,
      cell: (p) => <span className="text-slate-700">{genderLabel(p.gender) ?? "—"}</span>,
    },
    {
      key: "age",
      header: "Tuổi",
      width: "112px",
      sortable: true,
      sortValue: (p) => p.age ?? -1,
      cell: (p) =>
        p.age != null ? (
          <span>
            <strong className="text-slate-900">~{p.age}</strong> <span className="text-[11px] text-slate-500">({p.age_group})</span>
          </span>
        ) : (
          <span className="text-slate-400">{ageGroupLabel(p.age_group) ?? "—"}</span>
        ),
    },
    {
      key: "clothing_color",
      header: "Trang phục",
      width: "164px",
      cell: (p) =>
        p.clothing_color ? (
          <span className="flex items-center gap-1.5 text-slate-700">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300"
              style={{ backgroundColor: clothingColor(p.clothing_color)?.swatch }}
            />
            <span className="truncate">
              {clothingColor(p.clothing_color)?.vi}
              {p.clothing_style && <span className="text-slate-400"> · {styleLabel(p.clothing_style)}</span>}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: "has_pet",
      header: "Thú cưng",
      width: "100px",
      cell: (p) =>
        p.has_pet ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            {animalLabel(p.pet_type)}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: "watched",
      header: "Video đã xem",
      sortable: true,
      sortValue: (p) => p.watched[0]?.seconds ?? -1,
      cell: (p) =>
        p.watched.length ? (
          <span
            className="flex min-w-0 items-center gap-1.5 text-slate-700"
            title={`Nhìn màn hình khi đang phát:\n${p.watched.map((w) => `${w.name}: ${duration(w.seconds)}`).join("\n")}`}
          >
            <Film className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{p.watched[0].name}</span>
            <span className="shrink-0 font-mono text-[10px] text-emerald-700 tabular">nhìn {duration(p.watched[0].seconds)}</span>
          </span>
        ) : p.ads.length ? (
          <span className="text-slate-400" title={`Đang phát: ${p.ads.map((a) => a.name).join(", ")}`}>
            Không nhìn
          </span>
        ) : (
          <span className="text-slate-400" title="Playlist không phát video nào lúc người này có mặt">
            Không phát
          </span>
        ),
    },
  ];

  const sortedRows = sortRows(rows, columns, sort, (p) => p);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const page = Math.min(pager.view === view ? pager.page : 1, pageCount);
  const pageRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const goTo = (n: number) => setPager({ view, page: Math.min(Math.max(1, n), pageCount) });

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      {/* Header + day picker */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Lịch sử theo ngày</h2>
          <p className="text-xs text-slate-500">
            Mọi người thiết bị ghi nhận {multiDay ? `trong ${span} ngày` : "trong ngày"}, theo thứ tự xuất hiện
            {log ? ` · gộp từ ${log.sessions} lần chạy tracking` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {PRESETS.map((p) => {
              const to = shiftDate(today, -p.back);
              const active = endDate === to && date === shiftDate(to, -(p.days - 1));
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.days, p.back)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                    active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Khoảng trước"
              className="rounded-l-xl px-2 py-2 text-slate-500 transition hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={date}
              max={endDate}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Từ ngày"
              className="border-l border-slate-200 bg-transparent px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none"
            />
            <span className="text-xs text-slate-400">→</span>
            <input
              type="date"
              value={endDate}
              min={date}
              max={today}
              onChange={(e) => e.target.value && setEndDate(e.target.value)}
              aria-label="Đến ngày"
              className="border-r border-slate-200 bg-transparent px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none"
            />
            <button
              type="button"
              onClick={() => shift(1)}
              disabled={endDate >= today}
              aria-label="Khoảng sau"
              className="rounded-r-xl px-2 py-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV ({rows.length})
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {/* Day summary */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Người đi qua" value={people.length} icon={<Users className="h-4 w-4" />} />
        <Stat
          label="Đã xem quảng cáo"
          value={`${summary.viewed}${people.length ? ` · ${Math.round((summary.viewed / people.length) * 100)}%` : ""}`}
          icon={<Eye className="h-4 w-4" />}
          hint="Nhìn màn hình đủ lâu để tính là một lượt xem"
        />
        <Stat label="Nhìn trung bình (người đã xem)" value={duration(summary.avgDwell)} icon={<Clock className="h-4 w-4" />} />
        <Stat
          label="Nữ / Nam"
          value={summary.femaleShare == null ? "—" : `${Math.round(summary.femaleShare * 100)}% / ${100 - Math.round(summary.femaleShare * 100)}%`}
          icon={<Users className="h-4 w-4" />}
        />
        <Stat
          label={summary.topAge ? `Nhóm tuổi đông nhất (${summary.topAge[1]} người)` : "Nhóm tuổi đông nhất"}
          value={summary.topAge?.[0] ?? "—"}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {people.length > 0 && (
        <div className="space-y-3">
          <HourlyChart people={people} days={span} />
          <AudienceBreakdown people={people} />
        </div>
      )}

      {/* The log */}
      <div className="flex items-center justify-between">
        <Tabs value={show} onValueChange={(v) => setShow(v as "all" | "viewed")} variant="segment">
          <TabsList className="border border-slate-200 bg-slate-100">
            <TabsTrigger value="all">
              <span className="text-xs">Tất cả ({people.length})</span>
            </TabsTrigger>
            <TabsTrigger value="viewed">
              <span className="text-xs">Đã xem ({summary.viewed})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!loading && !rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-500">
          Không có ai được ghi nhận {multiDay ? "từ" : "vào"} ngày {new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN")}
          {multiDay && ` đến ${new Date(`${endDate}T00:00:00`).toLocaleDateString("vi-VN")}`}.
        </div>
      ) : (
        <Table
          data={pageRows}
          columns={columns}
          getRowId={(p) => `${p.session_code}-${p.track_id}`}
          // Sorted here over every row, then paged; the table only shows the slice.
          sort={sort}
          onSortChange={setSort}
          rowHeight={36}
          loading={loading}
          // A page is short enough to show whole. Header row is one rowHeight too; +4 covers the border.
          height={40 + Math.max(pageRows.length, 3) * 36}
          className="rounded-xl border border-slate-200 text-xs"
          emptyState="Không có dữ liệu"
          // Floor for the Video column: below this the table scrolls instead of squeezing it.
          minColumnWidth={152}
        />
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="tabular">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} / {rows.length} người
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Số dòng mỗi trang"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / trang
                </option>
              ))}
            </select>
          </div>
          {pageCount > 1 && (
            <nav className="flex items-center gap-1" aria-label="Phân trang">
              <button
                type="button"
                onClick={() => goTo(page - 1)}
                disabled={page <= 1}
                aria-label="Trang trước"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {pageWindow(page, pageCount).map((n, i) =>
                n == null ? (
                  <span key={`gap-${i}`} className="px-1 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => goTo(n)}
                    aria-current={n === page ? "page" : undefined}
                    className={cn(
                      "min-w-7 rounded-lg px-2 py-1 font-medium tabular transition",
                      n === page ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {n}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => goTo(page + 1)}
                disabled={page >= pageCount}
                aria-label="Trang sau"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
