"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowDownRight, ArrowUpRight, Clock, Eye, Film, Image as ImageIcon, RefreshCw, Users } from "lucide-react";
import { api, type Overview, type OverviewTotals } from "@/lib/api";
import { AgeDistributionBarChart, GenderDonutChart } from "@/components/AnalyticsCharts";
import { CHART, CHART_TOOLTIP } from "@/lib/taxonomy";
import { useIsClient } from "@/lib/useBrowserState";
import { cn } from "@/lib/utils";

const PERIODS = [
  { days: 1, label: "Hôm nay", prev: "hôm qua" },
  { days: 7, label: "7 ngày", prev: "7 ngày trước đó" },
  { days: 30, label: "30 ngày", prev: "30 ngày trước đó" },
] as const;

const AXIS_TICK = { fontSize: 11, fill: CHART.axis };

function hours(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} phút`;
  const h = sec / 3600;
  return `${h < 10 ? h.toFixed(1) : Math.round(h)} giờ`;
}

function duration(sec: number) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const whole = Math.round(sec);
  const m = Math.floor(whole / 60);
  return m < 60 ? `${m}p ${whole % 60}s` : `${Math.floor(m / 60)}g ${m % 60}p`;
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

/** "+12%" against the previous period, or "mới" when there was nothing to compare with. */
function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (!before && !now) return <span className="text-[11px] text-slate-400">—</span>;
  if (!before) return <span className="text-[11px] font-medium text-emerald-700">mới so với {label}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", up ? "text-emerald-700" : "text-rose-600")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}%<span className="font-normal text-slate-400">&nbsp;so với {label}</span>
    </span>
  );
}

function Kpi({ icon, label, value, sub, delta }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; delta?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200">{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-bold leading-none text-slate-900 tabular">{value}</p>
      <div className="min-h-4 space-y-0.5">
        {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
        {delta}
      </div>
    </div>
  );
}

function Card({ title, note, children, className, action }: { title: string; note?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** People per day (per hour today), split into who looked at the screen and who only passed. */
function ActivityChart({ data, hourly }: { data: Overview["series"]; hourly: boolean }) {
  const mounted = useIsClient();
  const rows = data.map((s) => {
    const d = new Date(s.t * 1000);
    return {
      key: hourly ? `${d.getHours()}h` : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
      full: hourly
        ? `${d.getHours()}h – ${d.getHours() + 1}h`
        : d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }),
      viewed: s.viewed,
      passed: Math.max(0, s.people - s.viewed),
      sessions: s.sessions,
      impressions: s.impressions,
    };
  });
  if (!rows.some((r) => r.viewed || r.passed)) {
    return <div className="flex h-64 items-center justify-center text-xs text-slate-400">Chưa có lượt tracking nào trong khoảng này</div>;
  }
  return (
    <div className="h-64">
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap={rows.length > 20 ? "12%" : "24%"}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="key"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              interval={rows.length > 14 ? Math.ceil(rows.length / 10) - 1 : 0}
            />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip
              {...CHART_TOOLTIP}
              labelFormatter={(_, p) => {
                const r = p?.[0]?.payload as (typeof rows)[number] | undefined;
                return r ? `${r.full} · ${r.sessions} phiên tracking` : "";
              }}
              formatter={(v, name) => [`${fmt(Number(v))} người`, name]}
              itemSorter={(item) => (item.dataKey === "viewed" ? 0 : 1)}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "#475569", paddingTop: 6 }}
              // Legend text takes the series colour by default; the grey series would vanish.
              formatter={(value) => <span className="text-slate-600">{value}</span>}
              itemSorter={(item) => (item.dataKey === "viewed" ? 0 : 1)}
            />
            <Bar dataKey="viewed" name="Nhìn màn hình" stackId="p" fill={CHART.primary} stroke="#ffffff" strokeWidth={1} />
            <Bar dataKey="passed" name="Chỉ đi qua" stackId="p" fill={CHART.context} stroke="#ffffff" strokeWidth={1} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Videos ranked by people who actually watched, with reach for context. */
function TopVideos({ videos }: { videos: Overview["top_videos"] }) {
  const [all, setAll] = useState(false);
  const shown = all ? videos : videos.slice(0, 6);
  const max = Math.max(1, ...videos.map((v) => v.reach));
  if (!videos.length) {
    return <div className="flex h-56 items-center justify-center text-xs text-slate-400">Chưa có video nào phát trong khoảng này</div>;
  }
  return (
    <div className="space-y-1">
      <ol className="space-y-2.5">
        {shown.map((v, i) => (
          <li key={v.creative_id} className="space-y-1" title={`${v.name}\n${v.airings} lượt chiếu · ${duration(v.seconds_on_screen)} trên màn hình`}>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular",
                  i === 0 ? "bg-emerald-600 text-white" : i < 3 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
                )}
              >
                {i + 1}
              </span>
              {v.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <Film className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{v.name}</span>
              <span className="shrink-0 font-semibold text-slate-900 tabular">{fmt(v.impressions)}</span>
              <span className="w-10 shrink-0 text-right text-[11px] text-slate-500 tabular">{Math.round(v.attention_rate * 100)}%</span>
            </div>
            {/* Reach as the track, impressions as the fill: how many of those who passed looked. */}
            <div className="ml-7 h-1.5 rounded-full bg-slate-100">
              <div className="relative h-full rounded-full" style={{ width: `${(v.reach / max) * 100}%`, backgroundColor: CHART.context }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${v.reach ? (v.impressions / v.reach) * 100 : 0}%`, minWidth: v.impressions ? 4 : 0, backgroundColor: CHART.primary }}
                />
              </div>
            </div>
            <p className="ml-7 text-[11px] text-slate-400 tabular">
              {fmt(v.reach)} lượt đi qua · {v.airings} lượt chiếu · nhìn tổng {duration(v.attention_seconds)}
            </p>
          </li>
        ))}
      </ol>
      {videos.length > 6 && (
        <button type="button" onClick={() => setAll(!all)} className="w-full pt-1 text-center text-xs font-medium text-emerald-700 hover:underline">
          {all ? "Thu gọn" : `Xem tất cả ${videos.length} video`}
        </button>
      )}
    </div>
  );
}

