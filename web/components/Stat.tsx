export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: "default" | "accent" | "warn" | "danger" | "purple" | "blue";
}) {
  const colour =
    tone === "accent"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-rose-600"
          : tone === "purple"
            ? "text-purple-700"
            : tone === "blue"
              ? "text-blue-700"
              : "text-slate-900";
  return (
    <div className="card min-w-0 px-3.5 py-3 sm:px-4 sm:py-3.5 transition hover:shadow-md">
      <div className="truncate text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className={`tabular mt-1 truncate text-xl font-bold tracking-tight sm:text-2xl ${colour}`}>
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-[var(--muted)] sm:text-sm">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-0.5 line-clamp-2 text-[10px] sm:text-[11px] text-[var(--muted)] leading-tight">{hint}</div> : null}
    </div>
  );
}

export function KpiCard({
  title,
  value,
  unit,
  subtext,
  badge,
  badgeTone = "default",
  trend,
  icon,
}: {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  badge?: string;
  badgeTone?: "emerald" | "amber" | "indigo" | "purple" | "slate" | "default";
  trend?: string;
  icon?: React.ReactNode;
}) {
  const badgeStyles = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    default: "bg-slate-100 text-slate-700 border-slate-200",
  }[badgeTone];

  return (
    <div className="card p-4 transition-all hover:shadow-md border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        {icon ? <div className="text-slate-400">{icon}</div> : null}
        {badge ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeStyles}`}>
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="tabular text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{value}</span>
        {unit ? <span className="text-xs font-semibold text-slate-500">{unit}</span> : null}
      </div>
      {(subtext || trend) && (
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
          {subtext && <span className="truncate">{subtext}</span>}
          {trend && <span className="font-semibold text-emerald-600 shrink-0 ml-1">{trend}</span>}
        </div>
      )}
    </div>
  );
}

export function Bars({
  data,
  barColor = "bg-emerald-600",
}: {
  data: Record<string, number>;
  barColor?: string;
}) {
  const entries = Object.entries(data);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (!total) {
    return <div className="py-2 text-xs text-[var(--muted)]">Chưa có dữ liệu ghi nhận</div>;
  }
  return (
    <div className="space-y-2.5">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([key, n]) => {
          const pct = Math.round((n / total) * 100);
          return (
            <div key={key} className="space-y-1 text-xs">
              <div className="flex items-center justify-between font-medium text-slate-700">
                <span className="truncate font-semibold">{key}</span>
                <span className="tabular text-slate-500 text-[11px]">
                  {n.toLocaleString()} lượt ({pct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
}

export function FunnelBar({
  steps,
}: {
  steps: {
    label: string;
    sublabel: string;
    count: number;
    percent: number;
    color: string;
  }[];
}) {
  return (
    <div className="space-y-3">
      {steps.map((step, idx) => (
        <div key={idx} className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-700">
                {idx + 1}
              </span>
              <span className="font-semibold text-slate-900">{step.label}</span>
              <span className="hidden sm:inline text-[11px] text-slate-400">({step.sublabel})</span>
            </div>
            <div className="flex items-center gap-2 text-right">
              <span className="tabular font-bold text-slate-800">{step.count.toLocaleString()}</span>
              <span className="tabular font-semibold text-slate-500 text-[11px] w-12 text-right">
                {step.percent}%
              </span>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-md bg-slate-100 border border-slate-200/50">
            <div
              className={`h-full rounded-md transition-all duration-700 ${step.color}`}
              style={{ width: `${Math.max(2, Math.min(100, step.percent))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
