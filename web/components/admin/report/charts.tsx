"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, CHART_TOOLTIP } from "@/lib/taxonomy";
import { useIsClient } from "@/lib/useBrowserState";
import { Empty, fmtInt, fmtPct } from "./shared";

/**
 * The audience stages, one colour each on every chart (detected ⊃ faced the
 * screen ⊃ watched ⊃ engaged). Gray is the recessive context the others are
 * measured against; green is always "watched", its darker step "engaged".
 * Violet, not a lighter green: no green step fits between the gray and the
 * primary and still clears the CVD / normal-vision floors (validated with the
 * dataviz palette checker: violet↔green ΔE 31, green↔dark green ΔE 15.6).
 */
export const STAGE = {
  context: CHART.context,
  glance: "#4a3aa7",
  primary: CHART.primary,
  engaged: "#0b7a52",
} as const;

function bucketLabel(t: number, bucketSeconds: number) {
  const d = new Date(t * 1000);
  return bucketSeconds < 86400
    ? `${d.getHours()}h`
    : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Skeleton({ h = "h-64" }: { h?: string }) {
  return <div className={`${h} w-full animate-pulse rounded-xl bg-slate-50`} />;
}

const legendText = (val: unknown) => <span className="text-xs font-medium text-slate-600">{String(val)}</span>;

/**
 * Reach split into "watched" and "only walked past", stacked, so the bar's
 * full height is reach and its green part is impressions — the two numbers
 * stay separate, and the eye reads the share without a second axis.
 */
export function ReachTrendChart({
  series,
  bucketSeconds,
}: {
  series: { t: number; reach: number; impressions: number }[];
  bucketSeconds: number;
}) {
  const mounted = useIsClient();
  if (!mounted) return <Skeleton />;
  if (!series.some((s) => s.reach)) return <Empty className="h-64">Chưa có ai đi qua màn hình trong khoảng này.</Empty>;
  const data = series.map((s) => ({
    label: bucketLabel(s.t, bucketSeconds),
    impressions: s.impressions,
    passed: Math.max(0, s.reach - s.impressions),
    reach: s.reach,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" axisLine={{ stroke: "#e2e8f0" }} tickLine={false} tick={{ fontSize: 10, fill: CHART.axis }} minTickGap={8} />
          <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} />
          <Tooltip
            {...CHART_TOOLTIP}
            labelFormatter={(label, items) => {
              const p = items?.[0]?.payload as (typeof data)[number] | undefined;
              return p ? `${label} · tiếp cận ${fmtInt(p.reach)} · chú ý ${fmtPct(p.reach ? p.impressions / p.reach : null)}` : String(label);
            }}
            formatter={(v: unknown, name: unknown) => [`${fmtInt(Number(v) || 0)} người`, String(name)]}
          />
          <Legend itemSorter={null} verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 6 }} formatter={legendText} />
          <Bar dataKey="impressions" name="Xem thực (impression)" stackId="a" fill={STAGE.primary} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="passed" name="Chỉ đi qua" stackId="a" fill={STAGE.context} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The camera's three nested counts per bucket, side by side. */
export function DetectionTrendChart({
  series,
  bucketSeconds,
}: {
  series: { t: number; detected: number; attentive: number; viewed: number }[];
  bucketSeconds: number;
}) {
  const mounted = useIsClient();
  if (!mounted) return <Skeleton />;
  if (!series.some((s) => s.detected)) return <Empty className="h-64">Camera chưa phát hiện ai trong khoảng này.</Empty>;
  const data = series.map((s) => ({ ...s, label: bucketLabel(s.t, bucketSeconds) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="20%" barGap={2}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="label" axisLine={{ stroke: "#e2e8f0" }} tickLine={false} tick={{ fontSize: 10, fill: CHART.axis }} minTickGap={8} />
          <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} />
          <Tooltip {...CHART_TOOLTIP} formatter={(v: unknown, name: unknown) => [`${fmtInt(Number(v) || 0)} người`, String(name)]} />
          <Legend itemSorter={null} verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 6 }} formatter={legendText} />
          <Bar dataKey="detected" name="Phát hiện" fill={STAGE.context} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="attentive" name="Hướng về màn hình" fill={STAGE.glance} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="viewed" name="Xem thực" fill={STAGE.primary} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Top items by impressions, horizontal so long media names stay readable. */
export function RankingChart({
  rows,
  limit = 8,
}: {
  rows: { name: string; reach: number; impressions: number }[];
  limit?: number;
}) {
  const mounted = useIsClient();
  // 22 characters fit the 160px label column at 11px.
  const data = [...rows]
    .sort((a, b) => b.impressions - a.impressions || b.reach - a.reach)
    .slice(0, limit)
    .map((r) => ({
      name: r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name,
      full: r.name,
      impressions: r.impressions,
      passed: Math.max(0, r.reach - r.impressions),
      reach: r.reach,
    }));
  const height = Math.max(160, data.length * 38 + 48);
  if (!mounted) return <Skeleton h="h-60" />;
  if (!data.some((d) => d.reach)) return <Empty>Chưa có lượt tiếp cận nào để xếp hạng.</Empty>;
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} />
          <YAxis type="category" dataKey="name" width={160} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#334155" }} />
          <Tooltip
            {...CHART_TOOLTIP}
            labelFormatter={(_, items) => {
              const p = items?.[0]?.payload as (typeof data)[number] | undefined;
              return p ? `${p.full} · chú ý ${fmtPct(p.reach ? p.impressions / p.reach : null)}` : "";
            }}
            formatter={(v: unknown, name: unknown) => [`${fmtInt(Number(v) || 0)} người`, String(name)]}
          />
          <Legend itemSorter={null} verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 4 }} formatter={legendText} />
          <Bar dataKey="impressions" name="Xem thực" stackId="a" fill={STAGE.primary} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="passed" name="Chỉ đi qua" stackId="a" fill={STAGE.context} stroke="#fff" strokeWidth={1} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
