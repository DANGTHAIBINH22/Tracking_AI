"use client";

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectInput,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/motion/multi-select";
import { ANY, joinTags, parseTags, type Option } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

/** One targeting dimension with several values allowed, stored as the comma
 *  list the backend reads ("13-18,18-35"). Nothing ticked = the "all" option.
 *
 *  `exclusive` values cannot be combined with others — "Không có thú cưng"
 *  next to "Dắt theo Chó" would be a target no viewer can meet — so picking one
 *  clears the rest, and picking anything else clears it. */
export function TargetMultiSelect({
  label,
  value,
  onChange,
  options,
  exclusive = [],
  disabled,
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  exclusive?: string[];
  disabled?: boolean;
  className?: string;
}) {
  const choices = options.filter((o) => o.value !== ANY);
  const anyLabel = options.find((o) => o.value === ANY)?.label ?? "Tất cả";
  const selected = parseTags(value);

  const change = (next: string[]) => {
    const added = next.find((v) => !selected.includes(v));
    let out = next;
    if (added && exclusive.includes(added)) out = [added];
    else if (added) out = next.filter((v) => !exclusive.includes(v));
    // Every option ticked is the same target as none: say "all".
    onChange(out.length === choices.length ? ANY : joinTags(out, choices));
  };

  return (
    <div className={cn("min-w-0", className)}>
      {label && <p className="mb-1 px-0.5 text-[11px] font-semibold text-slate-600">{label}</p>}
      <MultiSelect value={selected} onValueChange={change} disabled={disabled}>
        <MultiSelectTrigger className="min-h-9 min-w-0 text-xs">
          <MultiSelectValue placeholder={null} chipClassName="text-[11px]">
            {(_, l) => l.replace(/\s*\(.*\)$/, "")}
          </MultiSelectValue>
          {/* The input carries the "all" text: shown only while nothing is
              ticked, and it is what makes the field reachable by keyboard. */}
          <MultiSelectInput aria-label={label ?? anyLabel} placeholder={anyLabel} className="text-xs" />
        </MultiSelectTrigger>
        <MultiSelectContent>
          <MultiSelectList ariaLabel={label ?? anyLabel}>
            {choices.map((o) => (
              <MultiSelectItem key={o.value} value={o.value} textValue={o.label}>
                <span className="block truncate text-xs">{o.label}</span>
              </MultiSelectItem>
            ))}
            <MultiSelectEmpty>Không có lựa chọn khớp.</MultiSelectEmpty>
          </MultiSelectList>
        </MultiSelectContent>
      </MultiSelect>
    </div>
  );
}
