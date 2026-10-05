"use client";

import { cn } from "@/lib/utils";
import type { TableColumn } from "./types";
import { alignText } from "./utils";

export function SkeletonRows<T>({
  count,
  columns,
  selectable,
  rowHeight,
  filler = true,
}: {
  count: number;
  columns: TableColumn<T>[];
  selectable: boolean;
  rowHeight: number;
  /** Render the trailing spacer cell, matching the table's filler col. */
  filler?: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <tr key={r} style={{ height: rowHeight }} className="border-border/60 border-b">
          {selectable ? <td /> : null}
          {columns.map((column) => (
            <td key={column.key} className={cn("px-4", alignText(column.align))}>
              <div
                className={cn(
                  "h-3 animate-pulse rounded-full bg-surface-2",
                  column.align === "right" ? "ml-auto w-10" : "w-2/3",
                )}
              />
            </td>
          ))}
          {filler ? <td aria-hidden /> : null}
        </tr>
      ))}
    </>
  );
}
