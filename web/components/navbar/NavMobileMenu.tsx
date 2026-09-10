"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MAIN_NAV_ITEMS, SCREEN_OPTIONS } from "./nav-config";
import { TrackingControlButton } from "@/components/TrackingControlButton";
import { UserPublic, api, clearAuthSession, getStoredUser } from "@/lib/api";
import { IS_CLERK_ENABLED } from "@/components/ClerkWrapper";
import { ClerkAuthNav } from "@/components/ClerkAuthNav";

interface NavMobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenScreenModal: () => void;
}

export function NavMobileMenu({
  isOpen,
  onClose,
  onOpenScreenModal,
}: NavMobileMenuProps) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);

  useEffect(() => {
    setCurrentUser(getStoredUser());
    const handleAuth = () => setCurrentUser(getStoredUser());
    window.addEventListener("auth-change", handleAuth);
    window.addEventListener("storage", handleAuth);
    return () => {
      window.removeEventListener("auth-change", handleAuth);
      window.removeEventListener("storage", handleAuth);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      clearAuthSession();
      setCurrentUser(null);
      onClose();
      window.location.href = "/login";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="border-t border-slate-200 bg-white/98 backdrop-blur-md px-4 py-3.5 shadow-xl lg:hidden animate-in slide-in-from-top-2 duration-200">
      {/* Tracking Control Mobile */}
      <div className="mb-3 block xs:hidden">
        <TrackingControlButton className="w-full justify-center" />
      </div>

      {/* Main Nav Items */}
      <div className="space-y-1">
        <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Chức năng chính
        </span>
        <nav className="flex flex-col space-y-1 pt-1 text-sm font-medium">
          {MAIN_NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition ${
                  isActive
                    ? "bg-emerald-50 font-semibold text-emerald-700"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Screens Section */}
      <div className="mt-3.5 border-t border-slate-100 pt-3 space-y-1">
        <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Màn hình & Thiết bị TV
        </span>
        <div className="flex flex-col space-y-1 pt-1">
          {SCREEN_OPTIONS.map((opt) => {
            if (opt.action === "modal") {
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenScreenModal();
                  }}
                  className="flex items-center gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-left text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            }

            const isActive = pathname === opt.href;
            return (
              <Link
                key={opt.id}
                href={opt.href || "#"}
                onClick={onClose}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 font-semibold"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* User Section */}
      <div className="mt-3.5 border-t border-slate-100 pt-3">
        {currentUser ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                {currentUser.username?.charAt(0).toUpperCase() || "A"}
              </span>
              <div>
                <p className="font-semibold text-slate-800">
                  {currentUser.full_name || currentUser.username}
                </p>
                <p className="text-[10px] text-slate-500">
                  {currentUser.role === "admin" ? "Quản trị viên hệ thống" : "Người dùng"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100 transition"
            >
              Đăng xuất
            </button>
          </div>
        ) : IS_CLERK_ENABLED ? (
          <ClerkAuthNav />
        ) : (
          <Link
            href="/login"
            onClick={onClose}
            className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Đăng nhập Admin
          </Link>
        )}
      </div>
    </div>
  );
}
