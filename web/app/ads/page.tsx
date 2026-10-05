"use client";

import { useRefresh } from "@/lib/useRefresh";
import {
  Creative,
  CreativeProfileResult,
  PlaylistPublic,
  api,
  mediaUrl,
} from "@/lib/api";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, Globe, Play, Radio, ScanSearch, Target, WandSparkles } from "lucide-react";
import {
  IconClock,
  IconClose,
  IconEdit,
  IconGrid,
  IconImage,
  IconList,
  IconMedia,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconVideo,
} from "@/components/icons/Icons";
import { UploadMediaModal } from "@/components/UploadMediaModal";
import { EditMediaModal } from "@/components/EditMediaModal";
import { FieldSelect } from "@/components/FieldSelect";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Drawer } from "@/components/motion/drawer";
import { Input } from "@/components/motion/input";
import {
  ImageViewer,
  ImageViewerContent,
  ImageViewerThumbnail,
  type ImageViewerImage,
} from "@/components/motion/image-viewer";
import { OverflowActions, type OverflowActionItem } from "@/components/motion/overflow-actions";
import { Table, type TableColumn } from "@/components/motion/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import {
  AGE_OPTIONS,
  ANY,
  CATEGORY_OPTIONS,
  GENDER_OPTIONS,
  PET_OPTIONS,
  STYLE_OPTIONS,
  WEATHER_OPTIONS,
  tagsLabel,
  type Option,
} from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  name: "đoán từ tên tệp",
  faces: "đo khuôn mặt trong video",
  vlm: "AI đọc nội dung",
  "faces+vlm": "đo khuôn mặt + AI đọc nội dung",
  none: "không đọc được gì",
};

/** A proposal from either AI tool. Neither writes anything: the operator sees
 *  current → proposed and applies it, the same contract `/analyze` already had. */
type Proposal = Pick<
  CreativeProfileResult,
  "category" | "target_age_group" | "target_gender" | "notes"
> & { source: CreativeProfileResult["source"] | "name" };

type KindFilter = "all" | "video" | "image" | "web";
type StatusFilter = "all" | "on-air" | "untargeted";

/** The smart scorer (server/audience.coverage) matches age and gender against
 *  the people in front of the screen. An advert with both at "all" sits at the
 *  neutral score: it plays in normal rotation and is never prioritised. */
function isUntargeted(c: Creative) {
  return (c.target_age_group || ANY) === ANY && (c.target_gender || ANY) === ANY;
}

function formatDuration(sec: number) {
  if (sec < 60) return `${Number(sec.toFixed(1))}s`;
  const whole = Math.round(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function formatTotal(sec: number) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}p ${rem > 0 ? `${rem}s` : ""}`.trim();
}

/** Short chip text, without the long parenthetical; several values joined. */
function shortLabel(options: Option[], value: string) {
  return tagsLabel(options, value);
}

// ───────────────────────────── small pieces ─────────────────────────────

function Thumb({ item, className }: { item: Creative; className?: string }) {
  if (item.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mediaUrl(item.url)} alt={item.name} className={cn("h-full w-full object-contain", className)} />
    );
  }
  if (item.kind === "video") {
    // `#t=` plus metadata preload makes the browser paint a real frame; a bare
    // <video> paints black until it is played, which is every card here.
    return (
      <video
        src={`${mediaUrl(item.url)}#t=0.5`}
        muted
        playsInline
        preload="metadata"
        className={cn("h-full w-full object-contain", className)}
      />
    );
  }
  let host = item.url;
  try {
    host = new URL(item.url).host;
  } catch {
    // a relative or malformed URL: show it as stored
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
      <Globe className="h-6 w-6" />
      <span className="max-w-[90%] truncate text-[10px]">{host}</span>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, { label: string; icon: ReactNode }> = {
    video: { label: "Video", icon: <IconVideo className="h-3 w-3" /> },
    image: { label: "Ảnh", icon: <IconImage className="h-3 w-3" /> },
    web: { label: "Web", icon: <Globe className="h-3 w-3" /> },
  };
  const k = map[kind] ?? { label: kind, icon: null };
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-xs">
      {k.icon}
      {k.label}
    </span>
  );
}

