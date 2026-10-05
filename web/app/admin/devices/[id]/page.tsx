"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  API_BASE,
  BROWSER_SOURCE,
  CaptureState,
  ScreenPublic,
  TargetingSettings,
  Thresholds,
  api,
  mediaUrl,
} from "@/lib/api";
import { animalLabel, clothingColor, genderLabel, styleLabel } from "@/lib/taxonomy";
import { useLive } from "@/lib/useLive";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { ActionSwapButton, type ActionSwapItem } from "@/components/motion/action-swap";
import { ArrowLeft, ExternalLink, Play, Square, Upload } from "lucide-react";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectGroup,
  MultiSelectInput,
  MultiSelectItem,
  MultiSelectLabel,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/motion/multi-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Switch } from "@/components/motion/switch";
import { DayHistory } from "@/components/admin/DayHistory";
import { DeviceReport } from "@/components/admin/DeviceReport";

/** One device's live tracking and session history. The device list lives on
 *  /admin; this page is reached from a row there, so its id is in the URL
 *  ("host" for the API host's own camera, a screen id otherwise). */
export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const selectedScreenId: number | "host" =
    params.id === "host" ? "host" : Number(params.id);

  const { stats } = useLive();
  // The device decides where frames come from: the host reads OpenCV sources
  // on the API machine, a paired screen sends its own webcam through
  // /ws/ingest. Offering the other one here only pointed a screen's page at
  // clips that have nothing to do with that screen.
  const isHost = selectedScreenId === "host";
  const mode: "server" | "browser" = isHost ? "server" : "browser";

  // System states
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [source, setSource] = useState("0");
  const [sourcesList, setSourcesList] = useState<{ value: string; label: string; type: string; group?: string; description?: string }[]>([]);
  const [streamKey, setStreamKey] = useState<number>(() => Date.now());
  // Which data/ subfolder groups are expanded. A named set can hold dozens of
  // clips (data/age_kids has 35), and rendering them all flat buried the two
  // webcam presets everyone actually starts from.
  // Sample clips picked for a test run, in the order they will play. One clip
  // loops on its own; several run back to back as one continuous scene list.
  const [clips, setClips] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [screens, setScreens] = useState<ScreenPublic[]>([]);
  const [screensReadAt, setScreensReadAt] = useState(0);

  // Smart targeting & Dynamic Cut-in settings
  const [smartTargeting, setSmartTargeting] = useState<boolean>(false);
  const [cutInEnabled, setCutInEnabled] = useState<boolean>(true);
  const [showTargetingConfig, setShowTargetingConfig] = useState<boolean>(false);

  // Tracking Sessions state for device

  // 2. Fetch screens list
  const loadScreens = useCallback(async () => {
    try {
      const list = await api.listScreens();
      setScreens(list);
      setScreensReadAt(Date.now() / 1000);
    } catch {
      // ignore
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const list = await api.captureSources();
      setSourcesList(list);
    } catch (err) {
      // Not fatal — the picker renders its own "thử lại" state — but swallowing
      // this without a trace left no way to tell a network failure from a
      // genuinely empty data/ directory.
      console.error("Không nạp được danh sách nguồn phát:", err);
    }
  }, []);



  const refresh = useCallback(async () => {
    try {
      const cap = await api.captureState();
      setCapture(cap);
      await Promise.all([loadScreens(), loadSources()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [loadScreens, loadSources]);

  useEffect(() => {
    let ignore = false;
    const fetchState = () => {
      api
        .captureState()
        .then((cap) => {
          if (!ignore) {
            setCapture(cap);
          }
        })
        .catch((err) => {
          if (!ignore) setError((err as Error).message);
        });
      loadScreens();
      loadSources();
    };

    fetchState();
    // Once on mount, not inside fetchState: the source list only changes when
    // someone uploads a clip, so re-reading it every 3s alongside the capture
    // poll would be waste. Leaving it out of the mount path entirely was the
    // bug — sourcesList stayed empty until the operator happened to trigger an
    // action, and until then the picker showed its hardcoded fallback as if
    // those three entries were everything available.
    api
      .captureSources()
      .then((list) => {
        if (!ignore) setSourcesList(list);
      })
      .catch((err) => console.error("Không nạp được danh sách nguồn phát:", err));
    api.thresholds().then((th) => { if (!ignore) setThresholds(th); }).catch(() => undefined);
    api.health().then((h) => { if (!ignore) setHealth(h); }).catch(() => undefined);
    api.getTargetingSettings().then((st) => {
      if (!ignore) {
        setSmartTargeting(st.smart_targeting);
        setCutInEnabled(st.cut_in_enabled);
      }
    }).catch(() => undefined);

    const id = setInterval(fetchState, 3000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, [loadScreens, loadSources]);

  const isSmartTargeting = stats?.smart_targeting !== undefined ? stats.smart_targeting : smartTargeting;
  const isCutInEnabled = stats?.now_playing?.cut_in_enabled !== undefined ? stats.now_playing.cut_in_enabled : cutInEnabled;

  const handleToggleSmartTargeting = async () => {
    try {
      const nextVal = !isSmartTargeting;
      setSmartTargeting(nextVal);
      await api.setTargetingSettings({ smart_targeting: nextVal });
    } catch (e) {
      console.error("Lỗi đổi chế độ phát thông minh:", e);
    }
  };

  const handleUpdateTargeting = async (patch: Partial<TargetingSettings>) => {
    try {
      const res = await api.setTargetingSettings(patch);
      setSmartTargeting(res.smart_targeting);
      setCutInEnabled(res.cut_in_enabled);
    } catch (e) {
      console.error("Lỗi cập nhật cấu hình targeting:", e);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUploadTestVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.uploadTestVideo(file);
      await loadSources();
      // Straight into the selection, ready to run.
      setClips((prev) => (prev.includes(res.source) ? prev : [...prev, res.source]));
    } catch (err) {
      alert((err as Error).message || "Lỗi tải lên video test");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  // ---------- AUTHENTICATED ADMIN PORTAL (Login disabled - Full access) ----------
  const running = capture?.running ?? false;
  // One engine serves every device, so "running" alone says nothing about
  // this one. Live audience data is shown only while the run is this device's;
  // otherwise this page would present another screen's viewers as its own.
  const runningHere = running && capture?.device_id === String(selectedScreenId);
  const runningElsewhere = running && !runningHere;
  const audience = runningHere ? stats : null;
  // Next up is about the screen, not about this device's camera: shown whether
  // or not tracking runs here.
  const nextUp = stats?.now_playing?.next_up ?? null;
  const playing = stats?.now_playing?.playing ?? false;
  const nowPlaying = stats?.now_playing ?? null;

  // Only the host picks a source, and the host always reads server-side.
  const handleSelectSource = (newSource: string) => {
    setSource(newSource);
    setStreamKey(() => Date.now());
    if (running) {
      act(async () => {
        const devId = selectedScreenId;
        const scrId = typeof selectedScreenId === "number" ? selectedScreenId : undefined;
        await api.captureStop().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
        const res = await api.captureStart(newSource || "0", devId, scrId);
        setStreamKey(Date.now());
        return res;
      });
    }
  };

  const startCapture = (queued?: string[]) =>
    act(async () => {
      setStreamKey(Date.now());
      const devId = selectedScreenId;
      const scrId = typeof selectedScreenId === "number" ? selectedScreenId : undefined;
      const res = await api.captureStart(
        mode === "browser" ? BROWSER_SOURCE : source || "0",
        devId,
        scrId,
        mode === "browser" ? undefined : queued,
      );
      if (!playing) {
        api.playerStart().catch(() => {});
      }
      setStreamKey(Date.now());
      return res;
    });

  /** Run the picked sample clips for this device: server-side playback, the
   *  results filed under this device's session like a live run. Restarts if
   *  this device is already running something else. */
  const runClips = (picked: string[]) =>
    act(async () => {
      const devId = selectedScreenId;
      const scrId = typeof selectedScreenId === "number" ? selectedScreenId : undefined;
      if (runningHere) {
        await api.captureStop().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      setStreamKey(Date.now());
      const res = await api.captureStart(picked[0], devId, scrId, picked.length > 1 ? picked : undefined);
      if (!playing) api.playerStart().catch(() => {});
      setStreamKey(Date.now());
      return res;
    });

  const stopCapture = () =>
    act(async () => {
      const res = await api.captureStop();
      setStreamKey(Date.now());
      return res;
    });


  // The host camera has no screens row; it is "online" while capture runs.
  const screen = selectedScreenId === "host" ? null : screens.find((x) => x.id === selectedScreenId);
  const deviceName =
    selectedScreenId === "host"
      ? "Camera AI Hub (Host OpenCV)"
      : screen?.name || `Màn hình #${selectedScreenId}`;
  const deviceOnline =
    selectedScreenId === "host"
      ? running
      : Boolean(screen?.last_seen && screensReadAt - screen.last_seen < 180);

  const adminContent = (
    <main className="w-full space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      {error && (
        <div className="card border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Header: one line — back, who this device is, the essentials, and
            the tracking control. Unset fields are left out rather than shown
            as "Chưa gán …" placeholders. */}
        <header className="card flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <Link
            href="/admin"
            aria-label="Quay lại danh sách thiết bị"
            title="Quay lại danh sách thiết bị"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-bold text-slate-900">{deviceName}</h1>
              <AnimatedBadge
                size="sm"
                status={deviceOnline ? "success" : "danger"}
                aria-live="polite"
                title={
                  screen?.last_seen
                    ? `Lần cuối hoạt động: ${new Date(screen.last_seen * 1000).toLocaleString("vi-VN")}`
                    : undefined
                }
              >
                {deviceOnline ? "Online" : "Offline"}
              </AnimatedBadge>
            </div>
            {screen && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                <span className="font-mono font-semibold text-slate-700">{screen.pairing_code}</span>
                {screen.location && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{screen.location}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span className={screen.playlist_name ? "text-slate-700" : "italic"}>
                  {screen.playlist_name || "Chưa có playlist"}
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {typeof selectedScreenId === "number" && (
              <a
                href="/homescreen"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 px-3.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Homescreen
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <ActionSwapButton
              items={TRACKING_ACTIONS}
              value={runningHere ? "stop" : "start"}
              // The label follows the engine, not the click: it swaps once the
              // capture state confirms, so a failed start never shows "Dừng".
              cycle={false}
              animation="roll"
              variant="primary"
              disabled={busy || runningElsewhere || (!running && !isHost && !deviceOnline)}
              onClick={() => (runningHere ? stopCapture() : startCapture())}
              className={
                runningHere
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
            />
          </div>
        </header>

        {runningElsewhere && (
          <div className="card border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            Camera AI đang chạy cho{" "}
            <strong>
              {capture?.device_id === "host"
                ? "Camera AI Hub (máy chủ)"
                : screens.find((x) => String(x.id) === capture?.device_id)?.name ||
                  `thiết bị #${capture?.device_id ?? "?"}`}
            </strong>
            . Hệ thống chỉ phân tích một nguồn mỗi lúc — dừng ở thiết bị đó trước khi bắt đầu ở đây.
          </div>
        )}
        {!running && !isHost && !deviceOnline && (
          <div className="card border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
            Màn hình đang offline. Mở /player trên thiết bị này để nó gửi hình từ webcam của nó, rồi bắt đầu tracking.
          </div>
        )}


        {/* Live view, history and (host only) system facts are three different
            questions; stacking them made the history a long scroll away. */}
        <Tabs defaultValue="live" variant="segment">
          <TabsList className="border border-slate-200 shadow-xs">
            <TabsTrigger value="live">Trực tiếp</TabsTrigger>
            <TabsTrigger value="report">Báo cáo</TabsTrigger>
            <TabsTrigger value="sessions">Lịch sử theo ngày</TabsTrigger>
            {isHost && <TabsTrigger value="system">Hệ thống</TabsTrigger>}
          </TabsList>

        <TabsContent value="live">
        <section id="camera-section" className="space-y-4 scroll-mt-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Left 2 Cols: Video Stream & Source Controls & Live Tracks Table */}
            <div className="space-y-4 lg:col-span-2">
              {/* Live Camera Viewport */}
              <div className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${runningHere ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                    <span className="text-xs font-bold text-slate-900">
                      {runningHere ? "Luồng Camera AI Trực Tiếp" : "Camera đang tạm dừng"}
                    </span>
                    {runningHere && capture?.mode === "server" && (
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                        {/* While a queue runs, the engine's own cursor is the
                            truth; `source` is the whole "|"-joined queue. */}
                        {`Nguồn: ${(capture?.source_now ?? source ?? "0").split("/").pop()}`}
                      </span>
                    )}
                    {runningHere && (capture?.queue?.length ?? 0) > 1 && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700">
                        clip {(capture?.queue?.indexOf(capture?.source_now ?? "") ?? -1) + 1}/
                        {capture?.queue?.length}
                      </span>
                    )}
                  </div>
                  {runningHere && (
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                      <span>{audience?.fps?.toFixed(1) ?? "0.0"} FPS</span>
                    </div>
                  )}
                </div>

                {/* Viewport content */}
                <div className="flex aspect-video items-center justify-center bg-slate-950 relative">
                  {runningHere ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${source}-${streamKey}`}
                      src={`${API_BASE}/api/capture/stream.mjpg?t=${streamKey}`}
                      alt="Camera khán giả"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-xs text-slate-400">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-slate-500 border border-slate-800">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="max-w-md text-slate-300">
                        Camera đang tắt. Bấm <strong className="text-white">Bắt đầu tracking camera</strong> ở trên để nhận diện khán giả trước màn hình này.
                      </p>
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* Right Column: AI Smart Targeting & Playback Controls */}
            <div className="space-y-4">
              <SampleClipsCard
                sources={sourcesList}
                value={clips}
                onChange={setClips}
                onRun={() => runClips(clips)}
                onUpload={handleUploadTestVideo}
                onReload={loadSources}
                disabled={busy || runningElsewhere}
                // The host can also read its own webcam presets directly.
                cameraPresets={isHost ? sourcesList.filter((x) => x.type === "webcam") : []}
                activePreset={source}
                onPickPreset={handleSelectSource}
              />

              {/* AI Recommendation Widget */}
              <div className="card p-4 space-y-3 border-purple-200 bg-gradient-to-b from-purple-50/30 via-white to-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-xs font-bold text-purple-700">
                      AI
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Gợi Ý Quảng Cáo AI
                      </h3>
                      <p className="text-[10px] text-slate-500">Nhân khẩu học thời gian thực</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowTargetingConfig(!showTargetingConfig)}
                      className={`rounded-full px-2 py-1 text-[11px] font-medium transition border flex items-center gap-1 ${
                        showTargetingConfig
                          ? "bg-purple-100 border-purple-300 text-purple-800 font-semibold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      title="Cài đặt cách chuyển quảng cáo"
                    >
                      <span>⚙️ Cài đặt</span>
                    </button>

                    <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-0.5 pl-2.5 pr-0.5 text-[11px] font-medium text-slate-700">
                      Phát thích ứng
                      <Switch
                        checked={isSmartTargeting}
                        onCheckedChange={() => handleToggleSmartTargeting()}
                        ariaLabel="Phát thích ứng theo khán giả"
                      />
                    </span>
                  </div>
                </div>

                {showTargetingConfig && (
                  <div
                    className={`rounded-xl border p-3 text-xs animate-in fade-in duration-200 ${
                      isSmartTargeting ? "border-purple-100 bg-purple-50/40" : "border-amber-200 bg-amber-50/60"
                    }`}
                  >
                    {/* One choice instead of three knobs. "Phát hết video" off
                        means: cut to CARE's advert 5s after an audience shows up
                        (server/player.py, set_audience_ranking). */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-800">Phát hết video rồi mới chuyển</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                          {!isSmartTargeting
                            ? "Chỉ có tác dụng khi bật “Phát thích ứng”. Hiện đang tắt, nên mọi quảng cáo phát theo vòng thường và không cắt theo khán giả."
                            : isCutInEnabled
                            ? "Đang tắt: khi nhận diện được khán giả, sau 5 giây sẽ ngắt clip đang phát để chuyển sang quảng cáo CARE chọn cho họ (nếu clip hiện tại chưa phù hợp)."
                            : "Đang bật: mỗi quảng cáo luôn phát hết; CARE chọn quảng cáo tiếp theo theo khán giả lúc clip kết thúc."}
                        </p>
                      </div>
                      <Switch
                        disabled={!isSmartTargeting}
                        checked={!isCutInEnabled}
                        onCheckedChange={(playFull) =>
                          handleUpdateTargeting(playFull ? { cut_in_enabled: false } : { cut_in_enabled: true, cut_in_min_playback: 5 })
                        }
                        ariaLabel="Phát hết video rồi mới chuyển"
                      />
                    </div>
                  </div>
                )}

                {/* Who is in front of the camera, read quickly. */}
                {audience?.recommendation ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500">Khán giả:</span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                      {audience.recommendation.people_count || 1} người
                    </span>
                    {audience.recommendation.viewer_gender && (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-800">
                        {Math.round((audience.recommendation.viewer_gender_share ?? 1) * 100)}%{" "}
                        {genderLabel(audience.recommendation.viewer_gender)?.toLowerCase() ?? "—"}
                      </span>
                    )}
                    {audience.recommendation.viewer_age_group && (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-800">
                        chủ yếu {audience.recommendation.viewer_age_group} tuổi
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Chưa phát hiện khán giả trước camera — đang phát theo vòng thường.
                  </p>
                )}

                {/* Why the screen is (not) cutting: how well what is on air fits. */}
                {isSmartTargeting && stats?.now_playing?.creative && stats.now_playing.current_fit != null && (
                  <p className="mt-2 text-[11px] text-slate-600">
                    Đang phát <strong className="text-slate-900">{stats.now_playing.creative.name}</strong> · phù hợp{" "}
                    <strong className={stats.now_playing.current_fit >= 60 ? "text-emerald-700" : "text-amber-700"}>
                      {Math.round(stats.now_playing.current_fit)}/100
                    </strong>
                    {stats.now_playing.current_fit >= Math.max(...[nextUp?.match_score ?? 0]) - 5
                      ? " — đã hợp khán giả nhất, phát tiếp không cắt."
                      : isCutInEnabled
                      ? " — chưa hợp, sẽ chuyển sau 5 giây khán giả đứng xem."
                      : " — chưa hợp, sẽ chuyển khi clip kết thúc."}
                  </p>
                )}

                {/* What airs next, chosen exactly as the player will choose it. */}
                {nextUp ? (
                  <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs">
                    <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                      {nextUp.creative.kind === "video" ? (
                        <video src={`${mediaUrl(nextUp.creative.url)}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />
                      ) : nextUp.creative.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(nextUp.creative.url)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">WEB</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Phát tiếp theo
                        {nextUp.mode === "cut_in"
                          ? " · ngay bây giờ"
                          : stats?.now_playing?.remaining
                          ? ` · sau ${Math.ceil(stats.now_playing.remaining)}s`
                          : ""}
                      </p>
                      <p className="truncate font-bold text-slate-900">{nextUp.creative.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                        <span
                          className={`rounded px-1.5 py-px font-semibold ${
                            nextUp.mode === "rotation" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {nextUp.mode === "rotation" ? "Vòng thường" : nextUp.mode === "cut_in" ? "CARE · cắt ngang" : "CARE chọn"}
                        </span>
                        {nextUp.match_score != null && <span>phù hợp {Math.round(nextUp.match_score)}/100</span>}
                        {nextUp.mode === "rotation" && audience?.recommendation && !isSmartTargeting && (
                          <span className="font-semibold text-amber-700">· bật “Phát thích ứng” để chọn theo khán giả</span>
                        )}
                        <span className="truncate">· {nextUp.creative.category}</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2.5 text-[11px] text-slate-400">Chưa có playlist nào đang phát.</p>
                )}
              </div>

              {/* Ambient Scene Context Widget (VLM Moondream2) — only when the
                  optional VLM branch is on; otherwise it would wait forever. */}
              {Boolean(health?.vlm_enabled) && (
              <div className="card p-4 space-y-3 border-teal-200 bg-gradient-to-b from-teal-50/30 via-white to-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-100 text-xs font-bold text-teal-700">
                      VLM
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Ngữ Cảnh Môi Trường (VLM)
                      </h3>
                      <p className="text-[10px] text-slate-500">Moondream2 Vision AI · Cập nhật 20s/lần</p>
                    </div>
                  </div>
                </div>

                {audience?.ambient_context || audience?.recommendation?.scene_weather ? (
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Weather / Lighting Box */}
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Thời tiết / Ánh sáng</p>
                        <div className="mt-1 flex items-center gap-1.5 font-bold text-slate-800">
                          {audience?.ambient_context?.weather === "sunny" || audience?.recommendation?.scene_weather === "sunny" ? (
                            <>
                              <span className="text-amber-500">☀️</span>
                              <span>Nắng / Sáng rõ</span>
                            </>
                          ) : audience?.ambient_context?.weather === "rainy" || audience?.recommendation?.scene_weather === "rainy" ? (
                            <>
                              <span className="text-blue-500">🌧️</span>
                              <span>Mưa / Mát mẻ</span>
                            </>
                          ) : audience?.ambient_context?.weather === "cloudy" || audience?.recommendation?.scene_weather === "cloudy" ? (
                            <>
                              <span className="text-slate-500">☁️</span>
                              <span>Nhiều mây / Indoor</span>
                            </>
                          ) : (
                            <span>{audience?.ambient_context?.weather || audience?.recommendation?.scene_weather || "Đang phân tích..."}</span>
                          )}
                        </div>
                      </div>

                      {/* Crowd Activity Box */}
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Hoạt động đám đông</p>
                        <div className="mt-1 flex items-center gap-1.5 font-bold text-slate-800">
                          {audience?.ambient_context?.crowd_activity === "walking" ? (
                            <>
                              <span>🚶</span>
                              <span>Đang di chuyển</span>
                            </>
                          ) : audience?.ambient_context?.crowd_activity === "shopping" ? (
                            <>
                              <span>🛍️</span>
                              <span>Mua sắm</span>
                            </>
                          ) : (
                            <>
                              <span>🧍</span>
                              <span>Đang đứng xem</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Objects Identified */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium mb-1">Vật thể bối cảnh nhận diện:</p>
                      <div className="flex flex-wrap gap-1">
                        {(audience?.ambient_context?.objects?.length
                          ? audience.ambient_context.objects
                          : audience?.recommendation?.scene_objects?.length
                          ? audience.recommendation.scene_objects
                          : ["none"]
                        ).map((obj, i) => (
                          <span
                            key={i}
                            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                              obj === "none"
                                ? "bg-slate-200/60 text-slate-500"
                                : "bg-teal-100/70 text-teal-800 border border-teal-200"
                            }`}
                          >
                            {obj === "shopping bags"
                              ? "🛍️ Túi xách / Balo"
                              : obj === "laptops"
                              ? "💻 Máy tính / Laptop"
                              : obj === "food/beverage"
                              ? "☕ Đồ ăn / Đồ uống"
                              : obj === "none"
                              ? "Không có vật thể đặc biệt"
                              : obj}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-3 text-center text-xs text-slate-500">
                    <p>Đang chờ chu kỳ quét bối cảnh VLM đầu tiên...</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      VLM tự động quét khung cảnh mỗi 20 giây để cung cấp thông tin cho CARE Engine.
                    </p>
                  </div>
                )}
              </div>

              )}

              {/* Playback Controls on Screen */}
              <div className="card p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Trạng Thái Chiếu Quảng Cáo
                </h3>

                {nowPlaying?.creative ? (
                  <div className="space-y-2">
                    <p className="truncate text-sm font-bold text-slate-900">{nowPlaying.creative.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {nowPlaying.creative.kind === "video" ? "Video" : "Ảnh"} ·{" "}
                      {nowPlaying.creative.duration}s
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/60">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-300"
                        style={{
                          width: `${
                            nowPlaying.creative.duration > 0
                              ? Math.min(100, (nowPlaying.elapsed / nowPlaying.creative.duration) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p className="tabular text-right text-[11px] text-slate-500">
                      Còn lại: {nowPlaying.remaining.toFixed(0)}s
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Chưa có quảng cáo nào đang phát.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                  <button
                    disabled={busy}
                    onClick={() => act(() => (playing ? api.playerStop() : api.playerStart()))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-xs transition disabled:opacity-50 ${
                      playing
                        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {playing ? "Dừng chiếu" : "Bắt đầu chiếu"}
                  </button>
                  <button
                    disabled={busy || !playing}
                    onClick={() => act(() => api.playerSkip())}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs"
                  >
                    Bỏ qua ⏭
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Live Tracks Table — full width: eight columns do not fit beside the targeting panel */}
          <div className="card mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Nhật Ký Khuôn Mặt Thời Gian Thực (Live Tracks)
                </h3>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {audience?.tracks?.length ?? 0} người
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {(audience?.tracks ?? []).filter((t) => t.attention).length} đang nhìn
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                Cập nhật liên tục theo từng khung hình
              </span>
            </div>

            <div className="max-h-96 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[860px] text-xs [&_th]:whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Track ID</th>
                    <th className="px-3 py-2 text-left font-medium">Giới tính</th>
                    <th className="px-3 py-2 text-left font-medium">Độ tuổi ước tính</th>
                    <th className="px-3 py-2 text-left font-medium">Trang phục & Phong cách</th>
                    <th className="px-3 py-2 text-center font-medium">Thú cưng</th>
                    <th className="px-3 py-2 text-right font-medium">Góc đầu (Yaw/Pitch)</th>
                    <th className="px-3 py-2 text-right font-medium">Trạng thái</th>
                    <th className="px-3 py-2 text-right font-medium">Dwell Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(audience?.tracks ?? []).map((t) => (
                    <tr key={t.track_id} className="hover:bg-slate-50 transition">
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">#{t.track_id}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {genderLabel(t.gender) ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {t.age != null ? (
                          <span>
                            <strong className="text-slate-900">~{Math.round(t.age)}</strong>
                            <span className="text-xs text-slate-500 ml-1">({t.age_group})</span>
                          </span>
                        ) : (
                          t.age_group ?? "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {t.clothing_color ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300 shadow-2xs"
                                style={{ backgroundColor: clothingColor(t.clothing_color)?.swatch }}
                              />
                              Áo {clothingColor(t.clothing_color)?.vi.toLowerCase()}
                            </span>
                            {t.clothing_style && (
                              <span className="text-[10px] text-slate-500 font-medium">
                                {styleLabel(t.clothing_style)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {t.has_pet ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            {animalLabel(t.pet_type)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="tabular px-3 py-2 text-right font-mono text-slate-500">
                        {t.yaw ?? "—"}° / {t.pitch ?? "—"}°
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.attention ? (
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Đang nhìn
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Không nhìn</span>
                        )}
                      </td>
                      <td className="tabular px-3 py-2 text-right font-mono text-slate-700">
                        {t.dwell_time.toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                  {!audience?.tracks?.length && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                        {running ? "Chưa có ai trong khung hình camera" : "Bật camera để bắt đầu theo dõi khuôn mặt"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        </TabsContent>

        <TabsContent value="report">
          {/* This device's tracking, audience and top videos by day / week / month. */}
          <DeviceReport deviceId={selectedScreenId} />
        </TabsContent>

        <TabsContent value="sessions">
          {/* One day's log of everyone seen, across sessions (components/admin/DayHistory). */}
          <DayHistory deviceId={selectedScreenId} />
        </TabsContent>

        {/* SECTION 5: SYSTEM HEALTH — about the API host's models, so only
            on the host's page */}
        {isHost && (
        <TabsContent value="system">
        <section className="card space-y-2 p-4 text-xs">
          <h2 className="text-sm font-semibold">Tình trạng hệ thống</h2>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Row label="Thiết bị tính toán" value={String(health?.device ?? "—")} />
            <Row
              label="Model khuôn mặt"
              value={health?.face_weights_present ? "đã có (YOLOv8-Face)" : "thiếu"}
              warn={!health?.face_weights_present}
            />
            <Row
              label="Model tuổi/giới tính"
              value={health?.age_model_present ? "đã có (MiVOLO SOTA)" : "thiếu"}
              warn={!health?.age_model_present}
            />
            <Row
              label="Ngưỡng tính một lượt xem"
              value={`nhìn ≥ ${thresholds?.min_attention_seconds ?? "—"}s · có mặt ≥ ${thresholds?.min_presence_seconds ?? "—"}s`}
            />
          </dl>
        </section>
        </TabsContent>
        )}
        </Tabs>
      </div>
    </main>
  );

  return adminContent;
}

type SourceOption = { value: string; label: string; type: string; group?: string; description?: string };

/** Sample videos to test the pipeline with, picked from data/ through beUI's
 *  multi-select: search by name, grouped by folder, chips in play order. */
function SampleClipsCard({
  sources,
  value,
  onChange,
  onRun,
  onUpload,
  onReload,
  disabled,
  cameraPresets,
  activePreset,
  onPickPreset,
}: {
  sources: SourceOption[];
  value: string[];
  onChange: (next: string[]) => void;
  onRun: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReload: () => void;
  disabled: boolean;
  cameraPresets: SourceOption[];
  activePreset: string;
  onPickPreset: (value: string) => void;
}) {
  const files = sources.filter((x) => x.type === "file");
  const groups = files.reduce<Record<string, SourceOption[]>>((acc, x) => {
    (acc[x.group || "Video lẻ"] ||= []).push(x);
    return acc;
  }, {});
  // Labels arrive as "🎬 Woman choosing dress"; the chip has no room for the icon.
  const clean = (label: string) => label.replace(/^\p{Extended_Pictographic}\s*/u, "");

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Video mẫu để test</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {files.length} video có sẵn. Chọn nhiều thì chạy lần lượt theo thứ tự rồi lặp lại.
          </p>
        </div>
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" />
          Tải video lên
          <input type="file" accept="video/*" className="hidden" onChange={onUpload} />
        </label>
      </div>

      {cameraPresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cameraPresets.map((p) => (
            <button
              key={p.value}
              type="button"
              title={p.description}
              onClick={() => onPickPreset(p.value)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                activePreset === p.value
                  ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {files.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Chưa nạp được danh sách video.</span>
          <button type="button" onClick={onReload} className="font-semibold text-slate-700 underline">
            Thử lại
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <MultiSelect value={value} onValueChange={onChange}>
            <MultiSelectTrigger className="min-w-0">
              <MultiSelectValue placeholder="Chọn video mẫu…">
                {(v, label) => {
                  const at = value.indexOf(v);
                  return value.length > 1 ? `${at + 1}. ${clean(label)}` : clean(label);
                }}
              </MultiSelectValue>
              <MultiSelectInput aria-label="Tìm video mẫu" placeholder="Tìm theo tên…" />
            </MultiSelectTrigger>
            <MultiSelectContent>
              <MultiSelectList ariaLabel="Video mẫu">
                {Object.entries(groups).map(([name, items]) => (
                  <MultiSelectGroup key={name}>
                    <MultiSelectLabel>{name}</MultiSelectLabel>
                    {items.map((x) => (
                      <MultiSelectItem key={x.value} value={x.value} textValue={x.label} keywords={[x.value]}>
                        <span className="block truncate text-[13px]">{clean(x.label)}</span>
                        <span className="block truncate font-mono text-[10px] text-slate-400">{x.value}</span>
                      </MultiSelectItem>
                    ))}
                  </MultiSelectGroup>
                ))}
                <MultiSelectEmpty>Không tìm thấy video.</MultiSelectEmpty>
              </MultiSelectList>
            </MultiSelectContent>
          </MultiSelect>
          <button
            type="button"
            disabled={disabled || value.length === 0}
            onClick={onRun}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            {value.length > 1 ? `Chạy ${value.length} video` : "Chạy video"}
          </button>
        </div>
      )}
    </div>
  );
}

const TRACKING_ACTIONS: ActionSwapItem[] = [
  { id: "start", label: "Bắt đầu tracking", icon: <Play className="h-4 w-4" />, ariaLabel: "Bắt đầu tracking camera" },
  { id: "stop", label: "Dừng tracking", icon: <Square className="h-4 w-4" />, ariaLabel: "Dừng tracking camera" },
];

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-1 last:border-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={warn ? "text-[var(--warn)]" : ""}>{value}</dd>
    </div>
  );
}
