"use client";

import { useMemo, useState } from "react";
import { FieldSelect } from "@/components/FieldSelect";
import { Table, type TableColumn } from "@/components/motion/table";
import type { BreakdownRow } from "@/lib/api";
import { RankingChart } from "./charts";
import { AudienceFunnel, MIN_SAMPLE, funnelStages } from "./OverviewModule";
import { DEFINITIONS, Empty, KpiTile, Meter, Panel, fmtDuration, fmtInt, fmtPct, ratio } from "./shared";
import type { ReportData } from "./useAdminReport";

type Kind = "media" | "playlists";

const COPY: Record<Kind, { noun: string; title: string; empty: string }> = {
  media: { noun: "Media", title: "Hiệu quả từng media", empty: "Chưa media nào lên sóng trong kỳ này." },
  playlists: { noun: "Playlist", title: "Hiệu quả từng playlist", empty: "Chưa playlist nào lên sóng trong kỳ này." },
};

/** Impressions per hour on air: the fair comparison between a 6s image and a 60s video. */
const perHour = (r: BreakdownRow) => (r.seconds_on_screen > 0 ? r.impressions / (r.seconds_on_screen / 3600) : null);

function columnsFor(kind: Kind): TableColumn<BreakdownRow>[] {
  return [
    {
      key: "name",
      header: COPY[kind].noun,
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate font-semibold text-slate-900" title={r.name}>
            {r.name}
          </span>
          <span className="block truncate text-[11px] text-slate-400">
            {kind === "media" ? (r.sub === "video" ? "Video" : r.sub === "image" ? "Hình ảnh" : r.sub || "—") : `${r.devices} màn hình`}
            {r.reach > 0 && r.reach < MIN_SAMPLE && <span className="ml-1.5 text-amber-600">· mẫu nhỏ</span>}
          </span>
        </div>
      ),
    },
    { key: "airings", header: "Lượt phát", align: "right", width: "120px", sortable: true, cell: (r) => fmtInt(r.airings) },
    {
      key: "seconds_on_screen",
      header: "Lên sóng",
      align: "right",
      width: "116px",
      sortable: true,
      cell: (r) => fmtDuration(r.seconds_on_screen),
    },
    { key: "reach", header: "Tiếp cận", align: "right", width: "116px", sortable: true, cell: (r) => fmtInt(r.reach) },
    {
      key: "impressions",
      header: "Xem thực",
      align: "right",
      width: "116px",
      sortable: true,
      cell: (r) => <span className="font-semibold tabular-nums text-emerald-700">{fmtInt(r.impressions)}</span>,
    },
    {
      key: "attention_rate",
      header: "Tỉ lệ chú ý",
      width: "170px",
      sortable: true,
      sortValue: (r) => (r.reach ? r.attention_rate : -1),
      cell: (r) => <Meter value={r.reach ? r.attention_rate : null} />,
    },
    {
      key: "engaged",
      header: "Chú ý sâu",
      align: "right",
      width: "124px",
      sortable: true,
      cell: (r) => fmtInt(r.engaged),
    },
    {
      key: "avg_attention",
      header: "Giây nhìn/người",
      align: "right",
      width: "150px",
      sortable: true,
      sortValue: (r) => (r.reach ? r.attention_seconds / r.reach : -1),
      cell: (r) => (r.reach ? `${(r.attention_seconds / r.reach).toFixed(1)}s` : "—"),
    },
    {
      key: "per_hour",
      header: "Xem/giờ phát",
      align: "right",
      width: "136px",
      sortable: true,
      sortValue: (r) => perHour(r) ?? -1,
      cell: (r) => {
        const v = perHour(r);
        return v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
      },
    },
  ];
}

export function PerformanceModule({ data, kind }: { data: ReportData; kind: Kind }) {
  const { breakdown } = data;
  const rows = useMemo(() => breakdown[kind].filter((r) => r.airings > 0 || r.reach > 0), [breakdown, kind]);
  const columns = useMemo(() => columnsFor(kind), [kind]);
  const [focus, setFocus] = useState("all");

  const reach = rows.reduce((n, r) => n + r.reach, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const onAir = rows.reduce((n, r) => n + r.seconds_on_screen, 0);
  const airings = rows.reduce((n, r) => n + r.airings, 0);
  // A changed period or device can drop the chosen item; fall back to all.
  const selected = rows.some((r) => r.key === focus) ? focus : "all";
  const focused = selected === "all" ? rows : rows.filter((r) => r.key === selected);
  const copy = COPY[kind];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label={`${copy.noun} lên sóng`}
          value={rows.filter((r) => r.airings > 0).length}
          sub={<span>{fmtInt(airings)} lượt phát</span>}
        />
        <KpiTile label="Thời lượng phát" value={onAir} format={fmtDuration} />
        <KpiTile label="Tiếp cận" value={reach} definition={DEFINITIONS.reach} />
        <KpiTile
          label="Tỉ lệ chú ý"
          value={(ratio(impressions, reach) ?? 0) * 100}
          format={(n) => `${n.toFixed(1)}%`}
          sub={<span>{fmtInt(impressions)} xem thực</span>}
          definition={DEFINITIONS.attention}
          tone="accent"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title={`Xếp hạng ${copy.noun.toLowerCase()} theo lượt xem thực`}
          hint="Cả thanh là tiếp cận; phần xanh là người thực sự xem."
        >
          <RankingChart rows={rows} />
        </Panel>
        <Panel
          className="xl:col-span-2"
          title="Phễu khán giả"
          action={
            <FieldSelect
              value={selected}
              onChange={setFocus}
              options={[{ value: "all", label: `Tất cả ${copy.noun.toLowerCase()}` }, ...rows.map((r) => ({ value: r.key, label: r.name }))]}
              className="w-48"
              ariaLabel={`Chọn ${copy.noun.toLowerCase()}`}
            />
          }
        >
          <AudienceFunnel stages={funnelStages(focused, breakdown.min_attention_seconds, breakdown.engaged_seconds)} />
        </Panel>
      </div>

      <Panel
        title={copy.title}
        hint={`“Xem/giờ phát” = lượt xem thực trên mỗi giờ lên sóng, so sánh công bằng nội dung ngắn và dài. “Chú ý sâu” = nhìn ≥ ${breakdown.engaged_seconds}s. Tỉ lệ trên dưới ${MIN_SAMPLE} người được đánh dấu mẫu nhỏ.`}
      >
        <Table
          data={rows}
          columns={columns}
          getRowId={(r) => r.key}
          defaultSort={{ key: "impressions", direction: "desc" }}
          rowHeight={56}
          height={Math.min(560, 52 + Math.max(rows.length, 2) * 56)}
          emptyState={<Empty>{copy.empty}</Empty>}
          className="rounded-xl border border-slate-200/80 text-xs"
        />
      </Panel>

      {kind === "playlists" && breakdown.locations.length > 0 && (
        <Panel title="Theo khu vực" hint="Màn hình gom theo vị trí lắp đặt.">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {breakdown.locations.map((l) => (
              <li key={l.key} className="rounded-xl border border-slate-200/80 p-3 text-xs">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-slate-800">{l.name}</span>
                  <span className="shrink-0 text-slate-400">{l.devices} màn hình</span>
                </div>
                <p className="mb-1.5 tabular-nums text-slate-500">
                  {fmtInt(l.reach)} tiếp cận · {fmtInt(l.impressions)} xem thực · chú ý {fmtPct(l.reach ? l.attention_rate : null)}
                </p>
                <Meter value={l.reach ? l.attention_rate : null} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
