"use client";

import Link from "next/link";
import { AgeDistributionBarChart, GenderDonutChart } from "@/components/AnalyticsCharts";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Table, type TableColumn } from "@/components/motion/table";
import type { DetectionDevice } from "@/lib/api";
import { animalLabel } from "@/lib/taxonomy";
import { DetectionTrendChart } from "./charts";
import { Empty, KpiTile, Meter, Panel, fmtDuration, fmtInt, fmtPct } from "./shared";
import type { ReportData } from "./useAdminReport";

const columns: TableColumn<DetectionDevice>[] = [
  {
    key: "name",
    header: "Thiết bị",
    sortable: true,
    cell: (d) => (
      <div className="min-w-0">
        <Link
          href={`/admin/devices/${encodeURIComponent(d.device_id)}`}
          className="block truncate font-semibold text-slate-900 hover:text-emerald-700"
        >
          {d.name}
        </Link>
        <span className="block truncate text-[11px] text-slate-400">{d.location || "Chưa gán vị trí"}</span>
      </div>
    ),
  },
  {
    key: "online",
    header: "Trạng thái",
    width: "130px",
    sortValue: (d) => (d.online ? 1 : 0),
    sortable: true,
    cell: (d) => (
      <AnimatedBadge size="sm" status={d.online ? "success" : "neutral"} pulse={d.online}>
        {d.online ? "Online" : "Offline"}
      </AnimatedBadge>
    ),
  },
  { key: "sessions", header: "Phiên", align: "right", width: "96px", sortable: true },
  {
    key: "tracked_seconds",
    header: "Tracking",
    align: "right",
    width: "116px",
    sortable: true,
    cell: (d) => fmtDuration(d.tracked_seconds),
  },
  {
    key: "detected",
    header: "Phát hiện",
    align: "right",
    width: "124px",
    sortable: true,
    cell: (d) => <span className="font-semibold tabular-nums">{fmtInt(d.detected)}</span>,
  },
  {
    key: "attentive_rate",
    header: "Hướng nhìn",
    width: "160px",
    sortable: true,
    sortValue: (d) => d.attentive_rate ?? -1,
    cell: (d) => <Meter value={d.attentive_rate} />,
  },
  {
    key: "view_rate",
    header: "Xem thực",
    width: "160px",
    sortable: true,
    cell: (d) => <Meter value={d.detected ? d.view_rate : null} label={`${fmtInt(d.viewed)}`} />,
  },
  {
    key: "avg_dwell_seconds",
    header: "Dwell TB",
    align: "right",
    width: "116px",
    sortable: true,
    sortValue: (d) => d.avg_dwell_seconds ?? -1,
    cell: (d) => fmtDuration(d.avg_dwell_seconds),
  },
  {
    key: "peak_people",
    header: "Đỉnh",
    align: "right",
    width: "90px",
    sortable: true,
  },
  {
    key: "people_per_hour",
    header: "Người/giờ",
    align: "right",
    width: "124px",
    sortable: true,
    sortValue: (d) => d.people_per_hour ?? -1,
    cell: (d) => (d.people_per_hour === null ? "—" : d.people_per_hour.toLocaleString("vi-VN")),
  },
];

export function DetectionModule({ data }: { data: ReportData }) {
  const { detection } = data;
  const t = detection.totals;
  const pets = Object.entries(t.pet_types).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Người phát hiện"
          value={t.detected}
          sub={<span>{fmtInt(t.sessions)} phiên · {fmtDuration(t.tracked_seconds)} tracking</span>}
          definition="Mỗi track ByteTrack là một người. Một người rời khung hình rồi quay lại có thể được đếm hai lần."
        />
        <KpiTile
          label="Hướng về màn hình"
          value={t.attentive}
          sub={<span>{fmtPct(t.attentive_rate)} người phát hiện</span>}
          definition="Có ít nhất một khung hình mà góc đầu (yaw/pitch từ solvePnP) hướng vào màn hình."
        />
        <KpiTile
          label="Xem thực"
          value={t.viewed}
          sub={<span>{fmtPct(t.view_rate)} người phát hiện</span>}
          definition={`Thời gian nhìn (dwell) ≥ ${detection.min_attention_seconds}s.`}
          tone="accent"
        />
        <KpiTile
          label="Dwell trung bình"
          value={t.avg_dwell_seconds ?? 0}
          format={(n) => (t.avg_dwell_seconds === null ? "—" : `${n.toFixed(1)}s`)}
          sub={<span>có mặt TB {fmtDuration(t.avg_presence_seconds)}</span>}
          definition="Số giây trung bình một người thực sự nhìn vào màn hình, trên những người có dữ liệu theo track."
        />
      </div>

      {t.sessions_without_detail > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[11px] text-amber-800">
          {t.sessions_without_detail} phiên cũ ghi trước khi có sổ theo từng người: chỉ có số phát hiện và xem thực, không có
          hướng nhìn, dwell hay thú cưng — các tỉ lệ ở trên chỉ tính trên phiên có dữ liệu chi tiết.
        </p>
      )}

      <Panel
        title="Camera phát hiện được gì theo thời gian"
        hint="Ba con số lồng nhau: phát hiện ⊃ hướng về màn hình ⊃ xem thực. Theo giờ bắt đầu phiên tracking."
      >
        <DetectionTrendChart series={detection.series} bucketSeconds={detection.bucket_seconds} />
      </Panel>

      <Panel title="Hiệu suất từng thiết bị" hint="Bấm tên thiết bị để mở báo cáo chi tiết, lịch sử phiên và camera trực tiếp.">
        <Table
          data={detection.devices}
          columns={columns}
          getRowId={(d) => d.device_id}
          defaultSort={{ key: "detected", direction: "desc" }}
          rowHeight={56}
          height={Math.min(520, 52 + Math.max(detection.devices.length, 2) * 56)}
          emptyState={<Empty>Chưa có thiết bị nào chạy tracking trong kỳ này.</Empty>}
          className="rounded-xl border border-slate-200/80 text-xs"
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Giới tính" hint="Theo từng người được tracking.">
          <GenderDonutChart male={t.male} female={t.female} other={t.unknown_gender} />
        </Panel>
        <Panel title="Độ tuổi" hint="Nhóm tuổi ước lượng bởi MiVOLO; “unknown” không hiển thị.">
          <AgeDistributionBarChart data={t.ages} />
        </Panel>
        <Panel title="Thú cưng đi cùng" hint={`${fmtInt(t.pets)} người có động vật đi cùng.`}>
          {pets.length ? (
            <ul className="space-y-2.5 text-xs">
              {pets.map(([kind, n]) => (
                <li key={kind}>
                  <div className="mb-1 flex justify-between">
                    <span className="font-medium text-slate-700">{animalLabel(kind)}</span>
                    <span className="tabular-nums text-slate-500">{fmtInt(n)}</span>
                  </div>
                  <Meter value={t.pets ? n / t.pets : null} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Không phát hiện thú cưng nào.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
