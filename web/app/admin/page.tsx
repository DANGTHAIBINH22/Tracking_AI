"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DeviceManager } from "@/components/admin/report/DeviceManager";
import { Loader } from "@/components/admin/report/Loader";
import { api, clearAuthSession, getAuthToken, getStoredUser, setStoredUser } from "@/lib/api";
import { useStoredUser } from "@/lib/useBrowserState";

/** The fleet: pair, revoke, open a screen. The report is on "/". */
export default function AdminPage() {
  const router = useRouter();
  const currentUser = useStoredUser();
  const [authChecked, setAuthChecked] = useState(false);

  // Stored user is shown at once; the token is checked against the API once
  // and useStoredUser follows whatever that decides.
  useEffect(() => {
    let ignore = false;
    const verified = getAuthToken()
      ? api.me().then(setStoredUser, () => clearAuthSession())
      : Promise.resolve().then(() => {
          if (getStoredUser()) clearAuthSession();
        });
    verified.finally(() => {
      if (!ignore) setAuthChecked(true);
    });
    return () => {
      ignore = true;
    };
  }, []);

  const logout = () => {
    clearAuthSession();
    router.replace("/login");
  };

  if (!authChecked) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader label="Đang kiểm tra quyền quản trị…" />
      </div>
    );
  }

  return (
    <main className="w-full space-y-5 px-4 py-6 sm:px-5 lg:pl-2 lg:pr-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Quản trị</p>
          <h1 className="mt-0.5 text-xl font-bold text-slate-900">Quản lý thiết bị</h1>
          <p className="mt-1 text-xs text-slate-500">
            Ghép nối màn hình mới, gán playlist và theo dõi kết nối. Báo cáo hiệu quả của từng màn hình ở trang{" "}
            <Link href="/" className="font-semibold text-emerald-700 hover:text-emerald-900">
              Tổng quan
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
            {currentUser?.full_name || currentUser?.username || "Quản trị viên"}
          </span>
          <a
            href="/homescreen"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Homescreen ↗
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <DeviceManager />
    </main>
  );
}
