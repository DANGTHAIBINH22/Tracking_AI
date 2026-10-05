"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { api, type CaptureState } from "@/lib/api";
import { useLive } from "@/lib/useLive";

/** What the system is doing right now: server link, camera pipeline, the advert on air. */
export function LiveBanner() {
  const { stats, connected } = useLive();
  const [capture, setCapture] = useState<CaptureState | null>(null);

  // The websocket carries the live numbers; capture state is only the fallback
  // for "running" before the first frame arrives, so a slow poll is enough.
  useEffect(() => {
    let ignore = false;
    const load = () => api.captureState().then((c) => !ignore && setCapture(c), () => {});
    const first = setTimeout(load, 0);
    const every = setInterval(load, 15_000);
    return () => {
      ignore = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  const running = stats?.running ?? capture?.running ?? false;
  const fps = stats?.fps ?? capture?.fps ?? 0;
  const onAir = stats?.now_playing?.playing ? stats.now_playing.creative?.name : null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs shadow-xs print:hidden">
      <div className="flex flex-wrap items-center gap-2.5">
        <AnimatedBadge size="sm" status={connected ? "success" : "danger"} pulse={connected} contentKey={String(connected)}>
          {connected ? "Máy chủ AI: hoạt động" : "Mất kết nối máy chủ"}
        </AnimatedBadge>
        <AnimatedBadge size="sm" status={running ? "success" : "neutral"} contentKey={String(running)}>
          {running ? `Camera đang chạy · ${Number(fps).toFixed(1)} FPS` : "Camera đã dừng"}
        </AnimatedBadge>
        <span className="text-slate-500">
          Đang chiếu: <strong className="font-semibold text-slate-800">{onAir ?? "Chưa chiếu nội dung"}</strong>
        </span>
      </div>
      <Link href="/admin/devices/host" className="font-semibold text-emerald-700 transition hover:text-emerald-900">
        Giám sát camera & tracking →
      </Link>
    </section>
  );
}
