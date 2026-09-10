"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  API_BASE,
  AiringRow,
  CaptureState,
  SummaryReport,
  Thresholds,
  api,
} from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { Bars, Stat } from "@/components/Stat";
import { TrackingControlButton } from "@/components/TrackingControlButton";

function secs(value: number): string {
  if (value < 60) return `${value.toFixed(1)}s`;
  const m = Math.floor(value / 60);
  return `${m}m ${Math.round(value - m * 60)}s`;
}

function clock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("vi-VN");
}

export default function Dashboard() {
  const { stats, connected } = useLive();
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [timeline, setTimeline] = useState<AiringRow[]>([]);
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("0");
  const [smartTargeting, setSmartTargeting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const fetchAll = () => {
      Promise.all([
        api.summary(),
        api.timeline(25),
        api.captureState(),
      ])
        .then(([s, t, c]) => {
          if (!ignore) {
            setSummary(s);
            setTimeline(t);
            setCapture(c);
          }
        })
        .catch((err) => {
          if (!ignore) setError((err as Error).message);
        });
    };

    fetchAll();
    api.thresholds().then((th) => { if (!ignore) setThresholds(th); }).catch(() => undefined);
    api.getSmartTargeting().then((st) => { if (!ignore) setSmartTargeting(st.enabled); }).catch(() => undefined);
    const id = setInterval(fetchAll, 4000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, []);

  const isSmartTargeting = stats?.smart_targeting !== undefined ? stats.smart_targeting : smartTargeting;

  const handleToggleSmartTargeting = async () => {
    try {
      const nextVal = !isSmartTargeting;
      setSmartTargeting(nextVal);
      await api.setSmartTargeting(nextVal);
    } catch (e) {
      console.error("Lỗi đổi chế độ phát thông minh:", e);
    }
  };

  const running = stats?.running ?? capture?.running ?? false;
  const playing = stats?.now_playing?.playing ?? false;
  const nowPlaying = stats?.now_playing ?? null;
  const totals = summary?.totals;
  const progress =
    nowPlaying?.creative && nowPlaying.creative.duration > 0
      ? Math.min(100, (nowPlaying.elapsed / nowPlaying.creative.duration) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      {/* ---- status strip ---- */}
      <section className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500"}`}
            />
            <span className="font-medium text-slate-700">
              {connected ? "Kết nối trực tiếp" : "Mất kết nối — đang thăm dò"}
            </span>
          </span>
          <span className="text-slate-500">
            Phân tích:{" "}
            <span className={running ? "font-semibold text-emerald-700" : "font-medium text-slate-800"}>
              {running
                ? `Đang chạy · ${stats?.mode === "browser" ? "camera màn hình" : `nguồn ${capture?.source}`}`
                : "Đã dừng"}
            </span>
          </span>
          <span className="text-slate-500">
            Chiếu:{" "}
            <span className={playing ? "font-semibold text-emerald-700" : "font-medium text-slate-800"}>
              {playing ? nowPlaying?.creative?.name ?? "đang phát" : "chưa phát"}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <TrackingControlButton source={selectedSource} />
          <Link
            href="/admin"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Thiết bị
          </Link>
          <a
            href={`${API_BASE}/api/analytics/export.csv`}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Xuất CSV
          </a>
        </div>
      </section>

      {(error || stats?.error) && (
        <div className="card border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {error ?? stats?.error}
        </div>
      )}

      {/* ---- live counters ---- */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <Stat
          label="Đang có mặt"
          value={stats?.people_now ?? 0}
          hint="Khuôn mặt đang được theo vết ở khung hình này"
        />
        <Stat
          label="Đang nhìn màn hình"
          value={stats?.attentive_now ?? 0}
          tone="accent"
          hint="Góc đầu nằm trong ngưỡng chú ý"
        />
        <Stat
          label="Người khác nhau (phiên)"
          value={stats?.unique_viewers_session ?? 0}
          hint="Số track_id kể từ khi bật camera"
        />
        <Stat
          label="Tốc độ xử lý"
          value={stats?.fps?.toFixed(1) ?? "0.0"}
          unit="FPS"
          hint={running ? `Nguồn: ${stats?.source ?? capture?.source}` : "Camera đang tắt"}
        />
      </section>

      {/* ---- cumulative counters ---- */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <Stat
          label="Người đi qua (reach)"
          value={totals?.reach ?? 0}
          hint={`Có mặt >= ${thresholds?.min_presence_seconds ?? 0.5}s khi quảng cáo đang chiếu`}
        />
        <Stat
          label="Lượt xem thực (impression)"
          value={totals?.impressions ?? 0}
          tone="accent"
          hint={`Nhìn màn hình >= ${thresholds?.min_attention_seconds ?? 1}s`}
        />
        <Stat
          label="Tỷ lệ chú ý"
          value={`${Math.round((totals?.attention_rate ?? 0) * 100)}%`}
          tone="warn"
          hint="Lượt xem thực / người đi qua"
        />
        <Stat
          label="Tổng thời gian chú ý"
          value={secs(totals?.total_attention_seconds ?? 0)}
          hint={`Trung bình ${totals?.avg_attention_seconds ?? 0}s mỗi lượt`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---- camera ---- */}
        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5 bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <h2 className="text-sm font-semibold text-slate-900 shrink-0">Camera khán giả</h2>
              <select
                value={selectedSource}
                onChange={async (e) => {
                  const nextSrc = e.target.value;
                  setSelectedSource(nextSrc);
                  if (running) {
                    await api.captureStart(nextSrc);
                  }
                }}
                className="max-w-[240px] sm:max-w-xs truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                title="Chọn nguồn camera máy tính hoặc video mẫu TTTM"
              >
                <option value="0">Webcam máy tính (Index 0)</option>
                <option value="data/store-aisle-detection.mp4">
                  Video TTTM 1: Lối đi siêu thị / Cửa hàng
                </option>
                <option value="data/face-demographics-walking-and-pause.mp4">
                  Video TTTM 2: Đi bộ & Dừng lại nhìn
                </option>
                <option value="data/face-demographics-walking.mp4">
                  Video TTTM 3: Khách đi lại trong sảnh
                </option>
              </select>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              khung #{stats?.frame_index ?? 0}
            </span>
          </div>
          <div className="flex aspect-video items-center justify-center bg-slate-950">
            {running ? (
              <img
                src={`${API_BASE}/api/capture/stream.mjpg`}
                alt="Luồng camera kèm nhãn nhận diện"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center text-xs text-slate-400">
                <p>
                  Camera đang dừng. Chọn nguồn phát ở trên (Webcam hoặc Video TTTM) rồi bấm bắt đầu tracking.
                </p>
                <TrackingControlButton source={selectedSource} />
              </div>
            )}
          </div>
          <div className="max-h-56 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[500px] text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Track</th>
                  <th className="px-3 py-2 text-left font-medium">Giới tính</th>
                  <th className="px-3 py-2 text-left font-medium">Tuổi</th>
                  <th className="px-3 py-2 text-right font-medium">Yaw / Pitch</th>
                  <th className="px-3 py-2 text-right font-medium">Chú ý</th>
                  <th className="px-3 py-2 text-right font-medium">Dwell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(stats?.tracks ?? []).map((t) => (
                  <tr key={t.track_id} className="hover:bg-slate-50/80 transition">
                    <td className="px-3 py-2 font-mono font-medium text-slate-700">#{t.track_id}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {t.gender === "M" ? "Nam" : t.gender === "F" ? "Nữ" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {t.age != null ? (
                        <span>
                          <strong className="text-slate-900">~{Math.round(t.age)}</strong>
                          <span className="text-xs text-slate-500 ml-1">({t.age_group})</span>
                        </span>
                      ) : (
                        t.age_group ?? "—"
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-mono text-slate-500">
                      {t.yaw ?? "—"}° / {t.pitch ?? "—"}°
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.attention ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Đang nhìn
                        </span>
                      ) : (
                        <span className="text-slate-400">không</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-mono text-slate-700">{t.dwell_time.toFixed(1)}s</td>
                  </tr>
                ))}
                {!stats?.tracks?.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                      Chưa phát hiện ai trong khung hình
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- now playing + demographics ---- */}
        <section className="space-y-4">
          {/* ---- AI Recommendation & Smart Targeting ---- */}
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-xs font-bold text-purple-700">AI</span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Gợi ý quảng cáo AI</h2>
                  <p className="text-[10px] text-[var(--muted)]">Theo nhân khẩu học khán giả</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSmartTargeting}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  isSmartTargeting
                    ? "border border-purple-300 bg-purple-50 text-purple-700 font-semibold shadow-xs"
                    : "border border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900"
                }`}
                title="Bật tính năng này để màn hình tự động ưu tiên phát quảng cáo phù hợp với độ tuổi/giới tính của khán giả đang nhìn"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isSmartTargeting ? "animate-pulse bg-purple-600" : "bg-slate-400"
                  }`}
                />
                {isSmartTargeting ? "Phát thích ứng: BẬT" : "Phát thích ứng: TẮT"}
              </button>
            </div>

            {stats?.recommendation ? (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-500">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {stats.recommendation.crowd_context && (
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 font-medium text-amber-800 text-[10px]">
                          {stats.recommendation.crowd_context === "single"
                            ? "1 Người"
                            : stats.recommendation.crowd_context === "group"
                            ? `Nhóm ${stats.recommendation.people_count || 2}`
                            : `Đám đông ${stats.recommendation.people_count || 5}`}
                        </span>
                      )}
                      {stats.recommendation.scene_weather && (
                        <span className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 font-medium text-sky-700 text-[10px]">
                          {stats.recommendation.scene_weather === "sunny"
                            ? "Trời nắng"
                            : stats.recommendation.scene_weather === "rainy"
                            ? "Trời mưa"
                            : "Nhiều mây"}
                        </span>
                      )}
                      <span>Khán giả quan sát:</span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {stats.recommendation.viewer_gender === "M"
                        ? "Nam"
                        : stats.recommendation.viewer_gender === "F"
                        ? "Nữ"
                        : "Khán giả"}
                      {stats.recommendation.viewer_approx_age != null &&
                        ` · ~${Math.round(stats.recommendation.viewer_approx_age)} tuổi`}
                      {stats.recommendation.viewer_age_group &&
                        ` (${stats.recommendation.viewer_age_group})`}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 truncate">
                      {stats.recommendation.target_creative_name}
                    </span>
                    <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 shrink-0">
                      {stats.recommendation.category}
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Độ tương thích mục tiêu</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {stats.recommendation.match_score}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-300"
                        style={{ width: `${stats.recommendation.match_score}%` }}
                      />
                    </div>
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-600">
                  {stats.recommendation.reason}
                </p>
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-slate-500">
                <p>Chưa phát hiện khán giả đứng trước camera.</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Hệ thống sẽ tự động phân tích độ tuổi và giới tính để gợi ý quảng cáo phù hợp nhất.
                </p>
              </div>
            )}
          </div>

          <div className="card px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Đang chiếu</h2>
            {nowPlaying?.creative ? (
              <>
                <p className="mt-2 truncate text-sm font-bold text-slate-900">{nowPlaying.creative.name}</p>
                <p className="text-[11px] text-[var(--muted)]">
                  {nowPlaying.creative.kind === "video" ? "Video" : "Ảnh"} ·{" "}
                  {nowPlaying.creative.duration}s · airing #{nowPlaying.airing_id}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 border border-slate-200/50">
                  <div
                    className="h-full bg-emerald-600 transition-[width] duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="tabular mt-1 text-[11px] text-[var(--muted)]">
                  còn {nowPlaying.remaining.toFixed(0)}s
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Không có quảng cáo nào trên màn hình. Mọi người xuất hiện lúc này sẽ
                không được tính cho quảng cáo nào.
              </p>
            )}
          </div>

          <div className="card space-y-3 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Giới tính người xem</h2>
            <Bars
              data={Object.fromEntries(
                Object.entries(totals?.by_gender ?? {}).map(([k, v]) => [
                  k === "M" ? "Nam" : k === "F" ? "Nữ" : k,
                  v,
                ]),
              )}
            />
            <h2 className="pt-1 text-sm font-semibold text-slate-900">Nhóm tuổi</h2>
            <Bars data={totals?.by_age_group ?? {}} />
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              Hai biểu đồ này cần <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">models/mivolo_age_gender.onnx</code>. Khi thiếu
              file, hệ thống báo trống thay vì đoán bừa.
            </p>
          </div>
        </section>
      </div>

      {/* ---- per-creative report ---- */}
      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900">Hiệu quả từng quảng cáo</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Quảng cáo</th>
                <th className="px-3 py-2.5 text-right font-medium">Số lần chiếu</th>
                <th className="px-3 py-2.5 text-right font-medium">Thời lượng</th>
                <th className="px-3 py-2.5 text-right font-medium">Đi qua</th>
                <th className="px-3 py-2.5 text-right font-medium">Xem thực</th>
                <th className="px-3 py-2.5 text-right font-medium">Tỷ lệ chú ý</th>
                <th className="px-3 py-2.5 text-right font-medium">TB chú ý</th>
                <th className="px-3 py-2.5 text-right font-medium">Tổng chú ý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(summary?.creatives ?? []).map((c) => (
                <tr key={c.creative_id} className="hover:bg-slate-50/80 transition">
                  <td className="px-3 py-2.5 font-medium text-slate-900">
                    <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
                      {c.kind === "video" ? "VIDEO" : "IMAGE"}
                    </span>
                    {c.name}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-mono text-slate-700">{c.airings}</td>
                  <td className="tabular px-3 py-2.5 text-right font-mono text-slate-700">{secs(c.seconds_on_screen)}</td>
                  <td className="tabular px-3 py-2.5 text-right font-mono text-slate-700">{c.reach}</td>
                  <td className="tabular px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                    {c.impressions}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-mono text-slate-700">
                    {Math.round(c.attention_rate * 100)}%
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-mono text-slate-700">{c.avg_attention_seconds}s</td>
                  <td className="tabular px-3 py-2.5 text-right font-mono text-slate-700">
                    {secs(c.total_attention_seconds)}
                  </td>
                </tr>
              ))}
              {!summary?.creatives?.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    Chưa có quảng cáo nào. Vào “Thư viện quảng cáo” để tải lên.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- airing feed ---- */}
      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900">Nhật ký lượt chiếu gần nhất</h2>
        </div>
        <div className="max-h-72 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[500px] text-xs">
            <tbody className="divide-y divide-slate-100">
              {timeline.map((row) => (
                <tr key={row.airing_id} className="hover:bg-slate-50/80 transition">
                  <td className="tabular px-3 py-2 font-mono text-slate-500">
                    {clock(row.started_at)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                  <td className="tabular px-3 py-2 text-right font-mono text-slate-500">
                    {row.ended_at ? `${(row.ended_at - row.started_at).toFixed(0)}s` : "đang chiếu"}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-mono text-slate-700">{row.reach} đi qua</td>
                  <td className="tabular px-3 py-2 text-right font-mono font-bold text-emerald-700">
                    {row.impressions} xem
                  </td>
                  <td className="tabular px-3 py-2 text-right font-mono text-slate-700">
                    {secs(row.total_attention_seconds)}
                  </td>
                </tr>
              ))}
              {!timeline.length && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-400">
                    Chưa có lượt chiếu nào
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

