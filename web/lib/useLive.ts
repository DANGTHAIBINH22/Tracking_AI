"use client";

import { useEffect, useRef, useState } from "react";
import { api, LiveStats, wsUrl } from "./api";

/**
 * Live audience snapshot over a websocket, with polling as the safety net.
 *
 * The socket is the fast path (the counter moves with the people in frame), but
 * a kiosk on flaky wifi must not freeze on a stale number, so a dropped socket
 * reconnects on a backoff and a poll keeps the page truthful in the meantime.
 */
export function useLive(pollMs = 2000) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(wsUrl("/ws/live"));
      socketRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          setStats(JSON.parse(event.data) as LiveStats);
        } catch {
          /* a truncated frame is not worth tearing the socket down for */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        // Backoff caps at 5s: a server restart should be picked up quickly, but
        // a server that is down for good must not be hammered.
        const delay = Math.min(5000, 500 * 2 ** retryRef.current++);
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    const poll = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      api.live().then(setStats).catch(() => undefined);
    }, pollMs);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      socketRef.current?.close();
    };
  }, [pollMs]);

  return { stats, connected };
}
