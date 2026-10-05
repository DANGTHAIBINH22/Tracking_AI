"use client";

import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Tooltip } from "@/components/motion/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Formatting. One place, so "1,2 nghìn" and "45%" read the same on every card.
// ---------------------------------------------------------------------------

export const fmtInt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export const fmtPct = (ratio: number | null | undefined, digits = 1) =>
  ratio === null || ratio === undefined || !Number.isFinite(ratio) ? "—" : `${(ratio * 100).toFixed(digits)}%`;

/** 45s · 12 phút · 3,5 giờ — the unit that keeps the number short. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} phút`;
  return `${(seconds / 3600).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ`;
}

export const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

export function Panel({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-40 items-center justify-center px-6 text-center text-xs text-slate-400", className)}>
      {children}
    </div>
  );
}

/**
 * One headline number. `previous` adds the change against the period before;
 * `definition` is the tooltip that says exactly what was counted, because
 * "reach" and "impressions" are easy to read as the same thing.
 */
export function KpiTile({
  label,
  value,
  format = fmtInt,
  previous,
  sub,
  definition,
  tone = "default",
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  previous?: number;
  sub?: ReactNode;
  definition?: string;
  tone?: "default" | "accent";
}) {
  const delta = previous !== undefined && previous > 0 ? (value - previous) / previous : null;
  const body = (
    <div
      className={cn(
        "h-full rounded-2xl border p-4 shadow-xs",
        tone === "accent" ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200/80 bg-white",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold leading-none text-slate-900">
        <AnimatedNumber value={value} format={format} startOnView={false} duration={0.9} />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        {delta !== null && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-1.5 py-px font-semibold tabular-nums",
              delta > 0.005 ? "bg-emerald-100 text-emerald-700" : delta < -0.005 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600",
            )}
          >
            {delta > 0.005 ? "▲" : delta < -0.005 ? "▼" : "■"} {Math.abs(delta * 100).toFixed(0)}%
          </span>
        )}
        {previous !== undefined && previous === 0 && value > 0 && (
          <span className="rounded-full bg-slate-100 px-1.5 py-px font-semibold text-slate-600">mới</span>
        )}
        {sub}
      </div>
    </div>
  );
  return definition ? (
    <Tooltip content={<span className="block max-w-64 whitespace-normal text-xs leading-relaxed">{definition}</span>} wrapperClassName="block h-full">
      <div tabIndex={0} className="h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40">
        {body}
      </div>
    </Tooltip>
  ) : (
    body
  );
}

/** A thin horizontal meter for a 0..1 share inside a table cell. */
export function Meter({ value, label }: { value: number | null; label?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="flex w-full items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${v * 100}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-slate-700">{label ?? fmtPct(value)}</span>
    </div>
  );
}

/**
 * The number the whole report optimises for, said once per module: share of
 * people who walked past and actually watched. Reach and impressions are kept
 * as two columns everywhere; this is only their ratio.
 */
export const DEFINITIONS = {
  reach: "Tiếp cận (reach): số người có mặt trước màn hình trong lúc quảng cáo đang phát — đo lưu lượng, chưa chắc đã nhìn.",
  impressions: (s: number) =>
    `Lượt xem thực (impression): người nhìn vào màn hình ít nhất ${s}s trong lúc quảng cáo phát.`,
  attention: "Tỉ lệ chú ý = lượt xem thực ÷ tiếp cận. Đây là chỉ số hiệu quả: quảng cáo nào giữ được ánh nhìn.",
  attentionTime: "Tổng số giây khán giả thực sự nhìn vào màn hình, cộng trên mọi người.",
  detected: "Số người (track) mà camera phát hiện và theo dõi được trong các phiên tracking.",
} as const;
