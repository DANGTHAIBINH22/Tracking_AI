import { useCallback, useMemo, useState } from "react";
import type { SortState, TableColumn, TableRow } from "./types";
import { readSortValue } from "./utils";

export function useColumnSort<T>({
  rows,
  columns,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
}: {
  rows: TableRow<T>[];
  columns: TableColumn<T>[];
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
}) {
  const [internalSort, setInternalSort] = useState<SortState | null>(
    defaultSort,
  );
  const sort = sortProp !== undefined ? sortProp : internalSort;

  const commit = useCallback(
    (next: SortState | null) => {
      if (sortProp === undefined) setInternalSort(next);
      onSortChange?.(next);
    },
    [sortProp, onSortChange],
  );

  const toggleSort = useCallback(
    (key: string) => {
      if (!sort || sort.key !== key) {
        commit({ key, direction: "asc" });
      } else if (sort.direction === "asc") {
        commit({ key, direction: "desc" });
      } else {
        commit(null);
      }
    },
    [sort, commit],
  );

  const sortedRows = useMemo(
    () => sortRows(rows, columns, sort, (r) => r.row),
    [rows, sort, columns],
  );

  return { sort, sortedRows, toggleSort };
}

/**
 * Order `items` the way a header click would. Exported so a caller that pages
 * its data can sort the whole set before slicing, not just the visible page.
 */
export function sortRows<T, I>(
  items: I[],
  columns: TableColumn<T>[],
  sort: SortState | null,
  rowOf: (item: I) => T,
): I[] {
  if (!sort) return items;
  const column = columns.find((c) => c.key === sort.key);
  if (!column) return items;
  return [...items].sort((a, b) => {
    const av = readSortValue(rowOf(a), column);
    const bv = readSortValue(rowOf(b), column);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return sort.direction === "asc" ? cmp : -cmp;
  });
}
