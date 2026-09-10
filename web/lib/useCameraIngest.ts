"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { wsUrl } from "./api";

/**
 * Publish this browser's camera to the analytics engine.
 *
 * The screen holds the camera; the server holds the pipeline. We grab frames
 * with getUserMedia, draw them to an off-screen canvas, and push JPEGs down
 * /ws/ingest. The server decodes them into the same single-threaded pipeline a
 * host webcam would feed, so nothing downstream can tell the difference.
 *
 * The caller renders `videoRef` — it must stay in the document (a detached or
 * `display:none` element gets throttled or stops painting in some browsers, and
 * we would sample frozen frames), so hide it with size and opacity instead. See
 * the player page for how.
 *
 * Only one screen may publish at a time; a second one is told so rather than
 * silently mixing two rooms into one set of track ids.
 */

export type IngestPhase =
  | "idle"        // switched off by the caller
  | "requesting"  // waiting on the camera permission prompt
  | "connecting"  // have the camera, opening the socket
  | "live"        // frames flowing and the engine is consuming them
  | "standby"     // connected, but the operator has stopped the engine
  | "denied"      // the user refused the camera, or there isn't one
  | "insecure"    // no getUserMedia: page is not https and not localhost
  | "rejected"    // another screen already owns the stream
  | "error";

export type IngestState = {
  phase: IngestPhase;
  detail: string | null;
  /** Frames per second this page is actually managing to upload. */
  fps: number;
  sent: number;
};

const IDLE_HEARTBEAT_MS = 1000;   // while the engine is stopped, just stay in touch
const RETRY_REJECTED_MS = 10000;  // the other screen may go away; check back
const MAX_BUFFERED_BYTES = 1_000_000;

