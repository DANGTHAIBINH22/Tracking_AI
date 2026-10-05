"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import type { Option } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

/** The beUI select, sized for forms and toolbars, fed from a taxonomy list. */
export function FieldSelect({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
  triggerClassName,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  label?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && <p className="mb-1 px-0.5 text-[11px] font-semibold text-slate-600">{label}</p>}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn("h-9 text-xs font-medium", triggerClassName)}>
          <SelectValue placeholder={ariaLabel ?? label} />
        </SelectTrigger>
        <SelectContent className="max-h-72 overflow-y-auto">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
