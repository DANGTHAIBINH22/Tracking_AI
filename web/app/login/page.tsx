"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getAuthToken } from "@/lib/api";
import { IS_CLERK_ENABLED, useSafeUser } from "@/components/ClerkWrapper";
import { ClerkSignInCard } from "@/components/ClerkSignInCard";

export default function LoginPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useSafeUser();

  // Automatically switch to 'clerk' tab if returning from Clerk SSO callback
  const [mode, setMode] = useState<"local" | "clerk">(() => {
    if (typeof window !== "undefined") {
      if (
        window.location.hash.includes("sso-callback") ||
        window.location.href.includes("__clerk")
      ) {
        return "clerk";
      }
    }
    return "local";
  });

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.login({ username: username.trim(), password });
      window.location.href = "/admin";
    } catch (err) {
      setError((err as Error).message || "Đăng nhập thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const isHandlingSSO =
    typeof window !== "undefined" && window.location.hash.includes("sso-callback");

  return (
    <main className="flex min-h-[85vh] items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-6 sm:p-8 shadow-xl bg-white border border-slate-200 rounded-2xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-xs">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Đăng Nhập Quản Trị Viên</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Hệ thống Quản trị Bảng Hiển thị & Phân tích Khán giả
          </p>
        </div>

        {isHandlingSSO && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-xs text-blue-700 animate-pulse">
            Đang hoàn tất xác thực Clerk SSO... vui lòng chờ trong giây lát.
          </div>
        )}

        {/* Tab Switcher if Clerk is available */}
        {IS_CLERK_ENABLED && (
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("local")}
              className={`rounded-lg py-2 font-medium transition ${
                mode === "local"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Tài khoản Admin
            </button>
            <button
              type="button"
              onClick={() => setMode("clerk")}
              className={`rounded-lg py-2 font-medium transition ${
                mode === "clerk"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Clerk (Google/Email)
            </button>
          </div>
        )}

        {/* Mode 1: Local Admin Form */}
        <div className={mode === "local" ? "block" : "hidden"}>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Tên đăng nhập
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="admin"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Mật khẩu
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Đang xác thực..." : "Đăng nhập hệ thống"}
            </button>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center text-[11px] text-slate-600">
              <p className="font-semibold text-slate-800">Tài khoản quản trị mặc định:</p>
              <p className="mt-1">
                Username: <code className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1 py-0.5 rounded">admin</code> · Password:{" "}
                <code className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1 py-0.5 rounded">admin123</code>
              </p>
            </div>
          </form>
        </div>

        {/* Mode 2: Clerk Login Card */}
        {/* We keep this mounted so Clerk can catch SSO callback hash regardless of tab */}
        {IS_CLERK_ENABLED && (
          <div className={mode === "clerk" ? "mt-5 block" : "hidden"}>
            <ClerkSignInCard />
          </div>
        )}
      </div>
    </main>
  );
}
