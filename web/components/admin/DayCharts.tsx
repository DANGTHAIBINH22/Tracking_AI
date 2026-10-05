"use client";

import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayPerson } from "@/lib/api";
import {
  AGE_GROUPS,
  CHART,
  CHART_TOOLTIP,
  STYLE_OPTIONS,
  ageGroupLabel,
  clothingColor,
  genderCode,
  styleLabel,
} from "@/lib/taxonomy";
import { useIsClient } from "@/lib/useBrowserState";

const AXIS_TICK = { fontSize: 11, fill: CHART.axis };

function Panel({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200/80 bg-white p-3.5 ${className ?? ""}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-slate-800">{title}</p>
        {note && <p className="truncate text-[11px] text-slate-400">{note}</p>}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full min-h-24 items-center justify-center text-[11px] text-slate-400">{children}</div>
);

/** People per hour of day, split into those who watched and those who only passed. */
export function HourlyChart({ people, days }: { people: DayPerson[]; days: number }) {
  const mounted = useIsClient();
  const data = useMemo(() => {
    const rows = Array.from({ length: 24 }, (_, h) => ({ hour: h, viewed: 0, passed: 0 }));
    for (const p of people) {
      const r = rows[new Date(p.first_seen * 1000).getHours()];
      if (p.viewed) r.viewed++;
      else r.passed++;
    }
    return rows;
  }, [people]);
  const peak = data.reduce((best, r) => (r.viewed + r.passed > best.viewed + best.passed ? r : best), data[0]);
  const peakTotal = peak.viewed + peak.passed;

  return (
    <Panel
      title={`Khán giả theo giờ${days > 1 ? ` · cộng dồn ${days} ngày` : ""}`}
      note={peakTotal ? `Đông nhất ${peak.hour}h–${peak.hour + 1}h · ${peakTotal} người` : undefined}
    >
      <div className="h-44">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis
                dataKey="hour"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                interval={2}
                tickFormatter={(h: number) => `${h}h`}
              />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip
                {...CHART_TOOLTIP}
                labelFormatter={(h) => `${h}h – ${Number(h) + 1}h`}
                formatter={(v, name) => [`${v} người`, name]}
                itemSorter={(item) => (item.dataKey === "viewed" ? 0 : 1)}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: "#475569", paddingTop: 4 }}
                // Legend text takes the series colour by default; the grey series would vanish.
                formatter={(value) => <span className="text-slate-600">{value}</span>}
                itemSorter={(item) => (item.dataKey === "viewed" ? 0 : 1)}
              />
              {/* Watched sits on the baseline so its height reads directly; the rest stacks on top. */}
              <Bar dataKey="viewed" name="Đã xem quảng cáo" stackId="p" fill={CHART.primary} stroke="#ffffff" strokeWidth={1} />
              <Bar
                dataKey="passed"
                name="Chỉ đi qua"
                stackId="p"
                fill={CHART.context}
                stroke="#ffffff"
                strokeWidth={1}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}

/** One horizontal bar split by share, labelled in place. */
function GenderSplit({ people }: { people: DayPerson[] }) {
  const male = people.filter((p) => genderCode(p.gender) === "M").length;
  const female = people.filter((p) => genderCode(p.gender) === "F").length;
  const unknown = people.length - male - female;
  const known = male + female;
  if (!known) return <Empty>Chưa đọc được giới tính</Empty>;
  const parts = [
    { label: "Nữ", n: female, color: CHART.female },
    { label: "Nam", n: male, color: CHART.male },
  ];
  return (
    <div className="space-y-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((s) => (
          <div
            key={s.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.n / known) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.n} người`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {parts.map((s) => (
          <div key={s.label} className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </p>
            <p className="mt-0.5 text-base font-bold text-slate-900 tabular">
              {Math.round((s.n / known) * 100)}%<span className="ml-1 text-[11px] font-normal text-slate-400">{s.n} người</span>
            </p>
          </div>
        ))}
      </div>
      {unknown > 0 && <p className="text-[11px] text-slate-400">{unknown} người chưa đọc được giới tính (không tính vào tỉ lệ)</p>}
    </div>
  );
}

function AgeBars({ people }: { people: DayPerson[] }) {
  const mounted = useIsClient();
  const data = AGE_GROUPS.map((g) => ({
    group: g,
    label: ageGroupLabel(g) ?? g,
    n: people.filter((p) => p.age_group === g).length,
  }));
  if (!data.some((d) => d.n)) return <Empty>Chưa ước lượng được độ tuổi</Empty>;
  return (
    <div className="h-36">
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
            <XAxis dataKey="group" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval={0} />
            <YAxis hide allowDecimals={false} />
            <Tooltip {...CHART_TOOLTIP} labelFormatter={(_, p) => p?.[0]?.payload?.label ?? ""} formatter={(v) => [`${v} người`, "Số người"]} />
            <Bar dataKey="n" name="Số người" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={36}
              // Labels only draw once the grow animation ends; live data restarts it every tick.
              isAnimationActive={false}
            >
              <LabelList dataKey="n" position="top" style={{ fontSize: 10, fill: "#334155" }} formatter={(v) => (Number(v) ? v : "")} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Style shares as labelled bars, then the most common colours as swatches. */
function Clothing({ people }: { people: DayPerson[] }) {
  const styles = STYLE_OPTIONS.filter((o) => o.value !== "all").map((o) => ({
    label: styleLabel(o.value) ?? o.value,
    n: people.filter((p) => p.clothing_style === o.value).length,
  }));
  const tally = new Map<string, { vi: string; swatch: string; n: number }>();
  for (const p of people) {
    const c = clothingColor(p.clothing_color);
    if (!c) continue;
    const cur = tally.get(c.vi) ?? { ...c, n: 0 };
    cur.n++;
    tally.set(c.vi, cur);
  }
  const colors = [...tally.values()].sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...styles.map((s) => s.n));
  if (!colors.length) return <Empty>Chưa nhận diện được trang phục</Empty>;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {styles.map((s) => (
          <div key={s.label} className="grid grid-cols-[72px_1fr_32px] items-center gap-2 text-[11px]" title={`${s.label}: ${s.n} người`}>
            <span className="text-slate-600">{s.label}</span>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${(s.n / max) * 100}%`, backgroundColor: CHART.primary }} />
            </div>
            <span className="text-right font-semibold text-slate-700 tabular">{s.n}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {colors.slice(0, 8).map((c) => (
          <span
            key={c.vi}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
          >
            <span className="h-2.5 w-2.5 rounded-full border border-slate-300" style={{ backgroundColor: c.swatch }} />
            {c.vi}
            <span className="font-semibold text-slate-800 tabular">{c.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Who the device saw: gender, age and clothing, side by side. */
export function AudienceBreakdown({ people }: { people: DayPerson[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel title="Giới tính">
        <GenderSplit people={people} />
      </Panel>
      <Panel title="Độ tuổi" note="số người theo nhóm">
        <AgeBars people={people} />
      </Panel>
      <Panel title="Trang phục" note="phong cách · màu áo">
        <Clothing people={people} />
      </Panel>
    </div>
  );
}
