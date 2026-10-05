"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `load` once after mount and then every `intervalMs` (when given), while
 * `enabled`. `load` is the same function a page's "Làm mới" button calls, so a
 * page keeps one loader instead of a second copy inside an effect.
 *
 * The first run is scheduled, not called inline: a loader sets state, and
 * setState called synchronously in an effect body renders the page twice
 * before it paints (react-hooks/set-state-in-effect). A timer callback is the
 * same "subscribe to an external source" shape as the interval that follows.
 */
export function useRefresh(load: () => unknown, intervalMs?: number, enabled = true): void {
  // Read the latest loader at call time, so a loader that closes over props
  // does not restart the timers every render.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const run = () => void loadRef.current();
    const first = setTimeout(run, 0);
    const every = intervalMs ? setInterval(run, intervalMs) : null;
    return () => {
      clearTimeout(first);
      if (every) clearInterval(every);
    };
  }, [enabled, intervalMs]);
}