/** Every target the scorer reads, as compact chips. Only non-default values
 *  are shown so a glance tells what the advert is actually aimed at. */
function TargetChips({ item, skip = [] }: { item: Creative; skip?: string[] }) {
  const chips: { key: string; text: string }[] = [];
  const push = (key: string, value: string | undefined, options: Option[]) => {
    if (!skip.includes(key) && value && value !== ANY) chips.push({ key, text: shortLabel(options, value) });
  };
  push("age", item.target_age_group, AGE_OPTIONS);
  push("gender", item.target_gender, GENDER_OPTIONS);
  push("weather", item.target_weather, WEATHER_OPTIONS);
  push("pet", item.target_pet, PET_OPTIONS);
  push("style", item.target_style, STYLE_OPTIONS);

  return (
    <div className="flex flex-wrap gap-1">
      {!skip.includes("category") && (
        <AnimatedBadge size="sm" status="neutral" showIcon={false} className="rounded-md">
          {item.category || "Chung"}
        </AnimatedBadge>
      )}
      {chips.map((c) => (
        <AnimatedBadge
          key={c.key}
          size="sm"
          status="info"
          showIcon={false}
          className="rounded-md border-indigo-200 bg-indigo-50 text-indigo-700"
        >
          {c.text}
        </AnimatedBadge>
      ))}
      {isUntargeted(item) && (
        <AnimatedBadge
          size="sm"
          status="warning"
          icon={<CircleAlert className="h-3 w-3" />}
          className="rounded-md"
          title="Độ tuổi và giới tính đều là 'Tất cả': quảng cáo này phát theo vòng bình thường, không được ưu tiên cho nhóm khán giả nào."
        >
          Chưa nhắm đối tượng
        </AnimatedBadge>
      )}
    </div>
  );
}

