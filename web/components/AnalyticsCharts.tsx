"use client";

import React from "react";
import { useIsClient } from "@/lib/useBrowserState";
import { CHART, CHART_TOOLTIP } from "@/lib/taxonomy";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Recharts measures the DOM, so charts render on the client only.
const useMounted = useIsClient;

// -------------------------------------------------------------
// 1. GENDER DONUT CHART
// -------------------------------------------------------------
export function GenderDonutChart({
  male,
  female,
  other = 0,
}: {
  male: number;
  female: number;
  other?: number;
}) {
  const mounted = useMounted();
  const total = male + female + other;
  const data = [
    { name: "Nam", value: male, color: CHART.male },
    { name: "Nữ", value: female, color: CHART.female },
    ...(other > 0 ? [{ name: "Chưa rõ", value: other, color: CHART.unknown }] : []),
  ];

  if (!mounted) {
    return <div className="h-56 w-full animate-pulse bg-slate-50/50 rounded-xl" />;
  }

  if (!total) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-400">
        Chưa có dữ liệu giới tính
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            {...CHART_TOOLTIP}
            formatter={(val: unknown) => {
              const n = Number(val) || 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              return [`${n.toLocaleString()} lượt (${pct}%)`, ""];
            }}
          />
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={2}
            cornerRadius={4}
            stroke="#ffffff"
            strokeWidth={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            formatter={(value) => {
              const item = data.find((d) => d.name === value);
              const pct = item && total ? Math.round((item.value / total) * 100) : 0;
              return (
                <span className="text-xs font-medium text-slate-700">
                  {value}: <strong className="text-slate-900">{pct}%</strong>
                </span>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// -------------------------------------------------------------
// 2. AGE GROUP BAR CHART
// -------------------------------------------------------------
export function AgeDistributionBarChart({
  data,
}: {
  data: Record<string, number>;
}) {
  const mounted = useMounted();
  // The legacy "<18" row is kept separate rather than folded into one of the
  // three brackets that replaced it: those impressions were measured when the
  // model could not tell a toddler from a teenager, and merging them anywhere
  // would state a precision that was never recorded. It only appears while old
  // rows are still inside the reporting window.
  const chartData = [
    { group: "<6", label: "<6", count: data["<6"] || 0 },
    { group: "6-13", label: "6-13", count: data["6-13"] || 0 },
    { group: "13-18", label: "13-18", count: data["13-18"] || 0 },
    { group: "18-35", label: "18-35", count: (data["18-35"] || 0) + (data["18-24"] || 0) + (data["25-34"] || 0) },
    { group: "35-55", label: "35-55", count: (data["35-55"] || 0) + (data["35-50"] || 0) },
    { group: ">55", label: ">55", count: data[">55"] || 0 },
    { group: "<18", label: "<18 (cũ)", count: data["<18"] || 0 },
  ].filter((d) => d.group !== "<18" || d.count > 0);

  const total = chartData.reduce((sum, item) => sum + item.count, 0);

  if (!mounted) {
    return <div className="h-56 w-full animate-pulse bg-slate-50/50 rounded-xl" />;
  }

  if (!total) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-400">
        Chưa có dữ liệu độ tuổi
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 18, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
          {/* Every bar carries its count, so the y-axis would only take width from the labels. */}
          <XAxis
            dataKey="label"
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            interval={0}
            tick={{ fontSize: 10, fill: CHART.axis }}
          />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            {...CHART_TOOLTIP}
            formatter={(val: unknown) => {
              const n = Number(val) || 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              return [`${n.toLocaleString()} lượt (${pct}%)`, "Số lượng"];
            }}
          />
          <Bar dataKey="count" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={40}
              // Labels only draw once the grow animation ends; live data restarts it every tick.
              isAnimationActive={false}
            >
            <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#334155" }} formatter={(v) => (Number(v) ? v : "")} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// -------------------------------------------------------------
// 4. AUDIENCE BY HOUR OF DAY
// -------------------------------------------------------------
/** The hour that drew the most people who watched (ties: most reach). */
export function peakHour(hours: { hour: number; reach: number; impressions: number }[]) {
  const best = [...hours].sort((a, b) => b.impressions - a.impressions || b.reach - a.reach)[0];
  return best && (best.impressions || best.reach) ? best : null;
}

export function AudienceByHourChart({
  hours,
}: {
  hours: { hour: number; reach: number; impressions: number; attention_seconds: number }[];
}) {
  const mounted = useMounted();
  const data = hours.map((h) => ({
    ...h,
    label: `${h.hour}h`,
    passed: Math.max(0, h.reach - h.impressions),
  }));
  const peak = peakHour(hours);

  if (!mounted) {
    return <div className="h-60 w-full animate-pulse bg-slate-50/50 rounded-xl" />;
  }
  if (!peak) {
    return (
      <div className="flex h-56 items-center justify-center text-xs text-slate-400">
        Chưa có khán giả nào trong khoảng thời gian này
      </div>
    );
  }

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8, left: -16, bottom: 0 }} barCategoryGap="16%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          {/* Shade the busiest hour so the eye lands on it before the legend. */}
          <ReferenceArea
            x1={`${peak.hour}h`}
            x2={`${peak.hour}h`}
            fill={CHART.primary}
            fillOpacity={0.08}
            label={{ value: "Giờ vàng", position: "insideTop", fontSize: 10, fill: "#047857", fontWeight: 600, dy: -16 }}
          />
          <XAxis
            dataKey="label"
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            interval={1}
            tick={{ fontSize: 10, fill: CHART.axis }}
          />
          <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} />
          <Tooltip
            {...CHART_TOOLTIP}
            labelFormatter={(_, items) => {
              const h = items?.[0]?.payload as (typeof data)[number] | undefined;
              if (!h) return "";
              const avg = h.impressions ? ` · nhìn TB ${(h.attention_seconds / Math.max(1, h.reach)).toFixed(1)}s/người` : "";
              return `${h.hour}h – ${h.hour + 1}h${avg}`;
            }}
            formatter={(value: unknown, name: unknown) => [`${Number(value) || 0} người`, String(name)]}
            itemSorter={(item) => (item.dataKey === "impressions" ? 0 : 1)}
          />
          {/* Bottom, so the "Giờ vàng" tag above the peak bar never sits under it. */}
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingTop: 6 }}
            itemSorter={(item) => (item.dataKey === "impressions" ? 0 : 1)}
            formatter={(val) => <span className="text-xs font-medium text-slate-600">{val}</span>}
          />
          <Bar dataKey="impressions" name="Xem thực (Impression)" stackId="a" fill={CHART.primary} stroke="#ffffff" strokeWidth={1} />
          <Bar
            dataKey="passed"
            name="Chỉ đi qua"
            stackId="a"
            fill={CHART.context}
            stroke="#ffffff"
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
