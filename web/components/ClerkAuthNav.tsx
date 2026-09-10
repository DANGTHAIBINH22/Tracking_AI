"use client";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";

export function ClerkAuthNav() {
  const { isSignedIn, isLoaded, user } = useUser();

  if (!isLoaded) {
    return <div className="text-[11px] text-[var(--muted)]">Đang tải...</div>;
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2 border-l border-[var(--border)] pl-3 text-xs">
        <span className="text-[11px] font-medium text-emerald-700">
          {user?.fullName || user?.username || "Admin"}
        </span>
        <UserButton />
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
    >
      Đăng nhập Clerk
    </Link>
  );
}
