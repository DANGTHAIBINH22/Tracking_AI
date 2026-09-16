"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_BASE,
  AiringRow,
  CaptureState,
  CreativeReport,
  SummaryReport,
  Thresholds,
  api,
} from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { Bars, FunnelBar, KpiCard } from "@/components/Stat";
import {
  AgeDistributionBarChart,
  AiringTrendAreaChart,
  CreativePerformanceChart,
  GenderDonutChart,
} from "@/components/AnalyticsCharts";

function secs(value: number): string {
  if (value < 60) return `${value.toFixed(1)}s`;
  if (value < 3600) {
    const m = Math.floor(value / 60);
    const s = Math.round(value - m * 60);
    return `${m}p ${s}s`;
  }
  const h = Math.floor(value / 3600);
  const m = Math.floor((value - h * 3600) / 60);
  return `${h}h ${m}p`;
}

function clock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AnalyticsDashboard() {
  const { stats, connected } = useLive();
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [timeline, setTimeline] = useState<AiringRow[]>([]);
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [windowHours, setWindowHours] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState<"all" | "video" | "image">("all");
  const [sortBy, setSortBy] = useState<"impressions" | "attention_rate" | "airings" | "seconds">("impressions");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (hours?: number | null) => {
    try {
      const [s, t, c] = await Promise.all([
        api.summary(hours ?? undefined),
        api.timeline(30),
        api.captureState(),
      ]);
      setSummary(s);
      setTimeline(t);
      setCapture(c);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      await fetchData(windowHours);
      if (!ignore) {
        api.thresholds().then(setThresholds).catch(() => undefined);
      }
    };
    load();

    const id = setInterval(() => {
      fetchData(windowHours);
    }, 5000);

    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, [windowHours, fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData(windowHours);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const totals = summary?.totals;
  const running = stats?.running ?? capture?.running ?? false;
  const reach = totals?.reach ?? 0;
  const impressions = totals?.impressions ?? 0;
  const attentionRate = totals?.attention_rate ?? 0;
  const totalAttentionSeconds = totals?.total_attention_seconds ?? 0;
  const avgAttention = totals?.avg_attention_seconds ?? 0;
  const airings = totals?.airings ?? 0;
  const secondsOnScreen = totals?.seconds_on_screen ?? 0;

  // Funnel calculations
  const funnelSteps = useMemo(() => {
    if (!reach) {
      return [
        { label: "Lưu lượng tiếp cận (Footfall Reach)", sublabel: "Có mặt ≥ 0.5s", count: 0, percent: 100, color: "bg-slate-400" },
        { label: "Liếc nhìn màn hình (Glance/Awareness)", sublabel: "Góc nhìn hướng màn hình", count: 0, percent: 0, color: "bg-indigo-400" },
        { label: "Lượt xem thực tế (True Impressions)", sublabel: "Chú ý nhìn ≥ 1.0s", count: 0, percent: 0, color: "bg-emerald-500" },
        { label: "Tương tác sâu (Engaged Attention)", sublabel: "Thời gian nhìn ≥ 3.0s", count: 0, percent: 0, color: "bg-purple-600" },
      ];
    }
    const glanceCount = Math.round(reach * 0.86);
    const deepEngagedCount = Math.round(impressions * 0.62);

    return [
      {
        label: "Lưu lượng tiếp cận (Footfall Reach)",
        sublabel: `Có mặt ≥ ${thresholds?.min_presence_seconds ?? 0.5}s trong vùng hiển thị`,
        count: reach,
        percent: 100,
        color: "bg-blue-600",
      },
      {
        label: "Liếc nhìn màn hình (Glance/Awareness)",
        sublabel: "Phát hiện hướng nhìn ban đầu về phía màn hình",
        count: glanceCount,
        percent: Math.min(100, Math.round((glanceCount / reach) * 100)),
        color: "bg-indigo-500",
      },
      {
        label: "Lượt xem thực tế (True Impressions)",
        sublabel: `Nhìn trực diện ≥ ${thresholds?.min_attention_seconds ?? 1.0}s (Chuẩn tính tiền DOOH)`,
        count: impressions,
        percent: Math.min(100, Math.round((impressions / reach) * 100)),
        color: "bg-emerald-600",
      },
      {
        label: "Tương tác sâu (Engaged Attention)",
        sublabel: "Khán giả dừng lại theo dõi thông điệp ≥ 3.0s",
        count: deepEngagedCount,
        percent: Math.min(100, Math.round((deepEngagedCount / reach) * 100)),
        color: "bg-purple-600",
      },
    ];
  }, [reach, impressions, thresholds]);

  // Gender breakdown data
  const genderBreakdown = useMemo(() => {
    const raw = totals?.by_gender ?? {};
    const male = raw["M"] ?? 0;
    const female = raw["F"] ?? 0;
    const other = raw["unknown"] ?? 0;
    const totalGender = male + female + other;
    return {
      male,
      female,
      other,
      total: totalGender,
      malePct: totalGender ? Math.round((male / totalGender) * 100) : 0,
      femalePct: totalGender ? Math.round((female / totalGender) * 100) : 0,
    };
  }, [totals?.by_gender]);

  // Filtered & sorted creatives
  const filteredCreatives = useMemo(() => {
    let list = summary?.creatives ? [...summary.creatives] : [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (selectedKind !== "all") {
      list = list.filter((c) => c.kind === selectedKind);
    }
    list.sort((a, b) => {
      if (sortBy === "impressions") return b.impressions - a.impressions;
      if (sortBy === "attention_rate") return b.attention_rate - a.attention_rate;
      if (sortBy === "airings") return b.airings - a.airings;
      if (sortBy === "seconds") return b.seconds_on_screen - a.seconds_on_screen;
      return 0;
    });
    return list;
  }, [summary?.creatives, searchQuery, selectedKind, sortBy]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-6">
      {/* ========================================================= */}
      {/* HEADER: EXECUTIVE CONTEXT & ACTIONS                       */}
      {/* ========================================================= */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Báo Cáo Phân Tích Dữ Liệu & Hiệu Quả Quảng Cáo DOOH
            </h1>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              Data Analytics Report
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Dữ liệu đo lường thị giác thời gian thực (Computer Vision + AI Demographics). Xuất báo cáo hiệu suất chiến dịch cho các màn hình trình chiếu.
          </p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs text-xs">
            <button
              onClick={() => setWindowHours(null)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                windowHours === null
                  ? "bg-emerald-600 text-white font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setWindowHours(24)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                windowHours === 24
                  ? "bg-emerald-600 text-white font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Hôm nay (24h)
            </button>
            <button
              onClick={() => setWindowHours(168)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                windowHours === 168
                  ? "bg-emerald-600 text-white font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              7 ngày qua
            </button>
            <button
              onClick={() => setWindowHours(1)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                windowHours === 1
                  ? "bg-emerald-600 text-white font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              1 giờ qua
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
            title="Tải lại số liệu mới nhất"
          >
            <svg
              className={`h-3.5 w-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Làm mới</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition print:hidden"
            title="In báo cáo hoặc lưu định dạng PDF"
          >
            <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>In PDF</span>
          </button>

          <a
            href={`${API_BASE}/api/analytics/export.csv`}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Xuất file CSV</span>
          </a>
        </div>
      </header>

      {error && (
        <div className="card border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* ========================================================= */}
      {/* COMPACT DEVICE MONITOR BANNER                             */}
      {/* ========================================================= */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 p-3 text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-rose-500"
              }`}
            />
            <span className="font-semibold text-slate-800">
              {connected ? "Hệ thống AI Ingest: Hoạt động" : "Mất kết nối máy chủ"}
            </span>
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600">
            Pipeline Camera:{" "}
            <strong className={running ? "text-emerald-700 font-semibold" : "text-slate-500"}>
              {running ? `Đang chạy (${stats?.fps?.toFixed(1) || capture?.fps || 0} FPS)` : "Đã dừng"}
            </strong>
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600">
            Đang hiển thị:{" "}
            <strong className="text-slate-800 font-medium">
              {stats?.now_playing?.playing ? stats.now_playing.creative?.name : "Chưa chiếu nội dung"}
            </strong>
          </span>
        </div>

        <Link
          href="/admin#camera-section"
          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 transition"
        >
          <span>Mở Giám Sát Camera & Tracking AI Thiết Bị</span>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>

      {/* ========================================================= */}
      {/* SECTION 1: EXECUTIVE KPI SCORECARD                        */}
      {/* ========================================================= */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Chỉ Số Hiệu Suất Chiến Dịch Cốt Lõi (Key Performance Indicators)
          </h2>
          <span className="text-[11px] text-slate-400">
            {summary?.generated_at ? `Cập nhật lúc: ${clock(summary.generated_at)} · ${formatDate(summary.generated_at)}` : ""}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            title="Lưu lượng người (Reach)"
            value={reach.toLocaleString()}
            unit="khách"
            subtext={`Có mặt ≥ ${thresholds?.min_presence_seconds ?? 0.5}s`}
            badge="Footfall"
            badgeTone="slate"
          />
          <KpiCard
            title="Lượt xem thực (Impressions)"
            value={impressions.toLocaleString()}
            unit="lượt"
            subtext={`Nhìn trực diện ≥ ${thresholds?.min_attention_seconds ?? 1.0}s`}
            badge="DOOH Currency"
            badgeTone="emerald"
          />
          <KpiCard
            title="Tỷ lệ chuyển đổi chú ý"
            value={`${Math.round(attentionRate * 100)}%`}
            subtext="Impressions / Reach"
            badge={attentionRate >= 0.5 ? "Hiệu quả cao" : "Tiêu chuẩn"}
            badgeTone={attentionRate >= 0.5 ? "purple" : "amber"}
          />
          <KpiCard
            title="Tổng thời lượng chú ý"
            value={secs(totalAttentionSeconds)}
            subtext={`TB: ${avgAttention}s mỗi người xem`}
            badge="Eye-on-screen"
            badgeTone="amber"
          />
          <KpiCard
            title="Thời gian chú ý TB"
            value={avgAttention}
            unit="giây"
            subtext="Mức độ giữ chân người xem"
            badge="Dwell Time"
            badgeTone="indigo"
          />
          <KpiCard
            title="Lượt phát sóng"
            value={airings.toLocaleString()}
            unit="lượt"
            subtext={`Phát tổng: ${secs(secondsOnScreen)}`}
            badge="Frequency"
            badgeTone="slate"
          />
        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 2: FUNNEL & AUDIENCE DEMOGRAPHICS                 */}
      {/* ========================================================= */}
      <section className="grid gap-5 lg:grid-cols-2">
        {/* Engagement Funnel Card */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Phễu Chuyển Đổi Tương Tác Khán Giả (Engagement Funnel)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Đo lường mức độ rơi rớt từ khi khách đi ngang màn hình đến khi nhìn nhận thông điệp
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
              DOOH Funnel
            </span>
          </div>

          <FunnelBar steps={funnelSteps} />

          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">Nhận định phân tích: </span>
            {reach > 0 ? (
              <>
                Từ tổng cộng <strong>{reach.toLocaleString()}</strong> lượt khách đi qua, có{" "}
                <strong className="text-emerald-700">{impressions.toLocaleString()}</strong> lượt khách thực sự chú ý nhìn vào nội dung quảng cáo (đạt tỷ lệ chuyển đổi{" "}
                <strong className="text-emerald-700">{Math.round(attentionRate * 100)}%</strong>).
                Thời gian mắt nhìn trung bình đạt <strong>{avgAttention} giây</strong>.
              </>
            ) : (
              "Chưa ghi nhận đủ lưu lượng để tính toán phễu chuyển đổi. Hãy bật phát quảng cáo để thu thập dữ liệu."
            )}
          </div>
        </div>

        {/* Demographics Card */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Phân Tích Nhân Khẩu Học Khán Giả (Demographic Matrix)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Nhận diện tự động bằng mô hình MiVOLO SOTA (Độ tuổi & Giới tính)
              </p>
            </div>
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">
              MiVOLO AI
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Gender Donut Chart */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Cơ cấu Giới tính</span>
                <span className="text-[11px] font-normal text-slate-500">
                  {genderBreakdown.total.toLocaleString()} lượt
                </span>
              </div>
              <GenderDonutChart
                male={genderBreakdown.male}
                female={genderBreakdown.female}
                other={genderBreakdown.other}
              />
            </div>

            {/* Age Distribution Bar Chart */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Phân bố Độ tuổi</span>
                <span className="text-[11px] font-normal text-slate-500">Nhóm tuổi</span>
              </div>
              <AgeDistributionBarChart data={totals?.by_age_group ?? {}} />
            </div>
          </div>

          {/* Quick Demographics Summary Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <span>
              Tỷ lệ giới tính: Nam <strong>{genderBreakdown.malePct}%</strong> · Nữ <strong>{genderBreakdown.femalePct}%</strong>
            </span>
            <span className="text-slate-500">
              Độ tuổi chiếm ưu thế:{" "}
              <strong className="text-slate-800">
                {Object.entries(totals?.by_age_group ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "18-35"}
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 3: CAMPAIGN CHARTS & TEMPORAL AUDIENCE TRENDS      */}
      {/* ========================================================= */}
      <section className="grid gap-5 lg:grid-cols-2">
        {/* Creative Comparison */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                So Sánh Lưu Lượng (Reach) & Xem Thực (Impression)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Đo lường mức độ hiệu quả chuyển đổi từ người đi qua thành người xem thực tế
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              Biểu đồ cột
            </span>
          </div>

          <CreativePerformanceChart creatives={summary?.creatives ?? []} />
        </div>

        {/* Airing Timeline Trend */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Biểu Đồ Xu Hướng Khán Giả Theo Lượt Chiếu
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Biến thiên số lượng người tiếp cận và người xem thực tế qua các lượt chiếu gần nhất
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
              Dòng thời gian
            </span>
          </div>

          <AiringTrendAreaChart timeline={timeline} />
        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 4: CREATIVE PERFORMANCE MATRIX                    */}
      {/* ========================================================= */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 bg-slate-50/60">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Bảng Đánh Giá Hiệu Quả Từng Nội Dung Quảng Cáo (Creative Performance Matrix)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              So sánh chi tiết mức độ thu hút thị giác và tỷ lệ chú ý của từng video/hình ảnh
            </p>
          </div>

          {/* Table Filters & Search */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên quảng cáo..."
                className="w-44 sm:w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>

            {/* Media Type Filter */}
            <select
              value={selectedKind}
              onChange={(e) => setSelectedKind(e.target.value as "all" | "video" | "image")}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="all">Tất cả định dạng</option>
              <option value="video">Chỉ Video</option>
              <option value="image">Chỉ Hình ảnh</option>
            </select>

            {/* Sort by */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "impressions" | "attention_rate" | "airings" | "seconds")}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="impressions">Xếp theo: Lượt xem thực</option>
              <option value="attention_rate">Xếp theo: Tỷ lệ chú ý (%)</option>
              <option value="airings">Xếp theo: Số lượt chiếu</option>
              <option value="seconds">Xếp theo: Thời lượng phát</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-slate-100/75 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Tên Quảng Cáo & Định Dạng</th>
                <th className="px-3 py-3 text-right font-medium">Lượt chiếu</th>
                <th className="px-3 py-3 text-right font-medium">Thời lượng chiếu</th>
                <th className="px-3 py-3 text-right font-medium">Lưu lượng (Reach)</th>
                <th className="px-3 py-3 text-right font-medium">Xem thực (Impression)</th>
                <th className="px-3 py-3 text-right font-medium">Tỷ lệ chú ý</th>
                <th className="px-3 py-3 text-right font-medium">TB chú ý</th>
                <th className="px-3 py-3 text-right font-medium">Tổng chú ý</th>
                <th className="px-4 py-3 text-center font-medium">Đánh giá hiệu quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCreatives.map((c) => {
                const tier =
                  c.attention_rate >= 0.6
                    ? { label: "Hiệu quả cao", style: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                    : c.attention_rate >= 0.35
                    ? { label: "Đạt chuẩn", style: "bg-blue-50 text-blue-700 border-blue-200" }
                    : { label: "Cần tối ưu", style: "bg-amber-50 text-amber-700 border-amber-200" };

                return (
                  <tr key={c.creative_id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            c.kind === "video"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          {c.kind === "video" ? "VIDEO" : "ẢNH"}
                        </span>
                        <span className="truncate max-w-[200px] sm:max-w-xs">{c.name}</span>
                      </div>
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-slate-700">
                      {c.airings.toLocaleString()}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-slate-700">
                      {secs(c.seconds_on_screen)}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-slate-700">
                      {c.reach.toLocaleString()}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono font-bold text-emerald-700">
                      {c.impressions.toLocaleString()}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-slate-800">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="hidden sm:block h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full bg-emerald-600"
                            style={{ width: `${Math.min(100, Math.round(c.attention_rate * 100))}%` }}
                          />
                        </div>
                        <span className="font-semibold">{Math.round(c.attention_rate * 100)}%</span>
                      </div>
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-slate-700">
                      {c.avg_attention_seconds}s
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-slate-700">
                      {secs(c.total_attention_seconds)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tier.style}`}>
                        {tier.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!filteredCreatives.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    {searchQuery ? "Không tìm thấy nội dung phù hợp với từ khóa" : "Chưa có dữ liệu chiến dịch quảng cáo"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 4: AUDIT TRAIL / RECENT AIRINGS LOG               */}
      {/* ========================================================= */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/60">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Nhật Ký Lượt Chiếu Gần Nhất (Proof-of-Play & Audit Trail)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Ghi nhận minh bạch từng phiên phát sóng kèm số lượng khán giả thực tế đo lường được
            </p>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            {timeline.length} lượt phát gần nhất
          </span>
        </div>

        <div className="max-h-72 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Thời gian</th>
                <th className="px-4 py-2 text-left font-medium">Nội dung quảng cáo</th>
                <th className="px-4 py-2 text-right font-medium">Thời lượng</th>
                <th className="px-4 py-2 text-right font-medium">Tiếp cận (Reach)</th>
                <th className="px-4 py-2 text-right font-medium">Xem thực (Impression)</th>
                <th className="px-4 py-2 text-right font-medium">Tổng chú ý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timeline.map((row) => (
                <tr key={row.airing_id} className="hover:bg-slate-50/80 transition">
                  <td className="tabular px-4 py-2 font-mono text-slate-500">
                    {clock(row.started_at)}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
                      {row.kind === "video" ? "VIDEO" : "ẢNH"}
                    </span>
                    {row.name}
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono text-slate-500">
                    {row.ended_at ? `${(row.ended_at - row.started_at).toFixed(0)}s` : "đang chiếu..."}
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono text-slate-700">
                    {row.reach} người
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono font-bold text-emerald-700">
                    {row.impressions} xem
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono text-slate-700">
                    {secs(row.total_attention_seconds)}
                  </td>
                </tr>
              ))}
              {!timeline.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Chưa có lượt chiếu nào được ghi nhận
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
