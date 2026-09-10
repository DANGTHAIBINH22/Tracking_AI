"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDEBAR_NAV_ITEMS, SECONDARY_ITEMS } from "./sidebar-config";
import {
  IconOverview,
  IconMedia,
  IconPlaylist,
  IconDevices,
  IconTV,
  IconPlus,
} from "@/components/icons/Icons";

interface SidebarNavProps {
  onOpenScreenModal: () => void;
  onItemClick?: () => void;
}

export function SidebarNav({ onOpenScreenModal, onItemClick }: SidebarNavProps) {
  const pathname = usePathname();

  const getIcon = (href: string) => {
    switch (href) {
      case "/":
        return <IconOverview className="h-5 w-5 shrink-0" />;
      case "/ads":
        return <IconMedia className="h-5 w-5 shrink-0" />;
      case "/playlists":
        return <IconPlaylist className="h-5 w-5 shrink-0" />;
      case "/admin":
        return <IconDevices className="h-5 w-5 shrink-0" />;
      default:
        return <IconOverview className="h-5 w-5 shrink-0" />;
    }
  };

  return (
    <nav className="flex-1 space-y-6 px-3 py-4 text-xs font-medium">
      {/* Primary menu */}
      <div className="space-y-1">
        <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Menu chính
        </span>
        <div className="space-y-1 pt-1.5">
          {SIDEBAR_NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition duration-150 ${
                  isActive
                    ? "bg-emerald-500/10 font-semibold text-emerald-700 shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span
                  className={`transition duration-150 ${
                    isActive
                      ? "text-emerald-600"
                      : "text-slate-400 group-hover:text-slate-600"
                  }`}
                >
                  {getIcon(item.href)}
                </span>
                <span className="text-sm">{item.label}</span>
                {isActive && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-600" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Screens & Devices Section */}
      <div className="space-y-1">
        <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Màn hình & Trình chiếu
        </span>
        <div className="space-y-1 pt-1.5">
          <button
            type="button"
            onClick={() => {
              if (onItemClick) onItemClick();
              onOpenScreenModal();
            }}
            className="group flex w-full items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-left text-indigo-700 transition hover:bg-indigo-100/70"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-200/70 text-indigo-700">
              <IconPlus className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold">Ghép nối TV mới</span>
          </button>

          {SECONDARY_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2 transition ${
                  isActive
                    ? "bg-emerald-50 font-semibold text-emerald-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span
                  className={`transition ${
                    isActive
                      ? "text-emerald-600"
                      : "text-slate-400 group-hover:text-slate-600"
                  }`}
                >
                  <IconTV className="h-4 w-4" />
                </span>
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
