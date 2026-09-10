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
  tone?: "default" | "accent" | "warn";
}) {
  const colour =
    tone === "accent"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
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

export function Bars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (!total) {
    return <div className="py-2 text-xs text-[var(--muted)]">Chưa có dữ liệu</div>;
  }
  return (
    <div className="space-y-2">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([key, n]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 truncate font-medium text-slate-600">{key}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 border border-slate-200/50">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${(n / total) * 100}%` }}
              />
            </div>
            <span className="tabular w-10 text-right font-semibold text-slate-700">{n}</span>
          </div>
        ))}
    </div>
  );
}
