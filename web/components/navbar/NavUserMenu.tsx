"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPublic, api, clearAuthSession, getAuthToken, getStoredUser, setStoredUser } from "@/lib/api";
import { IS_CLERK_ENABLED } from "@/components/ClerkWrapper";
import { ClerkAuthNav } from "@/components/ClerkAuthNav";

interface NavUserMenuProps {
  onLogoutSuccess?: () => void;
}

export function NavUserMenu({ onLogoutSuccess }: NavUserMenuProps) {
  const [currentUser, setCurrentUser] = useState<UserPublic | null>({
    id: 1,
    username: "admin",
    full_name: "Quản trị viên",
    role: "admin",
  });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    // 1. Sync immediately from stored state
    const savedUser = getStoredUser();
    if (savedUser) {
      setCurrentUser(savedUser);
    }

    // 2. Validate token with API on initial mount only
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

    // 3. When auth changes (login / logout), read stored state without re-calling api.me()
    const handleAuthChange = () => {
      setCurrentUser(getStoredUser());
    };

    window.addEventListener("auth-change", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener("auth-change", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      clearAuthSession();
      setCurrentUser(null);
      setLoggingOut(false);
      if (onLogoutSuccess) {
        onLogoutSuccess();
      }
      window.location.href = "/login";
    }
  };

  if (currentUser) {
    return (
      <div className="flex items-center gap-2 border-l border-slate-200/80 pl-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 py-1 pl-1.5 pr-2.5 shadow-2xs">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            {currentUser.username?.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-800">
              {currentUser.username}
            </span>
            {currentUser.role === "admin" && (
              <span className="rounded bg-emerald-100/80 px-1 py-0.2 text-[10px] font-semibold text-emerald-700">
                Admin
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Đăng xuất khỏi hệ thống"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition duration-150 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
    );
  }

  if (IS_CLERK_ENABLED) {
    return <ClerkAuthNav />;
  }

  return (
    <div className="border-l border-slate-200/80 pl-3">
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 shadow-2xs"
      >
        <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
        </svg>
        <span>Đăng nhập Admin</span>
      </Link>
    </div>
  );
}