/** current → proposed, so applying is a decision rather than a blind click. */
function ProposalPanel({
  item,
  proposal,
  onApply,
  onDismiss,
  busy,
}: {
  item: Creative;
  proposal: Proposal;
  onApply: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const rows = [
    { label: "Thể loại", now: item.category || "Chung", next: proposal.category },
    {
      label: "Độ tuổi",
      now: shortLabel(AGE_OPTIONS, item.target_age_group || ANY),
      next: proposal.target_age_group && shortLabel(AGE_OPTIONS, proposal.target_age_group),
    },
    {
      label: "Giới tính",
      now: shortLabel(GENDER_OPTIONS, item.target_gender || ANY),
      next: proposal.target_gender && shortLabel(GENDER_OPTIONS, proposal.target_gender),
    },
  ];
  const changes = rows.filter((r) => r.next && r.next !== r.now);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-[11px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold text-violet-900">
          <IconSparkles className="h-3.5 w-3.5 shrink-0 text-violet-600" />
          <span className="truncate">Đề xuất · {SOURCE_LABELS[proposal.source] ?? proposal.source}</span>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng đề xuất"
          className="rounded-md p-0.5 text-violet-400 transition hover:bg-violet-100 hover:text-violet-700"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {changes.length ? (
        <ul className="space-y-1">
          {changes.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{r.label}</span>
              <span className="truncate text-right">
                <span className="text-slate-400 line-through">{r.now}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="font-semibold text-slate-900">{r.next}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500">Không có gì khác với cấu hình hiện tại.</p>
      )}

      {proposal.notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-violet-200/60 pt-1.5 text-[10px] text-slate-500">
          {proposal.notes.map((note, i) => (
            <li key={i}>• {note}</li>
          ))}
        </ul>
      )}

      {changes.length > 0 && (
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
          className="mt-2.5 w-full rounded-lg bg-violet-600 py-1.5 text-[11px] font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          Áp dụng {changes.length} thay đổi
        </button>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
  icon,
  title,
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "amber";
  icon: ReactNode;
  title?: string;
}) {
  const tones = {
    slate: "bg-slate-50 text-slate-600 ring-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return (
    <div title={title} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1", tones[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-slate-900 tabular">{value}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ───────────────────────────── page ─────────────────────────────

export default function MediaLibraryPage() {
  const [ads, setAds] = useState<Creative[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistPublic[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<number, Proposal>>({});
  const [working, setWorking] = useState<{ id: number; tool: "name" | "scan" } | null>(null);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<KindFilter>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingMedia, setEditingMedia] = useState<Creative | null>(null);
  const [targetCreative, setTargetCreative] = useState<Creative | null>(null);
  // One row's action rail open at a time, so the table never fills with them.
  const [openRow, setOpenRow] = useState<number | null>(null);
  // The viewer morphs from the thumbnail and needs each media's real aspect
  // ratio; it is read from the thumbnail as it loads, 16:9 until then.
  const [dims, setDims] = useState<Record<number, [number, number]>>({});
  const measure = useCallback((id: number, w: number, h: number) => {
    if (w > 0 && h > 0)
      setDims((prev) => (prev[id]?.[0] === w && prev[id]?.[1] === h ? prev : { ...prev, [id]: [w, h] }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [allAds, allPlaylists] = await Promise.all([api.listAds(), api.listPlaylists()]);
      setAds(allAds);
      setPlaylists(allPlaylists);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useRefresh(refresh);

  const flash = (msg: string, ms = 4000) => {
    setInfo(msg);
    setTimeout(() => setInfo((cur) => (cur === msg ? null : cur)), ms);
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

  const dropProposal = (id: number) =>
    setProposals((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  // Smart selection only ever scores the active playlist (PlaylistPlayer.playlist),
  // so whether an advert is on air decides whether its targets matter at all.
  const activePlaylist = playlists.find((p) => p.is_active) ?? null;
  const onAir = useMemo(
    () => new Set((activePlaylist?.items ?? []).map((i) => i.creative_id)),
    [activePlaylist],
  );

  const handleSuggestByName = async (ad: Creative) => {
    setWorking({ id: ad.id, tool: "name" });
    setError(null);
    try {
      const res = await api.suggestTarget(ad.name);
      // "all"/"Chung" is the matcher finding no keyword. Proposing it would
      // overwrite a target someone chose by hand with "no target".
      const proposal: Proposal = {
        source: "name",
        category: res.category && res.category !== "Chung" ? res.category : null,
        target_age_group: res.target_age_group !== ANY ? res.target_age_group : null,
        target_gender: res.target_gender !== ANY ? res.target_gender : null,
        notes: res.reason ? [res.reason] : [],
      };
      setProposals((prev) => ({ ...prev, [ad.id]: proposal }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const handleScan = async (ad: Creative) => {
    setWorking({ id: ad.id, tool: "scan" });
    setError(null);
    try {
      const res = await api.analyzeAd(ad.id);
      setProposals((prev) => ({ ...prev, [ad.id]: res }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const applyProposal = (ad: Creative, p: Proposal) => {
    const patch: Parameters<typeof api.updateAd>[1] = {};
    if (p.category) patch.category = p.category;
    if (p.target_age_group) patch.target_age_group = p.target_age_group;
    if (p.target_gender) patch.target_gender = p.target_gender;
    if (Object.keys(patch).length === 0) return;
    act(async () => {
      await api.updateAd(ad.id, patch);
      dropProposal(ad.id);
      flash(`Đã áp dụng đề xuất cho "${ad.name}".`);
    });
  };

  const remove = (ad: Creative) => {
    const live = onAir.has(ad.id) ? "\n\nTệp này đang nằm trong playlist đang phát." : "";
    if (confirm(`Xoá vĩnh viễn "${ad.name}"? Tệp và toàn bộ dữ liệu đo sẽ bị xoá.${live}`)) {
      act(() => api.deleteAd(ad.id));
    }
  };

  const handleAddMediaToPlaylist = (playlistId: number, creativeId: number) =>
    act(async () => {
      const pl = playlists.find((p) => p.id === playlistId);
      await api.addPlaylistItem(playlistId, creativeId);
      setTargetCreative(null);
      flash(`Đã thêm vào playlist "${pl?.name || "được chọn"}".`, 3000);
    });

  // A category typed through the URL form, or saved before the vocabulary was
  // fixed, is still a real value — offer it so it can be filtered on.
  const categoryOptions: Option[] = useMemo(() => {
    const extra = [...new Set(ads.map((a) => a.category || "Chung"))].filter((c) => !CATEGORY_OPTIONS.includes(c));
    return [
      { value: "all", label: "Tất cả thể loại" },
      ...[...CATEGORY_OPTIONS, ...extra].map((c) => ({ value: c, label: c })),
    ];
  }, [ads]);

  const filteredMedia = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ads.filter((item) => {
      if (filterKind !== "all" && item.kind !== filterKind) return false;
      if (filterCategory !== "all" && (item.category || "Chung") !== filterCategory) return false;
      if (filterStatus === "on-air" && !onAir.has(item.id)) return false;
      if (filterStatus === "untargeted" && !isUntargeted(item)) return false;
      if (q) {
        const hay = `${item.name} ${item.category || ""} ${item.filename || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ads, filterKind, filterCategory, filterStatus, searchQuery, onAir]);

  const viewerItems: ImageViewerImage[] = useMemo(
    () =>
      filteredMedia
        .filter((m) => m.kind === "image" || m.kind === "video")
        .map((m) => ({
          id: String(m.id),
          src: mediaUrl(m.url),
          alt: m.name,
          kind: m.kind as "image" | "video",
          width: dims[m.id]?.[0] ?? 16,
          height: dims[m.id]?.[1] ?? 9,
          caption: `${m.name} · ${formatDuration(m.duration)}`,
        })),
    [filteredMedia, dims],
  );

  const untargetedOnAir = ads.filter((a) => onAir.has(a.id) && isUntargeted(a)).length;

  /** Every per-media action, shared by the card rail and the table rail. */
  const actionItems = (item: Creative): OverflowActionItem[] => {
    const mine = working?.id === item.id;
    return [
      {
        id: "name",
        label: mine && working.tool === "name" ? "Đang đoán…" : "Gợi ý theo tên",
        icon: <WandSparkles className="h-3.5 w-3.5" />,
        iconOnly: true,
        disabled: working !== null,
        onClick: () => handleSuggestByName(item),
        className: "bg-amber-50 text-amber-700 hover:bg-amber-100",
      },
      {
        id: "scan",
        label: mine && working.tool === "scan" ? "Đang quét…" : "Quét nội dung",
        icon: <ScanSearch className="h-3.5 w-3.5" />,
        iconOnly: true,
        disabled: working !== null || item.kind === "web",
        onClick: () => handleScan(item),
        className: "bg-violet-50 text-violet-700 hover:bg-violet-100",
      },
      {
        id: "edit",
        label: "Sửa",
        icon: <IconEdit className="h-3.5 w-3.5" />,
        iconOnly: true,
        onClick: () => setEditingMedia(item),
        className: "bg-slate-100 text-slate-700 hover:bg-slate-200",
      },
      {
        id: "playlist",
        label: "Playlist",
        icon: <IconPlus className="h-3.5 w-3.5" />,
        onClick: () => setTargetCreative(item),
        className: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
      },
      {
        id: "delete",
        label: "Xoá",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        iconOnly: true,
        disabled: busy,
        onClick: () => remove(item),
        className: "bg-rose-50 text-rose-600 hover:bg-rose-100",
      },
    ];
  };

  /** Collapsed to one button until clicked; one rail open on the page at a time. */
  const actionRail = (item: Creative, primary: string[] = []) => {
    const items = actionItems(item);
    return (
      <OverflowActions
        size="sm"
        expanded={openRow === item.id}
        onExpandedChange={(open) => setOpenRow(open ? item.id : null)}
        collapseOnAction
        primaryActions={items.filter((a) => primary.includes(a.id))}
        overflowActions={items.filter((a) => !primary.includes(a.id))}
        openLabel="Mở thao tác"
        closeLabel="Thu gọn"
        classNames={{ track: "border-slate-200 bg-white shadow-2xs" }}
      />
    );
  };

  /** A thumbnail that opens the shared viewer; web pages have nothing to preview. */
  const preview = (item: Creative, className: string, children?: ReactNode) =>
    item.kind === "image" || item.kind === "video" ? (
      <ImageViewerThumbnail
        imageId={String(item.id)}
        onMeasure={(w, h) => measure(item.id, w, h)}
        className={cn("group/thumb relative overflow-hidden bg-slate-950", className)}
        imageClassName="h-full w-full object-contain"
      >
        {item.kind === "video" && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-xs transition group-hover/thumb:scale-110">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
        )}
        {children}
      </ImageViewerThumbnail>
    ) : (
      <div className={cn("relative overflow-hidden bg-slate-950", className)}>
        <Thumb item={item} />
        {children}
      </div>
    );

  const columns: TableColumn<Creative>[] = [
    {
      key: "name",
      header: "Media",
      sortable: true,
      cell: (item) => (
        <div className="flex min-w-0 items-center gap-3">
          {preview(item, "aspect-video w-20 shrink-0 rounded-md border border-slate-200")}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-semibold text-slate-900">
              <span className="truncate">{item.name}</span>
              {onAir.has(item.id) && <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Đang phát" />}
            </p>
            <p className="truncate text-[10px] text-slate-400">{item.filename}</p>
          </div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Loại",
      width: "90px",
      sortable: true,
      cell: (item) => <span className="capitalize text-slate-600">{item.kind === "image" ? "Ảnh" : item.kind}</span>,
    },
    {
      key: "duration",
      header: "Thời lượng",
      width: "100px",
      align: "right",
      sortable: true,
      cell: (item) => <span className="font-mono text-slate-700 tabular">{formatDuration(item.duration)}</span>,
    },
    {
      key: "targets",
      header: "Đối tượng nhắm tới",
      width: "34%",
      sortValue: (item) => (isUntargeted(item) ? 0 : 1),
      sortable: true,
      cell: (item) => <TargetChips item={item} />,
    },
    {
      key: "actions",
      header: "Thao tác",
      width: "290px",
      align: "right",
      cell: (item) => <div className="flex justify-end">{actionRail(item)}</div>,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* ==================== HEADER ==================== */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20">
              <IconMedia className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Thư viện Media</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Tải lên quảng cáo, gắn đối tượng nhắm tới và đưa vào playlist. Đối tượng gắn ở đây là thứ bộ chọn quảng
                cáo thông minh dùng để chấm điểm.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <IconUpload className="h-4 w-4" />
              Tải lên media
            </button>
            <Link
              href="/playlists/new"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
            >
              <IconPlus className="h-4 w-4" />
              Tạo playlist
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Stat label="Tổng số media" value={ads.length} icon={<IconMedia className="h-4 w-4" />} />
          <Stat
            label={activePlaylist ? "Trong playlist đang phát" : "Chưa có playlist đang phát"}
            title={activePlaylist?.name}
            value={onAir.size}
            tone="emerald"
            icon={<Radio className="h-4 w-4" />}
          />
          <Stat
            label="Đã nhắm đối tượng"
            value={ads.filter((a) => !isUntargeted(a)).length}
            icon={<Target className="h-4 w-4" />}
          />
          <Stat
            label="Đang phát nhưng chưa nhắm"
            value={untargetedOnAir}
            tone={untargetedOnAir ? "amber" : "slate"}
            icon={<CircleAlert className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* The smart picker scores only the active playlist; with nothing in it
          every tag on this page is inert, and that is not visible anywhere else. */}
      {(!activePlaylist || onAir.size === 0) && ads.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            {activePlaylist ? (
              <>
                Playlist đang phát <strong>“{activePlaylist.name}”</strong> chưa có media nào.
              </>
            ) : (
              <>Chưa có playlist nào đang phát.</>
            )}{" "}
            Chọn quảng cáo thông minh chỉ chấm điểm các media trong playlist đang phát, nên lúc này nó không có gì để
            chọn. Bấm “Playlist” trên từng media để thêm vào.
          </p>
        </div>
      )}

      {/* Notifications */}
      {info && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} aria-label="Đóng" className="text-emerald-700 hover:text-emerald-950">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Đóng" className="text-rose-700 hover:text-rose-950">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}

      <UploadMediaModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={(count) => {
          flash(`Đã tải lên ${count} tệp vào thư viện.`);
          refresh();
        }}
      />

      <EditMediaModal
        key={editingMedia?.id ?? "closed"}
        isOpen={Boolean(editingMedia)}
        media={editingMedia}
        onClose={() => setEditingMedia(null)}
        onSaveSuccess={async () => {
          await refresh();
          flash("Đã lưu thuộc tính media.");
        }}
      />

      {/* ==================== TOOLBAR ==================== */}
      <section className="relative z-20 flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs sm:p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <Input
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Tìm theo tên, tệp, thể loại…"
            aria-label="Tìm kiếm media"
            leftIcon={<IconSearch />}
            className="sm:col-span-2 lg:w-72"
            classNames={{ field: "h-9 rounded-xl bg-slate-50/60", input: "text-xs" }}
          />
          <FieldSelect
            value={filterKind}
            onChange={(v) => setFilterKind(v as KindFilter)}
            options={[
              { value: "all", label: "Tất cả định dạng" },
              { value: "video", label: "Video" },
              { value: "image", label: "Hình ảnh" },
              { value: "web", label: "Trang web" },
            ]}
            className="lg:w-44"
            triggerClassName="bg-slate-50/60"
          />
          <FieldSelect
            value={filterCategory}
            onChange={setFilterCategory}
            options={categoryOptions}
            className="lg:w-52"
            triggerClassName="bg-slate-50/60"
          />
          <FieldSelect
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as StatusFilter)}
            options={[
              { value: "all", label: "Mọi trạng thái" },
              { value: "on-air", label: "Đang trong playlist phát" },
              { value: "untargeted", label: "Chưa nhắm đối tượng" },
            ]}
            className="lg:w-52"
            triggerClassName="bg-slate-50/60"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs xl:border-t-0 xl:pt-0">
          <span className="font-medium text-slate-500">
            Hiển thị <strong className="text-slate-900 tabular">{filteredMedia.length}</strong> / {ads.length}
          </span>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list")} variant="segment">
            <TabsList className="border border-slate-200 bg-slate-100">
              <TabsTrigger value="grid">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <IconGrid className="h-3.5 w-3.5" /> Lưới
                </span>
              </TabsTrigger>
              <TabsTrigger value="list">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <IconList className="h-3.5 w-3.5" /> Danh sách
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </section>

      {/* ==================== ITEMS ==================== */}
      <ImageViewer images={viewerItems} label="Xem trước media">
      {!filteredMedia.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-bold text-slate-800">
            {ads.length ? "Không có media nào khớp bộ lọc" : "Thư viện đang trống"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {ads.length
              ? "Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm."
              : "Bấm “Tải lên media” để thêm video hoặc hình ảnh quảng cáo đầu tiên."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
          {filteredMedia.map((item) => (
            <article
              key={item.id}
              className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs transition hover:border-emerald-300 hover:shadow-md"
            >
              {preview(
                item,
                "aspect-video w-full rounded-xl",
                <>
                  <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
                    <KindBadge kind={item.kind} />
                    <span className="inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular backdrop-blur-xs">
                      <IconClock className="h-3 w-3" />
                      {formatDuration(item.duration)}
                    </span>
                  </div>
                  {onAir.has(item.id) && (
                    <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <Radio className="h-3 w-3" /> Đang phát
                    </span>
                  )}
                </>,
              )}

              <button
                type="button"
                onClick={() => setEditingMedia(item)}
                title="Bấm để sửa thuộc tính"
                className="mt-3 min-w-0 rounded-md px-1 text-left transition hover:bg-slate-50"
              >
                <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                <p className="truncate text-[10px] text-slate-400">{item.filename}</p>
              </button>

              <div className="mt-2 px-1">
                <TargetChips item={item} />
              </div>

              {proposals[item.id] && (
                <div className="mt-2.5 px-1">
                  <ProposalPanel
                    item={item}
                    proposal={proposals[item.id]}
                    onApply={() => applyProposal(item, proposals[item.id])}
                    onDismiss={() => dropProposal(item.id)}
                    busy={busy}
                  />
                </div>
              )}

              <div className="mt-auto pt-3">
                <div className="flex justify-end border-t border-slate-100 pt-3">
                  {actionRail(item, ["playlist"])}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="space-y-3">
          <Table
            data={filteredMedia}
            columns={columns}
            getRowId={(row) => String(row.id)}
            rowHeight={76}
            // Header row plus every body row, capped; the old 48px guess for the
            // header clipped the last row.
            height={Math.min(760, 92 + filteredMedia.length * 76)}
            className="rounded-2xl border border-slate-200/90 bg-white text-xs shadow-xs"
          />
          {/* Proposals are taller than a virtualised row, so they open here. */}
          {filteredMedia
            .filter((item) => proposals[item.id])
            .map((item) => (
              <div key={item.id} className="max-w-lg">
                <p className="mb-1 text-xs font-semibold text-slate-700">{item.name}</p>
                <ProposalPanel
                  item={item}
                  proposal={proposals[item.id]}
                  onApply={() => applyProposal(item, proposals[item.id])}
                  onDismiss={() => dropProposal(item.id)}
                  busy={busy}
                />
              </div>
            ))}
        </section>
      )}

      <ImageViewerContent />
      </ImageViewer>

      {/* ==================== ADD TO PLAYLIST ==================== */}
      <Drawer
        open={Boolean(targetCreative)}
        onOpenChange={(open) => !open && setTargetCreative(null)}
        ariaLabel="Thêm vào playlist"
        className="flex w-full max-w-md flex-col bg-white"
      >
        {targetCreative && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Thêm vào playlist</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">{targetCreative.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setTargetCreative(null)}
                aria-label="Đóng"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-5">
              {isUntargeted(targetCreative) && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Media này chưa nhắm đối tượng. Trong playlist đang phát, chọn quảng cáo thông minh chỉ dùng nó làm
                  quảng cáo đại trà.
                </p>
              )}
              {playlists.map((pl) => {
                const count = pl.items?.filter((i) => i.creative_id === targetCreative.id).length ?? 0;
                return (
                  <div
                    key={pl.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 transition hover:bg-slate-100/70"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-900">
                        <span className="truncate">{pl.name}</span>
                        {pl.is_active && (
                          <AnimatedBadge size="sm" status="success" showIcon={false} className="h-5 rounded px-1.5 text-[9px]">
                            ĐANG PHÁT
                          </AnimatedBadge>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {pl.item_count} clip · {formatTotal(pl.total_duration)}
                        {count > 0 && <span className="text-emerald-700"> · đã có {count} lần</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAddMediaToPlaylist(pl.id, targetCreative.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <IconPlus className="h-3 w-3" />
                      {count > 0 ? "Thêm lần nữa" : "Thêm"}
                    </button>
                  </div>
                );
              })}
              {!playlists.length && (
                <p className="py-6 text-center text-xs text-slate-500">Chưa có playlist nào.</p>
              )}
            </div>

            <div className="border-t border-slate-100 p-5">
              <Link
                href="/playlists/new"
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
              >
                <IconPlus className="h-3.5 w-3.5" />
                Tạo playlist mới
              </Link>
            </div>
          </>
        )}
      </Drawer>
    </main>
  );
}
