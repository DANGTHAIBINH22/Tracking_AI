"use client";

import { useEffect, useState } from "react";
import { api, getAuthToken } from "@/lib/api";

/** Where to go after signing in: `?next=/some/path`, same-origin paths only. */
function nextPath(): string {
  if (typeof window === "undefined") return "/admin";
  const next = new URLSearchParams(window.location.search).get("next");
  // Only a local path: an absolute URL here would make the login page an open
  // redirect to whatever site a crafted link names.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in with a session the server still accepts: skip the form.
  useEffect(() => {
    if (!getAuthToken()) return;
    api
      .me()
      .then(() => window.location.replace(nextPath()))
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.login({ username: username.trim(), password });
      window.location.href = nextPath();
    } catch (err) {
      setError((err as Error).message || "Đăng nhập thất bại.");
      setBusy(false);
    }
  };

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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-username" className="mb-1 block text-xs font-semibold text-slate-700">
              Tên đăng nhập
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-xs font-semibold text-slate-700">
              Mật khẩu
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
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

          <p className="text-center text-[11px] text-slate-500">
            Chưa có tài khoản hoặc quên mật khẩu? Liên hệ quản trị viên để được cấp hoặc đặt lại.
          </p>
        </form>
      </div>
    </main>
  );
}
