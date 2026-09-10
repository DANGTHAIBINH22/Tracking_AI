"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPublic, api, clearAuthSession, getAuthToken, getStoredUser, setStoredUser } from "@/lib/api";
import { IS_CLERK_ENABLED } from "@/components/ClerkWrapper";
import { ClerkAuthNav } from "@/components/ClerkAuthNav";
import { IconLogout, IconUser } from "@/components/icons/Icons";

export function SidebarUser() {
  const [currentUser, setCurrentUser] = useState<UserPublic | null>({
    id: 1,
    username: "admin",
    full_name: "Quản trị viên",
    role: "admin",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const savedUser = getStoredUser();
    if (savedUser) setCurrentUser(savedUser);

    const token = getAuthToken();
    if (token) {
      api
        .me()
        .then((user) => {
          setCurrentUser(user);
          setStoredUser(user);
        })
        .catch(() => {
          clearAuthSession();
          setCurrentUser(null);
        });
    } else {
      setCurrentUser(null);
    }

    const handleAuthChange = () => setCurrentUser(getStoredUser());
    window.addEventListener("auth-change", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener("auth-change", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      clearAuthSession();
      setCurrentUser(null);
      setBusy(false);
      window.location.href = "/login";
    }
  };

  if (currentUser) {
    return (
      <div className="flex items-center justify-between gap-2 border-t border-slate-200/80 p-3 bg-slate-50/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 ring-2 ring-emerald-500/20">
            {currentUser.username?.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="truncate text-xs font-semibold text-slate-800">
              {currentUser.full_name || currentUser.username}
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              {currentUser.role === "admin" ? "Quản trị viên" : "Người dùng"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          title="Đăng xuất khỏi hệ thống"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          <IconLogout className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (IS_CLERK_ENABLED) {
    return (
      <div className="border-t border-slate-200/80 p-3">
        <ClerkAuthNav />
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200/80 p-3">
      <Link
        href="/login"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
      >
        <IconUser className="h-4 w-4 text-slate-500" />
        <span>Đăng nhập Admin</span>
      </Link>
    </div>
  );
}
