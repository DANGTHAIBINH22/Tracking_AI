"use client";

import { useEffect, useState } from "react";
import { Table, type TableColumn } from "@/components/motion/table";
import { api, type AiringRow } from "@/lib/api";
import { Empty, Panel, fmtDuration, fmtInt } from "./shared";

const columns: TableColumn<AiringRow>[] = [
  {
    key: "started_at",
    header: "Thời gian",
    width: "150px",
    sortable: true,
    cell: (r) => (
      <span className="font-mono tabular-nums text-slate-500">
        {new Date(r.started_at * 1000).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit" })}
      </span>
    ),
  },
  {
    key: "name",
    header: "Nội dung",
    sortable: true,
    cell: (r) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
          {r.kind === "video" ? "VIDEO" : "ẢNH"}
        </span>
        <span className="truncate font-medium text-slate-900" title={r.name}>
          {r.name}
        </span>
      </span>
    ),
  },
  {
    key: "duration",
    header: "Thời lượng",
    align: "right",
    width: "120px",
    sortable: true,
    sortValue: (r) => (r.ended_at ? r.ended_at - r.started_at : Number.MAX_SAFE_INTEGER),
    cell: (r) => (r.ended_at ? fmtDuration(r.ended_at - r.started_at) : <span className="text-emerald-700">đang chiếu…</span>),
  },
  { key: "reach", header: "Tiếp cận", align: "right", width: "110px", sortable: true, cell: (r) => fmtInt(r.reach) },
  {
    key: "impressions",
    header: "Xem thực",
    align: "right",
    width: "110px",
    sortable: true,
    cell: (r) => <span className="font-semibold text-emerald-700">{fmtInt(r.impressions)}</span>,
  },
  {
    key: "total_attention_seconds",
    header: "Tổng chú ý",
    align: "right",
    width: "120px",
    sortable: true,
    cell: (r) => fmtDuration(r.total_attention_seconds),
  },
];

/**
 * Every recent airing with the audience measured against it — the audit trail
 * an advertiser asks for. Not filtered by the report's period or device: it is
 * "what just went on air", newest first.
 */
export function ProofOfPlay({ limit = 30 }: { limit?: number }) {
  const [rows, setRows] = useState<AiringRow[] | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = () => api.timeline(limit).then((r) => !ignore && setRows(r), () => {});
    const first = setTimeout(load, 0);
    const every = setInterval(load, 15_000);
    return () => {
      ignore = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [limit]);

  return (
    <Panel
      title="Nhật ký lượt chiếu gần nhất (proof-of-play)"
      hint="Từng lần phát sóng kèm khán giả đo được trong đúng lần phát đó. Không lọc theo kỳ báo cáo."
      action={<span className="text-[11px] text-slate-400">{rows ? `${rows.length} lượt gần nhất` : ""}</span>}
    >
      <Table
        data={rows ?? []}
        columns={columns}
        getRowId={(r) => String(r.airing_id)}
        defaultSort={{ key: "started_at", direction: "desc" }}
        rowHeight={44}
        loading={rows === null}
        height={Math.min(400, 48 + Math.max(rows?.length ?? 3, 3) * 44)}
        emptyState={<Empty>Chưa có lượt chiếu nào được ghi nhận.</Empty>}
        className="rounded-xl border border-slate-200/80 text-xs"
      />
    </Panel>
  );
}