/** One device's report for today / this week / this month: tracking runs,
 *  audience and the videos people watched — the device page's "Báo cáo" tab. */
export function DeviceReport({ deviceId }: { deviceId: string | number }) {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.overview(days, deviceId));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, deviceId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const every = setInterval(load, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [load]);

  const period = PERIODS.find((p) => p.days === days) ?? PERIODS[1];
  const cur = data?.current;
  const prev = data?.previous;
  const stale = data && data.days !== days;
  const c = (k: keyof OverviewTotals) => Number(cur?.[k] ?? 0);
  const p = (k: keyof OverviewTotals) => Number(prev?.[k] ?? 0);
  const since = data ? new Date(data.start * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

  return (
    <div className={cn("space-y-4 transition-opacity", (stale || (loading && !data)) && "opacity-60")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Báo cáo thiết bị</h2>
          <p className="text-xs text-slate-500">
            {data ? (days === 1 ? `Hôm nay, ${since}` : `Từ ${since} đến nay`) : "Đang tải…"} · so sánh với {period.prev}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
            {PERIODS.map((pp) => (
              <button
                key={pp.days}
                type="button"
                onClick={() => setDays(pp.days)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  days === pp.days ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {pp.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Làm mới thống kê"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">Không tải được thống kê: {error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={<Film className="h-3.5 w-3.5" />}
          label="Lượt chiếu"
          value={fmt(c("airings"))}
          sub="quảng cáo phát trong lúc tracking"
        />
        <Kpi
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Lượt tracking"
          value={fmt(c("sessions"))}
          sub="số phiên chạy camera"
          delta={<Delta now={c("sessions")} before={p("sessions")} label={period.prev} />}
        />
        <Kpi
          icon={<Users className="h-3.5 w-3.5" />}
          label="Người đi qua"
          value={fmt(c("people"))}
          sub="khuôn mặt được theo dõi"
          delta={<Delta now={c("people")} before={p("people")} label={period.prev} />}
        />
        <Kpi
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Nhìn màn hình"
          value={fmt(c("viewed"))}
          sub={c("people") ? `${Math.round((c("viewed") / c("people")) * 100)}% người đi qua` : "người đã nhìn"}
          delta={<Delta now={c("viewed")} before={p("viewed")} label={period.prev} />}
        />
        <Kpi
          icon={<Film className="h-3.5 w-3.5" />}
          label="Lượt xem quảng cáo"
          value={fmt(c("impressions"))}
          sub={`trên ${fmt(c("reach"))} lượt đi qua khi đang chiếu`}
          delta={<Delta now={c("impressions")} before={p("impressions")} label={period.prev} />}
        />
        <Kpi
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Thời gian tracking"
          value={hours(c("tracked_seconds"))}
          sub={`khán giả nhìn tổng ${duration(c("attention_seconds"))}`}
          delta={<Delta now={c("tracked_seconds")} before={p("tracked_seconds")} label={period.prev} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title={days === 1 ? "Khán giả theo giờ" : "Khán giả theo ngày"}
          note="Mỗi cột là số người được tracking; phần xanh là người đã nhìn màn hình"
        >
          {data && <ActivityChart data={data.series} hourly={data.bucket_seconds === 3600} />}
        </Card>
        <Card
          className="xl:col-span-2"
          title="Video được xem nhiều nhất"
          note="Xếp theo lượt xem (nhìn ≥ ngưỡng chú ý) · % = tỉ lệ người đi qua có nhìn"
        >
          {data && <TopVideos videos={data.top_videos} />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cơ cấu giới tính" note="người đã xem quảng cáo">
          <GenderDonutChart male={data?.by_gender.M ?? 0} female={data?.by_gender.F ?? 0} />
        </Card>
        <Card title="Phân bố độ tuổi" note="người đã xem quảng cáo">
          <AgeDistributionBarChart data={data?.by_age_group ?? {}} />
        </Card>
      </div>
    </div>
  );
}
