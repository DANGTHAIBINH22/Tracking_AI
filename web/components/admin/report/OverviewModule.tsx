"use client";

import { useMemo } from "react";
import { AudienceByHourChart, peakHour } from "@/components/AnalyticsCharts";
import { FunnelChart, type FunnelStage } from "@/components/charts/funnel-chart";
import type { BreakdownRow } from "@/lib/api";
import { ReachTrendChart, STAGE } from "./charts";
import { DEFINITIONS, Empty, KpiTile, Meter, Panel, fmtDuration, fmtInt, fmtPct, ratio } from "./shared";
import type { ReportData } from "./useAdminReport";

/** Below this many people a rate is noise; "best media" must not be a 1-of-1. */
export const MIN_SAMPLE = 20;

/** Funnel stages summed over rows that each count a look once (media or playlists). */
export function funnelStages(rows: BreakdownRow[], minAtt: number, engagedSeconds: number): FunnelStage[] {
  const sum = (k: "reach" | "glance" | "impressions" | "engaged") => rows.reduce((n, r) => n + r[k], 0);
  return [
    { id: "reach", label: "Có mặt trước màn hình", value: sum("reach"), color: STAGE.context },
    { id: "glance", label: "Có nhìn", value: sum("glance"), color: STAGE.glance },
    { id: "impressions", label: `Xem ≥ ${minAtt}s`, value: sum("impressions"), color: STAGE.primary },
    { id: "engaged", label: `Chú ý ≥ ${engagedSeconds}s`, value: sum("engaged"), color: STAGE.engaged },
  ];
}

export function AudienceFunnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages[0]?.value) return <Empty className="h-72">Chưa có khán giả nào để dựng phễu.</Empty>;
  return <FunnelChart stages={stages} unit="người" label="Phễu khán giả" formatValue={fmtInt} />;
}

function Insight({ label, title, detail }: { label: string; title: string | null; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900" title={title ?? undefined}>
        {title ?? "—"}
      </p>
      {detail && <p className="mt-0.5 text-[11px] text-slate-500">{detail}</p>}
    </div>
  );
}

export function OverviewModule({ data }: { data: ReportData }) {
  const { overview, breakdown, detection } = data;
  const cur = overview.current;
  const prev = overview.previous;
  const minAtt = breakdown.min_attention_seconds;

  const insights = useMemo(() => {
    const byRate = (rows: BreakdownRow[]) =>
      [...rows].filter((r) => r.reach >= MIN_SAMPLE).sort((a, b) => b.attention_rate - a.attention_rate)[0] ?? null;
    const byImpr = (rows: BreakdownRow[]) =>
      [...rows].filter((r) => r.reach > 0).sort((a, b) => b.impressions - a.impressions || b.reach - a.reach)[0] ?? null;
    return {
      screen: byImpr(breakdown.devices.filter((d) => d.key !== "-")),
      media: byRate(breakdown.media),
      playlist: byImpr(breakdown.playlists),
      peak: peakHour(breakdown.hours),
    };
  }, [breakdown]);

  const screens = useMemo(
    () => breakdown.devices.filter((d) => d.reach > 0 || d.people > 0).slice(0, 6),
    [breakdown.devices],
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Tiếp cận" value={cur.reach} previous={prev.reach} definition={DEFINITIONS.reach} />
        <KpiTile
          label="Xem thực"
          value={cur.impressions}
          previous={prev.impressions}
          definition={DEFINITIONS.impressions(minAtt)}
          tone="accent"
        />
        <KpiTile
          label="Tỉ lệ chú ý"
          value={(ratio(cur.impressions, cur.reach) ?? 0) * 100}
          format={(n) => `${n.toFixed(1)}%`}
          previous={prev.reach ? (prev.impressions / prev.reach) * 100 : undefined}
          definition={DEFINITIONS.attention}
        />
        <KpiTile
          label="Thời gian chú ý"
          value={cur.attention_seconds ?? 0}
          format={fmtDuration}
          sub={<span>{cur.impressions ? `${((cur.attention_seconds ?? 0) / cur.impressions).toFixed(1)}s / lượt xem` : ""}</span>}
          definition={DEFINITIONS.attentionTime}
        />
        <KpiTile
          label="Người phát hiện"
          value={detection.totals.detected}
          previous={prev.people}
          sub={<span>đỉnh {detection.totals.peak_people} người cùng lúc</span>}
          definition={DEFINITIONS.detected}
        />
        <KpiTile
          label="Màn hình hoạt động"
          value={cur.active_devices}
          sub={
            <span>
              {overview.devices_online}/{overview.devices_total} đang online · {cur.airings ?? 0} lượt phát
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Insight
          label="Màn hình hiệu quả nhất"
          title={insights.screen?.name ?? null}
          detail={insights.screen ? `${fmtInt(insights.screen.impressions)} lượt xem · chú ý ${fmtPct(insights.screen.attention_rate)}` : undefined}
        />
        <Insight
          label="Media giữ ánh nhìn tốt nhất"
          title={insights.media?.name ?? null}
          detail={
            insights.media
              ? `chú ý ${fmtPct(insights.media.attention_rate)} trên ${fmtInt(insights.media.reach)} người`
              : `cần ≥ ${MIN_SAMPLE} người tiếp cận để xếp hạng`
          }
        />
        <Insight
          label="Playlist tiếp cận nhiều nhất"
          title={insights.playlist?.name ?? null}
          detail={insights.playlist ? `${fmtInt(insights.playlist.reach)} tiếp cận · ${fmtInt(insights.playlist.impressions)} xem thực` : undefined}
        />
        <Insight
          label="Giờ vàng"
          title={insights.peak ? `${insights.peak.hour}h – ${insights.peak.hour + 1}h` : null}
          detail={insights.peak ? `${fmtInt(insights.peak.impressions)} xem thực / ${fmtInt(insights.peak.reach)} tiếp cận` : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="Tiếp cận và xem thực theo thời gian"
          hint="Cả cột là số người đi qua trong lúc quảng cáo phát; phần xanh là người thực sự xem."
        >
          <ReachTrendChart series={overview.series} bucketSeconds={overview.bucket_seconds} />
        </Panel>
        <Panel
          className="xl:col-span-2"
          title="Phễu khán giả"
          hint="Mỗi người được đếm một lần cho mỗi lượt phát. Rê chuột vào từng tầng để xem tỉ lệ rơi rụng."
        >
          <AudienceFunnel stages={funnelStages(breakdown.media, minAtt, breakdown.engaged_seconds)} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title="Khán giả theo giờ trong ngày" hint="Theo giờ người xem đến, cộng dồn trên cả kỳ báo cáo.">
          <AudienceByHourChart hours={breakdown.hours} />
        </Panel>
        <Panel className="xl:col-span-2" title="Bảng xếp hạng màn hình" hint="Theo lượt xem thực trong kỳ.">
          {screens.length ? (
            <ol className="space-y-3">
              {screens.map((d, i) => (
                <li key={d.key} className="text-xs">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-slate-800">
                      <span className="mr-1.5 tabular-nums text-slate-400">{i + 1}.</span>
                      {d.name}
                      {d.sub && <span className="ml-1.5 text-slate-400">· {d.sub}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {fmtInt(d.impressions)} / {fmtInt(d.reach)}
                    </span>
                  </div>
                  <Meter value={d.reach ? d.attention_rate : null} />
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Chưa có màn hình nào ghi nhận khán giả.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
