"use client";

import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

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
    { name: "Nam giới", value: male, color: "#3b82f6" },
    { name: "Nữ giới", value: female, color: "#ec4899" },
    ...(other > 0 ? [{ name: "Khác", value: other, color: "#94a3b8" }] : []),
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
            formatter={(val: unknown) => {
              const n = Number(val) || 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              return [`${n.toLocaleString()} lượt (${pct}%)`, ""];
            }}
            contentStyle={{
              backgroundColor: "#ffffff",
              borderColor: "#e2e8f0",
              borderRadius: "0.5rem",
              fontSize: "12px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={4}
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
            formatter={(value, entry) => {
              const item = data.find((d) => d.name === value);
              const pct = item && total ? Math.round((item.value / total) * 100) : 0;
              return (
                <span className="text-xs font-medium text-slate-700">
                  {value}: <strong style={{ color: entry.color }}>{pct}%</strong>
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
    { group: "<6", label: "Dưới 6", count: data["<6"] || 0 },
    { group: "6-13", label: "6 - 13", count: data["6-13"] || 0 },
    { group: "13-18", label: "13 - 18", count: data["13-18"] || 0 },
    { group: "18-35", label: "18 - 35", count: (data["18-35"] || 0) + (data["18-24"] || 0) + (data["25-34"] || 0) },
    { group: "35-55", label: "35 - 55", count: (data["35-55"] || 0) + (data["35-50"] || 0) },
    { group: ">55", label: "Trên 55", count: data[">55"] || 0 },
    { group: "<18", label: "Dưới 18 (cũ)", count: data["<18"] || 0 },
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
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(val: unknown) => {
              const n = Number(val) || 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              return [`${n.toLocaleString()} lượt (${pct}%)`, "Số lượng"];
            }}
            contentStyle={{
              backgroundColor: "#ffffff",
              borderColor: "#e2e8f0",
              borderRadius: "0.5rem",
              fontSize: "12px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === 1 ? "#059669" : index === 2 ? "#10b981" : "#34d399"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// -------------------------------------------------------------
// 3. CREATIVE COMPARISON CHART (REACH VS IMPRESSION)
// -------------------------------------------------------------
export function CreativePerformanceChart({
  creatives,
}: {
  creatives: {
    name: string;
    reach: number;
    impressions: number;
    attention_rate: number;
  }[];
}) {
  const mounted = useMounted();
  const chartData = creatives.slice(0, 6).map((c) => ({
    name: c.name.length > 15 ? `${c.name.slice(0, 14)}…` : c.name,
    reach: c.reach,
    impressions: c.impressions,
    rate: Math.round(c.attention_rate * 100),
  }));

  if (!mounted) {
    return <div className="h-64 w-full animate-pulse bg-slate-50/50 rounded-xl" />;
  }

  if (!chartData.length) {
    return (
      <div className="flex h-56 items-center justify-center text-xs text-slate-400">
        Chưa có quảng cáo để so sánh
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#475569" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown, item: { payload?: { rate?: number } }) => {
              const n = Number(value) || 0;
              if (name === "Lượt xem thực (Impression)") {
                return [`${n.toLocaleString()} (Tỷ lệ: ${item?.payload?.rate ?? 0}%)`, String(name)];
              }
              return [`${n.toLocaleString()} người`, String(name)];
            }}
            contentStyle={{
              backgroundColor: "#ffffff",
              borderColor: "#e2e8f0",
              borderRadius: "0.5rem",
              fontSize: "12px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={30}
            iconType="circle"
            formatter={(val) => <span className="text-xs font-medium text-slate-600">{val}</span>}
          />
          <Bar name="Lưu lượng tiếp cận (Reach)" dataKey="reach" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar name="Lượt xem thực (Impression)" dataKey="impressions" fill="#059669" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// -------------------------------------------------------------
// 4. AIRING AUDIENCE TIMELINE AREA CHART
// -------------------------------------------------------------
export function AiringTrendAreaChart({
  timeline,
}: {
  timeline: {
    started_at: number;
    name: string;
    reach: number;
    impressions: number;
    total_attention_seconds: number;
  }[];
}) {
  const mounted = useMounted();
  const chartData = [...timeline]
    .reverse()
    .slice(-15)
    .map((row) => {
      const timeStr = new Date(row.started_at * 1000).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return {
        time: timeStr,
        name: row.name,
        reach: row.reach,
        impressions: row.impressions,
        attentionSeconds: Math.round(row.total_attention_seconds),
      };
    });

  if (!mounted) {
    return <div className="h-60 w-full animate-pulse bg-slate-50/50 rounded-xl" />;
  }

  if (!chartData.length) {
    return (
      <div className="flex h-56 items-center justify-center text-xs text-slate-400">
        Chưa có phiên phát sóng gần đây
      </div>
    );
  }

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorImp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              `${Number(value) || 0} lượt`,
              String(name),
            ]}
            labelFormatter={(label, items) => {
              const item = items?.[0]?.payload;
              return `${label} · ${item?.name || "Lượt chiếu"}`;
            }}
            contentStyle={{
              backgroundColor: "#ffffff",
              borderColor: "#e2e8f0",
              borderRadius: "0.5rem",
              fontSize: "12px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={30}
            iconType="circle"
            formatter={(val) => <span className="text-xs font-medium text-slate-600">{val}</span>}
          />
          <Area
            type="monotone"
            name="Lưu lượng qua (Reach)"
            dataKey="reach"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorReach)"
          />
          <Area
            type="monotone"
            name="Xem thực (Impression)"
            dataKey="impressions"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorImp)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
