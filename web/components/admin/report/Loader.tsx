"use client";

import { Loader as BeLoader } from "@/components/motion/loader";

/** The beUI loader in the report's colours, with its label visible beside it. */
export function Loader({ label, size = "md" }: { label?: string; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-500">
      <BeLoader variant={size === "sm" ? "dots" : "spinner"} size={size === "sm" ? 14 : 18} label={label ?? "Đang tải"} className="text-emerald-600" />
      {label && <span>{label}</span>}
    </span>
  );
}
