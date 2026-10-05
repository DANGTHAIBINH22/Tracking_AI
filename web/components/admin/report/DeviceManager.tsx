"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { FieldSelect } from "@/components/FieldSelect";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Input } from "@/components/motion/input";
import { Table, type TableColumn } from "@/components/motion/table";
import { ScreenPublic, api } from "@/lib/api";
import { useSearchParam } from "@/lib/useBrowserState";
import { useRefresh } from "@/lib/useRefresh";
import { Empty } from "./shared";

type Device = ScreenPublic & { isOnline: boolean; lastSeenText: string };

/** Online = a heartbeat within this many seconds of the list being read. */
const ONLINE_SECONDS = 180;

function lastSeenText(lastSeen: number | null, isOnline: boolean, readAt: number) {
  if (!lastSeen) return "Chưa kết nối";
  if (isOnline) return "Đang trực tuyến";
  const sec = Math.max(0, Math.floor(readAt - lastSeen));
  if (sec < 60) return `${sec} giây trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} ngày trước` : `${Math.floor(d / 30)} tháng trước`;
}

const fieldCls = {
  field: "h-9 rounded-xl bg-slate-50/60",
  input: "text-xs",
};

/**
 * The fleet: list, pair, revoke. The only part of /admin that changes
 * anything — the report modules beside it only read.
 */
