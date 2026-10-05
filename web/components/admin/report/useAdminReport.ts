"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Breakdown, type Detection, type Overview } from "@/lib/api";

export type ReportData = {
  overview: Overview;
  breakdown: Breakdown;
  detection: Detection;
};

/**
 * Hours from local midnight `days - 1` days ago until now: the same calendar
 * window /overview and /detection use, expressed as the rolling `window_hours`
 * /breakdown takes, so all three modules count the same stretch of time.
 */
function calendarWindowHours(days: number): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return Math.max(1 / 60, (Date.now() - start.getTime()) / 3_600_000);
}

/** Every number the admin report shows, for one period and (optionally) one device. */
export function useAdminReport(days: number, deviceId: string | undefined) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A slow answer for last week must not overwrite the one for today that the
  // operator switched to after it.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const [overview, breakdown, detection] = await Promise.all([
        api.overview(days, deviceId),
        api.breakdown(calendarWindowHours(days), deviceId),
        api.detection(days, deviceId),
      ]);
      if (mine !== seq.current) return;
      setData({ overview, breakdown, detection });
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError((err as Error).message || "Không tải được báo cáo.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [days, deviceId]);

  // Fetch now and every minute; a filter change makes a new `load`, which
  // restarts both. Scheduled rather than called inline: the loader sets state.
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const every = setInterval(() => void load(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [load]);

  return { data, loading, error, reload: load };
}
