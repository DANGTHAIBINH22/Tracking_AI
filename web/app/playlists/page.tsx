"use client";

import { useRefresh } from "@/lib/useRefresh";
import { PlaylistPublic, ScreenPublic, api, mediaUrl } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, Copy, Globe, ListVideo, MonitorOff, Radio, Square, Tv } from "lucide-react";
import { IconClose, IconEdit, IconPlaylist, IconPlus, IconSearch, IconTrash } from "@/components/icons/Icons";
import SelectScreenModal from "@/components/SelectScreenModal";
import { FieldSelect } from "@/components/FieldSelect";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Input } from "@/components/motion/input";
import { OverflowActions, type OverflowActionItem } from "@/components/motion/overflow-actions";
import { Table, type TableColumn } from "@/components/motion/table";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "on-air" | "idle";

function formatDuration(sec: number) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}p ${s % 60}s` : `${m}p`;
}

function formatDate(ts: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** A 2x2 mosaic of the first items, so playlists are recognisable at a glance. */
function Cover({ pl, className }: { pl: PlaylistPublic; className?: string }) {
  const covers = pl.covers ?? [];
  if (!covers.length) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg bg-slate-100 text-slate-400", className)}>
        <ListVideo className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className={cn("grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg bg-slate-200", className)}>
      {[0, 1, 2, 3].map((i) => {
        const c = covers[i];
        if (!c) return <span key={i} className="bg-slate-100" />;
        if (c.kind === "video")
          return <video key={i} src={`${mediaUrl(c.url)}#t=0.5`} muted preload="metadata" className="h-full w-full bg-slate-900 object-cover" />;
        if (c.kind === "image")
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={mediaUrl(c.url)} alt="" className="h-full w-full bg-slate-900 object-cover" />;
        return (
          <span key={i} className="flex items-center justify-center bg-slate-800 text-slate-300">
            <Globe className="h-3 w-3" />
          </span>
        );
      })}
    </div>
  );
}

function Stat({ label, value, icon, tone = "slate" }: { label: string; value: ReactNode; icon: ReactNode; tone?: "slate" | "emerald" | "amber" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-600 ring-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1", tones[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-slate-900 tabular">{value}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ pl }: { pl: PlaylistPublic }) {
  const screens = pl.assigned_screen_ids?.length ?? 0;
  if (pl.is_active && screens)
    return (
      <AnimatedBadge size="sm" status="success" pulse icon={<Radio className="h-3 w-3" />} title={pl.publish_status}>
        Đang phát · {screens} thiết bị
      </AnimatedBadge>
    );
  if (pl.is_active)
    return (
      <AnimatedBadge size="sm" status="warning" icon={<CircleAlert className="h-3 w-3" />} title="Đang phát nhưng không màn hình nào được gán">
        Đang phát · chưa gán thiết bị
      </AnimatedBadge>
    );
  if (screens)
    return (
      <AnimatedBadge size="sm" status="neutral" icon={<Square className="h-3 w-3" />} title="Các màn hình này đang đứng yên">
        Đang dừng · {screens} thiết bị
      </AnimatedBadge>
    );
  return (
    <AnimatedBadge size="sm" status="neutral" showIcon={false}>
      Chưa phát
    </AnimatedBadge>
  );
}