export function DeviceManager({ onChanged }: { onChanged?: () => void }) {
  const [screens, setScreens] = useState<ScreenPublic[]>([]);
  // When `screens` was read, epoch seconds: "x phút trước" is measured against
  // this, not Date.now() in render, so output does not depend on re-render timing.
  const [readAt, setReadAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "online" | "offline">("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [pairOpen, setPairOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairOk, setPairOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setScreens(await api.listScreens());
      setReadAt(Date.now() / 1000);
    } catch (err) {
      console.error("Lỗi tải danh sách thiết bị:", err);
    } finally {
      setLoading(false);
    }
  }, []);
  useRefresh(load, 10000);

  // ?code=… from the TV's "Mở Trang Admin" link opens the pair dialog, once per
  // code; adjusted during render rather than copied into state by an effect.
  const urlCode = useSearchParam("code");
  const [handledCode, setHandledCode] = useState<string | null>(null);
  if (urlCode && urlCode !== handledCode) {
    setHandledCode(urlCode);
    setCode(urlCode.toUpperCase());
    setName((prev) => prev || "Màn hình Kiosk");
    setPairOpen(true);
  }

  const copyCode = (value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 2000);
  };

  const pair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setPairError(null);
    setPairOk(null);
    try {
      const paired = await api.pairScreen({
        pairing_code: code.trim().toUpperCase(),
        name: name.trim() || "Màn hình Kiosk",
        location: location.trim() || undefined,
      });
      setPairOk(`Ghép nối thành công thiết bị: ${paired.name}`);
      setCode("");
      setName("");
      setLocation("");
      await load();
      onChanged?.();
      setTimeout(() => {
        setPairOpen(false);
        setPairOk(null);
      }, 1500);
    } catch (err) {
      setPairError((err as Error).message || "Không thể ghép nối thiết bị. Vui lòng kiểm tra mã kết nối.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number, label: string) => {
    if (!confirm(`Bạn có chắc chắn muốn ngắt kết nối và xoá thiết bị "${label}"?`)) return;
    setDeletingId(id);
    try {
      await api.deleteScreen(id);
      await load();
      onChanged?.();
    } catch (err) {
      alert((err as Error).message || "Lỗi khi xoá thiết bị.");
    } finally {
      setDeletingId(null);
    }
  };

  const devices: Device[] = screens.map((s) => {
    const isOnline = Boolean(s.last_seen && readAt - s.last_seen < ONLINE_SECONDS);
    return { ...s, isOnline, lastSeenText: lastSeenText(s.last_seen, isOnline, readAt) };
  });
  const online = devices.filter((d) => d.isOnline).length;
  const q = search.trim().toLowerCase();
  const filtered = devices.filter(
    (d) =>
      (!q || [d.name, d.pairing_code, d.location, d.playlist_name].some((v) => v?.toLowerCase().includes(q))) &&
      (status === "all" || (status === "online") === d.isOnline),
  );

  const columns: TableColumn<Device>[] = [
    {
      key: "name",
      header: "Thiết bị",
      width: "220px",
      sortable: true,
      sortValue: (d) => d.name ?? "",
      cell: (d) => (
        <div className="min-w-0">
          <Link href={`/admin/devices/${d.id}`} className="block truncate font-semibold text-slate-900 hover:text-emerald-700">
            {d.name || `Màn hình #${d.id}`}
          </Link>
          <span className="text-[10px] text-slate-400">ID #{d.id}</span>
        </div>
      ),
    },
    {
      key: "isOnline",
      header: "Trạng thái",
      width: "120px",
      sortable: true,
      sortValue: (d) => (d.isOnline ? 1 : 0),
      cell: (d) => (
        <AnimatedBadge size="sm" status={d.isOnline ? "success" : "neutral"} pulse={d.isOnline}>
          {d.isOnline ? "Online" : "Offline"}
        </AnimatedBadge>
      ),
    },
    {
      key: "pairing_code",
      header: "Mã kết nối",
      width: "140px",
      cell: (d) => (
        <button
          type="button"
          onClick={() => copyCode(d.pairing_code || "")}
          title="Bấm để sao chép mã"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200/60 bg-slate-100 px-2 py-1 font-mono text-[11px] font-semibold text-slate-800 transition hover:bg-slate-200/80"
        >
          {d.pairing_code || "---"}
          {copied && copied === d.pairing_code && <span className="font-sans text-[10px] text-emerald-600">Đã chép!</span>}
        </button>
      ),
    },
    {
      key: "location",
      header: "Vị trí",
      sortable: true,
      sortValue: (d) => d.location ?? "",
      cell: (d) => (d.location ? <span className="truncate">{d.location}</span> : <span className="italic text-slate-400">Chưa gán vị trí</span>),
    },
    {
      key: "playlist_name",
      header: "Playlist",
      sortable: true,
      sortValue: (d) => d.playlist_name ?? "",
      cell: (d) =>
        d.playlist_name ? (
          <Link href={`/playlists/${d.playlist_id}`} className="truncate font-medium text-emerald-700 hover:text-emerald-900">
            {d.playlist_name}
          </Link>
        ) : (
          <span className="italic text-slate-400">Chưa có playlist</span>
        ),
    },
    {
      key: "last_seen",
      header: "Hoạt động cuối",
      width: "150px",
      sortable: true,
      sortValue: (d) => d.last_seen ?? 0,
      cell: (d) => <span className="font-mono text-[11px] text-slate-500">{d.lastSeenText}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "150px",
      cell: (d) => (
        <div className="flex justify-end gap-1.5">
          <Link
            href={`/admin/devices/${d.id}`}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-700"
          >
            Chi tiết
          </Link>
          <button
            type="button"
            onClick={() => revoke(d.id, d.name || `Màn hình #${d.id}`)}
            disabled={deletingId === d.id}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
          >
            {deletingId === d.id ? "Đang xoá…" : "Ngắt"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Tìm theo tên, mã kết nối, vị trí, playlist…"
            aria-label="Tìm thiết bị"
            className="min-w-[220px] flex-1 md:max-w-sm"
            classNames={fieldCls}
          />
          <FieldSelect
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={[
              { value: "all", label: `Tất cả (${devices.length})` },
              { value: "online", label: `Online (${online})` },
              { value: "offline", label: `Offline (${devices.length - online})` },
            ]}
            className="w-44"
            triggerClassName="bg-slate-50/60"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Làm mới
          </button>
          <Link
            href="/admin/devices/host"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Camera máy chủ
          </Link>
          <button
            type="button"
            onClick={() => setPairOpen(true)}
            className="rounded-xl bg-emerald-600 px-3.5 py-2 font-semibold text-white transition hover:bg-emerald-700"
          >
            + Ghép nối thiết bị
          </button>
        </div>
      </div>

      <Table
        data={filtered}
        columns={columns}
        getRowId={(d) => String(d.id)}
        defaultSort={{ key: "isOnline", direction: "desc" }}
        rowHeight={56}
        loading={loading}
        height={Math.min(640, 52 + Math.max(filtered.length, 3) * 56)}
        emptyState={
          <Empty>
            {search || status !== "all"
              ? "Không tìm thấy thiết bị phù hợp với bộ lọc."
              : "Chưa có thiết bị nào. Mở Homescreen trên màn hình Kiosk để lấy mã 6 ký tự và ghép nối."}
          </Empty>
        }
        className="rounded-2xl border border-slate-200/80 bg-white text-xs shadow-xs"
      />

      {pairOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-labelledby="pair-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="pair-title" className="text-sm font-bold text-slate-900">
                  Ghép nối thiết bị mới
                </h3>
                <p className="text-[11px] text-slate-500">Nhập mã 6 ký tự đang hiện trên màn hình Homescreen.</p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => {
                  setPairOpen(false);
                  setPairError(null);
                  setPairOk(null);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            {pairError && <p className="mt-3.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{pairError}</p>}
            {pairOk && <p className="mt-3.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{pairOk}</p>}
            <form onSubmit={pair} className="mt-4 space-y-3">
              <Input
                label="Mã ghép nối *"
                value={code}
                onChange={(v) => setCode(v.toUpperCase())}
                placeholder="VD: XXCSFV"
                maxLength={10}
                required
                classNames={{ field: "h-10 rounded-xl", input: "font-mono uppercase tracking-widest" }}
              />
              <Input label="Tên màn hình *" value={name} onChange={setName} placeholder="VD: Kiosk Sảnh Chính" required classNames={fieldCls} />
              <Input label="Vị trí lắp đặt" value={location} onChange={setLocation} placeholder="VD: Tầng 1 - Cửa đón khách" classNames={fieldCls} />
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setPairOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? "Đang kết nối…" : "Xác nhận ghép nối"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
