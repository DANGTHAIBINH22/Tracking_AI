"use client";

import { useEffect, useRef, useState } from "react";
import { api, mediaUrl } from "@/lib/api";
import { useCameraIngest } from "@/lib/useCameraIngest";
import { useLive } from "@/lib/useLive";

export default function ScreenPage() {
  const { stats } = useLive();
  const [showHud, setShowHud] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Pairing state
  const [screenToken, setScreenToken] = useState<string | null>(null);
  const [screenInfo, setScreenInfo] = useState<{ name: string | null; location: string | null } | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Check saved token on mount (from localStorage and cookie)
  useEffect(() => {
    let savedToken = localStorage.getItem("signage_screen_token");
    if (!savedToken) {
      const match = document.cookie.match(/(?:^|;\s*)signage_screen_token=([^;]+)/);
      if (match) savedToken = decodeURIComponent(match[1]);
    }

    if (savedToken) {
      api
        .verifyScreenToken(savedToken)
        .then((res) => {
          if (res.valid) {
            setScreenToken(savedToken);
            setScreenInfo({ name: res.name || null, location: res.location || null });
          } else {
            localStorage.removeItem("signage_screen_token");
            document.cookie = "signage_screen_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            setScreenToken(null);
          }
        })
        .catch(() => {
          // Keep saved token if temporary network glitch
          setScreenToken(savedToken);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Request pairing code when not paired
  const requestNewCode = async () => {
    try {
      const res = await api.registerScreenCode();
      setPairingCode(res.pairing_code);
      setCodeExpiresAt(res.expires_at);
    } catch (err) {
      console.error("Lỗi lấy mã ghép nối:", err);
    }
  };

  useEffect(() => {
    if (!loading && !screenToken && !pairingCode) {
      requestNewCode();
    }
  }, [loading, screenToken, pairingCode]);

  // Countdown timer for pairing code
  useEffect(() => {
    if (!codeExpiresAt || screenToken) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round(codeExpiresAt - Date.now() / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        requestNewCode();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [codeExpiresAt, screenToken]);

  // Polling check if Admin has paired this code
  useEffect(() => {
    if (!pairingCode || screenToken) return;

    const poll = async () => {
      try {
        const res = await api.checkScreenStatus(pairingCode);
        if (res.status === "paired" && res.screen_token) {
          localStorage.setItem("signage_screen_token", res.screen_token);
          document.cookie = `signage_screen_token=${encodeURIComponent(res.screen_token)}; path=/; max-age=31536000; SameSite=Lax`;
          setScreenToken(res.screen_token);
          setScreenInfo({ name: res.name, location: res.location });
        } else if (res.status === "expired") {
          requestNewCode();
        }
      } catch {
        // ignore poll errors
      }
    };

    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [pairingCode, screenToken]);

  // Camera ingest is only active when screen is authorized/paired
  const { videoRef } = useCameraIngest(!!screenToken);

  const nowPlaying = stats?.now_playing ?? null;
  const creative = nowPlaying?.creative ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h") setShowHud((v) => !v);
      if (e.key === "f")
        wrapRef.current?.requestFullscreen?.().catch(() => undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleUnpair = () => {
    if (confirm("Hủy kết nối màn hình này và đăng ký lại bằng mã mới?")) {
      localStorage.removeItem("signage_screen_token");
      document.cookie = "signage_screen_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      setScreenToken(null);
      setScreenInfo(null);
      setPairingCode(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-xs text-[var(--muted)]">
        Đang khởi động màn hình...
      </div>
    );
  }

  // ---------- UNPAIRED STATE (Display Pairing Code) ----------
  if (!screenToken) {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const formattedTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#0a0d14] via-[#05070a] to-black px-6 text-center text-white select-none">
        {/* Ambient glow */}
        <div className="absolute top-1/3 h-72 w-72 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1 text-xs font-semibold text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>Chờ kích hoạt màn hình</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Màn Hình Trình Chiếu (Screen TV)
            </h1>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Màn hình này cần được phê duyệt từ trang <strong>/admin</strong> trước khi phát quảng cáo.
            </p>
          </div>

          {/* Prominent Pairing Code Box */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 shadow-2xl backdrop-blur-md">
            <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
              Mã Kết Nối Màn Hình (Pairing Code)
            </p>
            <div className="mt-3 font-mono text-4xl font-extrabold tracking-widest text-emerald-400 sm:text-5xl">
              {pairingCode || "------"}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
              <span>Hết hạn sau:</span>
              <span className="font-mono font-medium text-[var(--foreground)]">{formattedTime}</span>
              <span>·</span>
              <button
                onClick={requestNewCode}
                className="text-emerald-400 hover:underline"
              >
                Làm mới mã
              </button>
            </div>
          </div>

          {/* Activation Steps */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-4 text-left text-xs space-y-2 text-[var(--muted)]">
            <p className="font-semibold text-[var(--foreground)]">Hướng dẫn kích hoạt cho Quản trị viên:</p>
            <ol className="list-decimal pl-4 space-y-1 text-[11px]">
              <li>Mở trình duyệt trên máy tính/điện thoại, đăng nhập vào trang Quản trị: <code className="text-emerald-400">/admin</code></li>
              <li>Tại mục <strong>"Quản lý Màn hình"</strong>, nhập mã <strong className="font-mono text-emerald-300">{pairingCode}</strong></li>
              <li>Đặt tên thiết bị (ví dụ: *TV Sảnh Tầng 1*) và bấm <strong>Kích hoạt</strong>.</li>
              <li>Màn hình này sẽ tự động phát quảng cáo ngay lập tức!</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // ---------- PAIRED STATE (Active Ad Playback & Audience Tracking) ----------
  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black select-none"
    >
      {/* Background camera ingest */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute -left-[9999px] top-0 h-48 w-64 opacity-0"
      />

      {creative ? (
        creative.kind === "video" ? (
          <video
            key={nowPlaying?.airing_id ?? creative.id}
            src={mediaUrl(creative.url)}
            autoPlay
            muted
            playsInline
            loop
            className="h-full w-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={nowPlaying?.airing_id ?? creative.id}
            src={mediaUrl(creative.url)}
            alt={creative.name}
            className="h-full w-full object-contain"
          />
        )
      ) : (
        <div className="px-8 text-center text-sm text-[var(--muted)]">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-950/60 text-emerald-400 font-bold">
            OK
          </div>
          <p className="text-base font-semibold text-white">
            {screenInfo?.name || "Màn hình đã kích hoạt"}
          </p>
          <p className="mt-1 text-xs">
            {screenInfo?.location ? `Vị trí: ${screenInfo.location} · ` : ""}
            Đang chờ lịch phát sóng quảng cáo từ máy chủ...
          </p>
        </div>
      )}

      {/* Screen HUD on key 'H' */}
      {showHud && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/80 to-transparent p-5 text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                ● {screenInfo?.name || "Screen TV"}
              </span>
              <p className="font-medium text-white">{creative?.name ?? "—"}</p>
            </div>
            <p className="mt-1 text-[var(--muted)]">
              {nowPlaying?.playing
                ? `còn ${nowPlaying.remaining.toFixed(0)}s · airing #${nowPlaying.airing_id}`
                : "chưa phát"}
            </p>
          </div>

          <div className="pointer-events-auto flex items-center gap-4 text-white">
            <div className="tabular flex gap-4 text-right">
              <span>
                <span className="block text-lg font-semibold">{stats?.people_now ?? 0}</span>
                <span className="text-[var(--muted)]">có mặt</span>
              </span>
              <span>
                <span className="block text-lg font-semibold text-[var(--accent)]">
                  {stats?.attentive_now ?? 0}
                </span>
                <span className="text-[var(--muted)]">đang nhìn</span>
              </span>
            </div>

            <button
              onClick={handleUnpair}
              className="rounded border border-red-500/40 bg-red-950/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/50"
              title="Hủy liên kết thiết bị"
            >
              Hủy kết nối
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