export default function PlaylistsListPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<PlaylistPublic[]>([]);
  const [screens, setScreens] = useState<ScreenPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [publishing, setPublishing] = useState<PlaylistPublic | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [pls, scr] = await Promise.all([api.listPlaylists(), api.listScreens().catch(() => [])]);
      setPlaylists(pls);
      setScreens(scr);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useRefresh(refresh);

  const flash = (msg: string) => {
    setInfo(msg);
    setTimeout(() => setInfo((cur) => (cur === msg ? null : cur)), 3500);
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

  const onAir = playlists.find((p) => p.is_active) ?? null;
  // Screens left on a playlist that is not on air show nothing. They are the
  // usual reason "a connected screen does not play", so they are counted here.
  const idleScreens = screens.filter((s) => !s.playlist_on_air);
  const onlineCount = screens.filter((s) => s.online).length;

  const handleDelete = (pl: PlaylistPublic) => {
    const live = pl.is_active ? "\n\nPlaylist này đang phát — các màn hình sẽ dừng." : "";
    if (!confirm(`Xoá playlist "${pl.name}"? Media trong thư viện vẫn được giữ.${live}`)) return;
    act(async () => {
      await api.deletePlaylist(pl.id);
      flash(`Đã xoá playlist "${pl.name}".`);
    });
  };

  const handleDuplicate = (pl: PlaylistPublic) =>
    act(async () => {
      const full = await api.getPlaylist(pl.id);
      const copy = await api.createPlaylist({
        name: `${pl.name} (Bản sao)`,
        description: pl.description,
        kind: "slideshow",
        aspect_ratio: pl.aspect_ratio || "FullHD Nghiêng",
        sync_playback: pl.sync_playback,
        fit_screen: pl.fit_screen,
      });
      await api.replacePlaylistItems(
        copy.id,
        full.items.map((it) => ({ creative_id: it.creative_id, duration: it.duration })),
      );
      flash(`Đã nhân bản thành "${copy.name}".`);
    });

  const handleStop = (pl: PlaylistPublic) => {
    if (!confirm(`Dừng phát "${pl.name}" trên tất cả thiết bị?`)) return;
    act(async () => {
      await api.deactivatePlaylist(pl.id);
      flash(`Đã dừng phát "${pl.name}".`);
    });
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return playlists.filter((p) => {
      if (q && !`${p.name} ${p.description || ""}`.toLowerCase().includes(q)) return false;
      if (filterStatus === "on-air" && !p.is_active) return false;
      if (filterStatus === "idle" && p.is_active) return false;
      return true;
    });
  }, [playlists, searchQuery, filterStatus]);

  const rail = (pl: PlaylistPublic) => {
    const items: OverflowActionItem[] = [
      {
        id: "publish",
        label: pl.is_active ? "Thiết bị" : "Phát",
        icon: <Radio className="h-3.5 w-3.5" />,
        disabled: pl.item_count === 0,
        ariaLabel: pl.item_count === 0 ? "Playlist trống — chưa phát được" : "Phát lên thiết bị",
        onClick: () => setPublishing(pl),
        className: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
      },
      {
        id: "edit",
        label: "Sửa",
        icon: <IconEdit className="h-3.5 w-3.5" />,
        iconOnly: true,
        onClick: () => router.push(`/playlists/${pl.id}`),
        className: "bg-slate-100 text-slate-700 hover:bg-slate-200",
      },
      {
        id: "copy",
        label: "Nhân bản",
        icon: <Copy className="h-3.5 w-3.5" />,
        iconOnly: true,
        disabled: busy,
        onClick: () => handleDuplicate(pl),
        className: "bg-slate-100 text-slate-700 hover:bg-slate-200",
      },
      {
        id: "delete",
        label: "Xoá",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        iconOnly: true,
        disabled: busy,
        onClick: () => handleDelete(pl),
        className: "bg-rose-50 text-rose-600 hover:bg-rose-100",
      },
    ];
    return (
      <OverflowActions
        size="sm"
        expanded={openRow === pl.id}
        onExpandedChange={(open) => setOpenRow(open ? pl.id : null)}
        collapseOnAction
        primaryActions={[]}
        overflowActions={items}
        openLabel="Mở thao tác"
        closeLabel="Thu gọn"
        classNames={{ track: "border-slate-200 bg-white shadow-2xs" }}
      />
    );
  };

  const columns: TableColumn<PlaylistPublic>[] = [
    {
      key: "name",
      header: "Playlist",
      sortable: true,
      cell: (pl) => (
        <Link href={`/playlists/${pl.id}`} className="group flex min-w-0 items-center gap-3">
          <Cover pl={pl} className="h-11 w-16 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 group-hover:text-emerald-700">{pl.name}</p>
            <p className="truncate text-[11px] text-slate-400">
              {pl.aspect_ratio || "FullHD Nghiêng"}
            </p>
          </div>
        </Link>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      width: "184px",
      sortable: true,
      sortValue: (pl) => (pl.is_active ? 2 : pl.assigned_screen_ids?.length ? 1 : 0),
      cell: (pl) => <StatusBadge pl={pl} />,
    },
    {
      key: "screens",
      header: "Thiết bị",
      width: "150px",
      cell: (pl) => (
        <span className="line-clamp-2 text-[11px] text-slate-600" title={pl.assigned_screen_names?.join(", ")}>
          {pl.assigned_screen_names?.length ? pl.assigned_screen_names.join(", ") : <span className="text-slate-400">—</span>}
        </span>
      ),
    },
    {
      key: "item_count",
      header: "Media",
      width: "100px",
      align: "right",
      sortable: true,
      cell: (pl) => <span className={cn("tabular font-semibold", pl.item_count ? "text-slate-800" : "text-amber-600")}>{pl.item_count}</span>,
    },
    {
      key: "total_duration",
      header: "Thời lượng",
      width: "128px",
      align: "right",
      sortable: true,
      cell: (pl) => <span className="font-mono text-slate-600 tabular">{formatDuration(pl.total_duration)}</span>,
    },
    {
      key: "created_at",
      header: "Ngày tạo",
      width: "124px",
      sortable: true,
      cell: (pl) => <span className="text-[11px] text-slate-500 tabular">{formatDate(pl.created_at)}</span>,
    },
    {
      key: "actions",
      header: "Thao tác",
      width: "210px",
      align: "right",
      cell: (pl) => <div className="flex justify-end">{rail(pl)}</div>,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      {/* ==================== HEADER ==================== */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              <IconPlaylist className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Playlist</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Sắp xếp media thành danh sách phát và đưa lên màn hình. Mỗi lúc chỉ một playlist được phát.
              </p>
            </div>
          </div>
          <Link
            href="/playlists/new"
            className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 sm:self-auto"
          >
            <IconPlus className="h-4 w-4" />
            Tạo playlist
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Stat label="Tổng số playlist" value={playlists.length} icon={<IconPlaylist className="h-4 w-4" />} />
          <Stat
            label={onAir ? `Đang phát: ${onAir.name}` : "Chưa có playlist nào đang phát"}
            value={onAir ? 1 : 0}
            tone={onAir ? "emerald" : "slate"}
            icon={<Radio className="h-4 w-4" />}
          />
          <Stat label="Thiết bị online" value={`${onlineCount}/${screens.length}`} icon={<Tv className="h-4 w-4" />} />
          <Stat
            label="Thiết bị đứng yên (không có playlist đang phát)"
            value={idleScreens.length}
            tone={idleScreens.length ? "amber" : "slate"}
            icon={<MonitorOff className="h-4 w-4" />}
          />
        </div>
      </section>

      {info && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} aria-label="Đóng">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Đóng">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ==================== ON AIR ==================== */}
      {onAir ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-linear-to-r from-emerald-50 to-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Cover pl={onAir} className="h-16 w-24 shrink-0" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Đang phát
              </p>
              <p className="truncate text-sm font-bold text-slate-900">{onAir.name}</p>
              <p className="truncate text-xs text-slate-500">
                {onAir.item_count} media · {formatDuration(onAir.total_duration)} ·{" "}
                {onAir.assigned_screen_names?.length
                  ? `trên ${onAir.assigned_screen_names.join(", ")}`
                  : "chưa gán màn hình nào — không màn hình nào hiển thị"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPublishing(onAir)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
            >
              <Tv className="h-3.5 w-3.5" /> Chọn thiết bị
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleStop(onAir)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" /> Dừng
            </button>
          </div>
        </section>
      ) : (
        !loading &&
        playlists.length > 0 && (
          <section className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              Chưa có playlist nào đang phát, nên mọi màn hình đã ghép nối đều đứng yên. Bấm{" "}
              <strong>⋯ → Phát</strong> trên một playlist để đưa nó lên thiết bị.
            </p>
          </section>
        )
      )}

      {/* ==================== TOOLBAR ==================== */}
      <section className="relative z-20 flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:flex lg:items-center">
          <Input
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Tìm theo tên playlist…"
            aria-label="Tìm playlist"
            leftIcon={<IconSearch />}
            className="lg:w-72"
            classNames={{ field: "h-9 rounded-xl bg-slate-50/60", input: "text-xs" }}
          />
          <FieldSelect
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as StatusFilter)}
            options={[
              { value: "all", label: "Mọi trạng thái" },
              { value: "on-air", label: "Đang phát" },
              { value: "idle", label: "Không phát" },
            ]}
            className="lg:w-44"
            triggerClassName="bg-slate-50/60"
          />
        </div>
        <span className="text-xs font-medium text-slate-500">
          Hiển thị <strong className="text-slate-900 tabular">{filtered.length}</strong> / {playlists.length}
        </span>
      </section>

      {/* ==================== TABLE ==================== */}
      {!loading && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-bold text-slate-800">
            {playlists.length ? "Không có playlist nào khớp bộ lọc" : "Chưa có playlist nào"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {playlists.length ? "Thử bỏ bớt bộ lọc hoặc đổi từ khoá." : "Tạo playlist đầu tiên rồi thêm media từ thư viện."}
          </p>
          {!playlists.length && (
            <Link
              href="/playlists/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
            >
              <IconPlus className="h-3.5 w-3.5" /> Tạo playlist
            </Link>
          )}
        </div>
      ) : (
        <Table
          data={filtered}
          columns={columns}
          getRowId={(pl) => String(pl.id)}
          defaultSort={{ key: "status", direction: "desc" }}
          rowHeight={68}
          loading={loading}
          height={Math.min(720, 92 + Math.max(filtered.length, 3) * 68)}
          className="rounded-2xl border border-slate-200/90 bg-white text-xs shadow-xs"
        />
      )}

      {publishing && (
        <SelectScreenModal
          playlist={publishing}
          onClose={() => setPublishing(null)}
          onSuccess={() => {
            const name = publishing.name;
            setPublishing(null);
            refresh();
            flash(`Đã cập nhật phát "${name}".`);
          }}
        />
      )}
    </main>
  );
}
