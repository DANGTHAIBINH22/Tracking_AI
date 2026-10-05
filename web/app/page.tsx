"use client";

import { useEffect, useMemo, useState } from "react";
import { DetectionModule } from "@/components/admin/report/DetectionModule";
import { LiveBanner } from "@/components/admin/report/LiveBanner";
import { Loader } from "@/components/admin/report/Loader";
import { OverviewModule } from "@/components/admin/report/OverviewModule";
import { PerformanceModule } from "@/components/admin/report/PerformanceModule";
import { ProofOfPlay } from "@/components/admin/report/ProofOfPlay";
import { useAdminReport } from "@/components/admin/report/useAdminReport";
import { FieldSelect } from "@/components/FieldSelect";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { API_BASE, ScreenPublic, api } from "@/lib/api";

type Module = "overview" | "detection" | "media" | "playlists";

const MODULES: { value: Module; label: string }[] = [
  { value: "overview", label: "Tổng quan" },
  { value: "detection", label: "Thiết bị & Tracking" },
  { value: "media", label: "Media" },
  { value: "playlists", label: "Playlist" },
];

/** Calendar days in the viewer's timezone; the API caps a report at 90. */
const PERIODS = [
  { value: "1", label: "Hôm nay" },
  { value: "7", label: "7 ngày" },
  { value: "30", label: "30 ngày" },
  { value: "90", label: "90 ngày" },
] as const;

const ALL_DEVICES = "__all";

/**
 * The report: who walked past each screen, who actually watched, and which
 * media and playlists held their attention. Read-only — pairing and revoking
 * screens lives on /admin, the one page that changes anything.
 */
export default function ReportDashboard() {
  const [module, setModule] = useState<Module>("overview");
  const [period, setPeriod] = useState<string>("7");
  const [device, setDevice] = useState<string>(ALL_DEVICES);
  const [screens, setScreens] = useState<ScreenPublic[]>([]);

  // The device filter lists every paired screen, not only those with data in
  // the period, so choosing one never makes the others vanish from the list.
  useEffect(() => {
    let ignore = false;
    api.listScreens().then(
      (list) => !ignore && setScreens(list),
      () => {},
    );
    return () => {
      ignore = true;
    };
  }, []);

  const days = Number(period);
  const deviceId = device === ALL_DEVICES ? undefined : device;
  const { data, loading, error, reload } = useAdminReport(days, deviceId);

  const deviceOptions = useMemo(
    () => [
      { value: ALL_DEVICES, label: "Tất cả màn hình" },
      ...screens.map((s) => ({ value: String(s.id), label: s.name || `Màn hình #${s.id}` })),
      { value: "host", label: "Camera máy chủ" },
    ],
    [screens],
  );

  const updated = data
    ? new Date(data.overview.generated_at * 1000).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : null;

  return (
    <main className="w-full space-y-5 px-4 py-6 sm:px-5 lg:pl-2 lg:pr-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Báo cáo DOOH</p>
          <h1 className="mt-0.5 text-xl font-bold text-slate-900 sm:text-2xl">Hiệu quả quảng cáo theo màn hình</h1>
          <p className="mt-1 text-xs text-slate-500">
            Ai đi qua, ai thực sự xem, và nội dung nào giữ được ánh nhìn — đo bằng camera, theo từng màn hình, media và playlist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            In PDF
          </button>
          <a
            href={`${API_BASE}/api/analytics/export.csv`}
            download
            className="rounded-xl bg-emerald-600 px-3.5 py-1.5 font-semibold text-white transition hover:bg-emerald-700"
          >
            Xuất CSV
          </a>
        </div>
      </header>

      <LiveBanner />

      <div className="print:hidden">
        <Tabs value={module} onValueChange={(v) => setModule(v as Module)} variant="underline">
          <TabsList wrapperClassName="border-b border-slate-200">
            {MODULES.map((m) => (
              <TabsTrigger key={m.value} value={m.value}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Tabs value={period} onValueChange={setPeriod} variant="segment">
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value} className="text-xs">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <FieldSelect value={device} onChange={setDevice} options={deviceOptions} className="w-56" triggerClassName="bg-white" ariaLabel="Lọc theo màn hình" />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          {loading && data && <Loader size="sm" />}
          {updated && <span>Cập nhật {updated} · tự làm mới mỗi phút</span>}
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Làm mới
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">{error}</p>}

      {!data && !error && (
        <div className="flex h-72 items-center justify-center">
          <Loader label="Đang tổng hợp báo cáo…" />
        </div>
      )}

      {data && module === "overview" && <OverviewModule data={data} />}
      {data && module === "detection" && <DetectionModule data={data} />}
      {data && module === "media" && <PerformanceModule key="media" data={data} kind="media" />}
      {data && module === "playlists" && <PerformanceModule key="playlists" data={data} kind="playlists" />}

      {module === "overview" && <ProofOfPlay />}
    </main>
  );
}
