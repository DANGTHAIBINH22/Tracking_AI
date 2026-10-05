"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Dock, DockItem, DockSeparator } from "@/components/motion/dock";
import { ScreenManagerModal } from "@/components/ScreenManagerModal";
import { TrackingControlButton } from "@/components/TrackingControlButton";
import {
  IconBrand,
  IconDevices,
  IconLogout,
  IconMedia,
  IconOverview,
  IconPlaylist,
  IconPlus,
  IconTV,
} from "@/components/icons/Icons";
import { api, clearAuthSession, getAuthToken, getStoredUser, setStoredUser } from "@/lib/api";
import { useStoredUser } from "@/lib/useBrowserState";
import { cn } from "@/lib/utils";
import { SECONDARY_ITEMS, SIDEBAR_NAV_ITEMS } from "./sidebar-config";

const NAV_ICONS: Record<string, (p: { className?: string }) => ReactNode> = {
  "/": IconOverview,
  "/ads": IconMedia,
  "/playlists": IconPlaylist,
  "/admin": IconDevices,
};

type Orientation = "vertical" | "horizontal";

/**
 * The app's navigation as a dock: a vertical rail on the left on desktop
 * (~72px instead of the old 256px sidebar), a bar along the bottom on phones.
 * Labels live in hover tooltips, the active page under a gliding pill.
 */
export function DockNav({ orientation }: { orientation: Orientation }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useStoredUser();
  const [showScreenModal, setShowScreenModal] = useState(false);
  const vertical = orientation === "vertical";

  // Validate the stored session once; useStoredUser follows the result.
  useEffect(() => {
    if (!getAuthToken()) {
      if (getStoredUser()) clearAuthSession();
      return;
    }
    api
      .me()
      .then((user) => setStoredUser(user))
      .catch(() => clearAuthSession());
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // the local session is cleared regardless
    } finally {
      clearAuthSession();
      router.replace("/login");
    }
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const link = "flex h-full w-full items-center justify-center rounded-xl transition-colors";

  return (
    <>
      <Dock
        // A phone bar has room for ~7 items at 40px; the rail can afford 44.
        size={vertical ? 44 : 40}
        className={cn(
          "border-slate-200/80 bg-white/85 shadow-xl shadow-slate-900/5",
          vertical ? "flex-col items-center gap-1 px-1.5 py-2" : "items-center gap-0.5 px-1.5 py-1",
        )}
      >
        {vertical && (
          <>
            <DockItem>
              <Tip label="Tapio Analytics · Smart Retail AI" vertical={vertical}>
                <Link
                  href="/"
                  aria-label="Tapio Analytics"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-md shadow-emerald-700/20"
                >
                  <IconBrand className="h-6 w-6 text-white" />
                </Link>
              </Tip>
            </DockItem>
            <Sep vertical={vertical} />
          </>
        )}

        {SIDEBAR_NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.href] ?? IconOverview;
          const active = isActive(item.href, item.exact);
          return (
            <DockItem key={item.href} active={active}>
              <Tip label={item.label} vertical={vertical}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(link, active ? "text-emerald-700" : "text-slate-500 hover:text-slate-900")}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              </Tip>
            </DockItem>
          );
        })}

        <Sep vertical={vertical} />

        <DockItem>
          <Tip label="Ghép nối TV mới" vertical={vertical}>
            <button
              type="button"
              aria-label="Ghép nối TV mới"
              onClick={() => setShowScreenModal(true)}
              className={cn(link, "text-indigo-600 hover:bg-indigo-50")}
            >
              <IconPlus className="h-5 w-5" />
            </button>
          </Tip>
        </DockItem>
        {vertical && SECONDARY_ITEMS.map((item) => (
          <DockItem key={item.href} active={pathname === item.href}>
            <Tip label={item.label} vertical={vertical}>
              <Link href={item.href} aria-label={item.label} className={cn(link, "text-slate-500 hover:text-slate-900")}>
                <IconTV className="h-5 w-5" />
              </Link>
            </Tip>
          </DockItem>
        ))}

        <Sep vertical={vertical} />

        <DockItem>
          <Tip label="Bật / tạm dừng tracking camera" vertical={vertical}>
            <TrackingControlButton variant="icon" />
          </Tip>
        </DockItem>

        {currentUser ? (
          <>
            {vertical && (
            <DockItem>
              <Tip
                label={`${currentUser.full_name || currentUser.username} · ${
                  currentUser.role === "admin" ? "Quản trị viên" : "Người dùng"
                }`}
                vertical={vertical}
              >
                <span
                  aria-label={currentUser.full_name || currentUser.username}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 ring-2 ring-emerald-500/20"
                >
                  {(currentUser.full_name || currentUser.username || "A").charAt(0).toUpperCase()}
                </span>
              </Tip>
            </DockItem>
            )}
            <DockItem>
              <Tip label="Đăng xuất" vertical={vertical}>
                <button
                  type="button"
                  aria-label="Đăng xuất"
                  onClick={logout}
                  className={cn(link, "text-slate-400 hover:bg-rose-50 hover:text-rose-600")}
                >
                  <IconLogout className="h-5 w-5" />
                </button>
              </Tip>
            </DockItem>
          </>
        ) : (
          <DockItem>
            <Tip label="Đăng nhập" vertical={vertical}>
              <Link href="/login" aria-label="Đăng nhập" className={cn(link, "text-slate-500 hover:text-slate-900")}>
                <IconLogout className="h-5 w-5 rotate-180" />
              </Link>
            </Tip>
          </DockItem>
        )}
      </Dock>

      <ScreenManagerModal isOpen={showScreenModal} onClose={() => setShowScreenModal(false)} />
    </>
  );
}

/** The item's name on hover/focus: to the right of a vertical dock, above a horizontal one. */
function Tip({ label, vertical, children }: { label: string; vertical: boolean; children: ReactNode }) {
  return (
    <span className="group/tip relative flex h-full w-full items-center justify-center">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          vertical ? "left-full ml-3" : "bottom-full mb-3",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function Sep({ vertical }: { vertical: boolean }) {
  return <DockSeparator className={vertical ? "mx-0 my-1 h-px w-6" : undefined} />;
}