export function useCameraIngest(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<IngestState>({
    phase: "idle",
    detail: null,
    fps: 0,
    sent: 0,
  });

  // Everything the send loop touches lives in refs: re-rendering on every frame
  // would be 12 React renders a second for numbers nobody reads that fast.
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sentRef = useRef(0);
  const fpsRef = useRef(0);
  const lastSentAtRef = useRef(0);

  const phaseRef = useRef<IngestPhase>("idle");
  const patch = useCallback((next: Partial<IngestState>) => {
    if (next.phase) phaseRef.current = next.phase;
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      phaseRef.current = "idle";
      // Reset the state, not just the ref: without this the panel keeps
      // reporting "đang gửi · 11 fps" after the camera has been switched off.
      setState({ phase: "idle", detail: null, fps: 0, sent: 0 });
      return;
    }

    const videoEl = videoRef.current;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let statsTimer: ReturnType<typeof setInterval> | null = null;
    let retries = 0;
    let capturing = true;
    let targetFps = 12;
    let maxWidth = 960;
    let quality = 0.7;

    const later = (fn: () => void, ms: number) => {
      if (!disposed) timer = setTimeout(fn, ms);
    };

    /** One frame: video -> canvas (downscaled) -> JPEG -> socket. */
    const grabAndSend = async () => {
      const video = videoRef.current;
      const ws = socketRef.current;
      if (disposed || !video || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (!video.videoWidth || !video.videoHeight) return;

      // Skip rather than queue when the link is congested. A stale frame helps
      // nobody: the engine only ever looks at the newest one it has.
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return;

      const scale = Math.min(1, maxWidth / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);

      const canvas = (canvasRef.current ??= document.createElement("canvas"));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob || disposed || ws.readyState !== WebSocket.OPEN) return;
      ws.send(blob);

      sentRef.current += 1;
      const now = performance.now();
      const gap = now - lastSentAtRef.current;
      lastSentAtRef.current = now;
      if (gap > 0 && gap < 5000) {
        const inst = 1000 / gap;
        fpsRef.current = fpsRef.current ? fpsRef.current * 0.8 + inst * 0.2 : inst;
      }
    };

    let worker: Worker | null = null;
    try {
      const blob = new Blob([
        `let timer = null;
         self.onmessage = function(e) {
           if (e.data.cmd === 'start') {
             if (timer) clearInterval(timer);
             timer = setInterval(function() { self.postMessage('tick'); }, e.data.interval);
           } else if (e.data.cmd === 'stop') {
             if (timer) clearInterval(timer);
             timer = null;
           }
         };`
      ], { type: "application/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
      let inFlight = false;
      worker.onmessage = () => {
        if (disposed || inFlight) return;
        inFlight = true;
        grabAndSend().finally(() => { inFlight = false; });
      };
    } catch {
      worker = null;
    }

    const pump = () => {
      const interval = capturing ? 1000 / targetFps : IDLE_HEARTBEAT_MS;
      if (worker) {
        worker.postMessage({ cmd: "start", interval });
      } else {
        grabAndSend().finally(() => later(pump, interval));
      }
    };

    const openSocket = () => {
      if (disposed) return;
      patch({ phase: "connecting", detail: null });
      const ws = new WebSocket(wsUrl("/ws/ingest"));
      ws.binaryType = "arraybuffer";
      socketRef.current = ws;

      ws.onmessage = (event) => {
        let msg: { type?: string; reason?: string; capture?: boolean } & Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.type === "accepted") {
          retries = 0;
          targetFps = Number(msg.target_fps) || targetFps;
          maxWidth = Number(msg.max_width) || maxWidth;
          quality = Number(msg.jpeg_quality) || quality;
          patch({ phase: "live", detail: null });
          pump();
        } else if (msg.type === "rejected") {
          // Do not fight over the stream — back off and let the incumbent run.
          patch({ phase: "rejected", detail: msg.reason ?? null });
        } else if (msg.type === "state") {
          const wasCapturing = capturing;
          capturing = Boolean(msg.capture);
          patch({
            phase: capturing ? "live" : "standby",
            detail: capturing ? null : "Máy chủ đang tắt phân tích — camera chờ sẵn.",
          });
          if (wasCapturing !== capturing) {
            pump();
          }
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        if (timer) clearTimeout(timer);
        const rejected = phaseRef.current === "rejected";
        const delay = rejected
          ? RETRY_REJECTED_MS
          : Math.min(5000, 500 * 2 ** retries++);
        later(openSocket, delay);
      };
      ws.onerror = () => ws.close();
    };

    const begin = async () => {
      // getUserMedia only exists in a secure context. Over plain http on a LAN
      // address the API is simply absent, which otherwise looks like a denied
      // permission — worth naming, because the fix is completely different.
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        patch({
          phase: "insecure",
          detail:
            "Trình duyệt chỉ cho phép mở camera trên localhost hoặc HTTPS. " +
            "Mở trang qua http://localhost:3000, hoặc đặt HTTPS cho máy chủ.",
        });
        return;
      }

      patch({ phase: "requesting", detail: null });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        openSocket();
      } catch (err) {
        const name = (err as DOMException)?.name;
        patch({
          phase: name === "NotAllowedError" ? "denied" : "error",
          detail:
            name === "NotAllowedError"
              ? "Người dùng đã từ chối quyền camera. Cấp lại quyền trong thanh địa chỉ rồi tải lại trang."
              : (err as Error).message,
        });
      }
    };

    begin();
    statsTimer = setInterval(
      () => patch({ fps: Math.round(fpsRef.current * 10) / 10, sent: sentRef.current }),
      1000,
    );

    return () => {
      disposed = true;
      if (worker) {
        worker.postMessage({ cmd: "stop" });
        worker.terminate();
      }
      if (timer) clearTimeout(timer);
      if (statsTimer) clearInterval(statsTimer);
      const ws = socketRef.current;
      socketRef.current = null;
      if (ws) {
        ws.onclose = null;   // a deliberate close must not schedule a reconnect
        ws.close();
      }
      // Releasing the tracks is what turns the camera light off. Skip it and the
      // camera stays claimed until the tab is closed.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
  }, [enabled, patch]);

  return { videoRef, state };
}
