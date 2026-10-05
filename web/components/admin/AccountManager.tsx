"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPublic, UserRole, api } from "@/lib/api";

const MIN_PASSWORD_LENGTH = 8; // mirrors server/auth.py MIN_PASSWORD_LENGTH

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
};

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";
const btnPrimary =
  "rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50";
const btnGhost =
  "rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

function formatTime(ts?: number | null): string {
  if (!ts) return "Chưa đăng nhập";
  return new Date(ts * 1000).toLocaleString("vi-VN");
}

/**
 * Accounts section of /admin.
 *
 * Everyone who can reach /admin gets "Tài khoản của tôi" (change own password).
 * Admins also get the account list. The server enforces every rule shown here
 * (no self-lock, keep one active admin, password length); the UI only avoids
 * offering buttons that would be refused.
 */
export function AccountManager({
  currentUser,
  onCurrentUserChange,
}: {
  currentUser: UserPublic | null;
  onCurrentUserChange: (user: UserPublic) => void;
}) {
  if (!currentUser) return null;
  return (
    <section id="accounts-section" className="card space-y-5 p-4 sm:p-5 scroll-mt-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">Tài khoản</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {currentUser.role === "admin"
            ? "Tạo, phân quyền, khóa và đặt lại mật khẩu cho tài khoản quản trị."
            : "Đổi mật khẩu tài khoản của bạn. Chỉ quản trị viên mới quản lý được tài khoản khác."}
        </p>
      </div>
      <ChangeOwnPassword currentUser={currentUser} onChanged={onCurrentUserChange} />
      {currentUser.role === "admin" && <UserList currentUser={currentUser} />}
    </section>
  );
}

function ChangeOwnPassword({
  currentUser,
  onChanged,
}: {
  currentUser: UserPublic;
  onChanged: (user: UserPublic) => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) {
      setMessage({ ok: false, text: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` });
      return;
    }
    if (next !== confirm) {
      setMessage({ ok: false, text: "Nhập lại mật khẩu mới không khớp." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.changePassword({ current_password: current, new_password: next });
      onChanged(res.user);
      setCurrent("");
      setNext("");
      setConfirm("");
      setOpen(false);
      setMessage({ ok: true, text: "Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất." });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs">
          <p className="font-semibold text-slate-900">
            {currentUser.full_name || currentUser.username}{" "}
            <span className="font-normal text-slate-500">({currentUser.username})</span>
          </p>
          <p className="text-[11px] text-slate-500">{ROLE_LABEL[currentUser.role] ?? currentUser.role}</p>
        </div>
        <button type="button" className={btnGhost} onClick={() => setOpen((v) => !v)}>
          {open ? "Hủy" : "Đổi mật khẩu"}
        </button>
      </div>

      {message && (
        <p className={`mt-2 text-[11px] ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Mật khẩu hiện tại"
            aria-label="Mật khẩu hiện tại"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={`Mật khẩu mới (≥ ${MIN_PASSWORD_LENGTH} ký tự)`}
            aria-label="Mật khẩu mới"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
            aria-label="Nhập lại mật khẩu mới"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className={inputCls}
          />
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Đang lưu..." : "Lưu mật khẩu mới"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function UserList({ currentUser }: { currentUser: UserPublic }) {
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    api
      .listUsers()
      .then((list) => !ignore && setUsers(list))
      .catch((err) => !ignore && setError((err as Error).message))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, []);

  const activeAdmins = users.filter((u) => u.role === "admin" && u.is_active !== false).length;

  /** Run one change, then reload the list; the server's refusal is shown as-is. */
  const run = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = (u: UserPublic) => {
    const pw = prompt(
      `Mật khẩu mới cho "${u.username}" (ít nhất ${MIN_PASSWORD_LENGTH} ký tự).\n` +
        "Tài khoản này sẽ bị đăng xuất khỏi mọi thiết bị.",
    );
    if (pw === null) return;
    if (pw.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    run(u.id, () => api.updateUser(u.id, { password: pw }));
  };

  const remove = (u: UserPublic) => {
    if (!confirm(`Xóa vĩnh viễn tài khoản "${u.username}"? Thao tác này không hoàn tác được.`)) return;
    run(u.id, () => api.deleteUser(u.id));
  };

  return (
    <div className="space-y-3">
      <CreateUserForm onCreated={load} />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Tài khoản</th>
              <th className="px-3 py-2 font-semibold">Vai trò</th>
              <th className="px-3 py-2 font-semibold">Trạng thái</th>
              <th className="px-3 py-2 font-semibold">Đăng nhập gần nhất</th>
              <th className="px-3 py-2 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                  Đang tải danh sách tài khoản...
                </td>
              </tr>
            )}
            {users.map((u) => {
              const isSelf = u.id === currentUser.id;
              const active = u.is_active !== false;
              // Mirrors the server's guard, so the UI does not offer a refusal.
              const protectedAdmin = isSelf || (u.role === "admin" && active && activeAdmins <= 1);
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className={active ? "" : "bg-slate-50/70 text-slate-400"}>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-900">
                      {u.full_name || u.username}
                      {isSelf && <span className="ml-1.5 text-[10px] font-medium text-emerald-700">(bạn)</span>}
                    </p>
                    <p className="text-[11px] text-slate-500">{u.username}</p>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Vai trò của ${u.username}`}
                      value={u.role}
                      disabled={busy || protectedAdmin}
                      onChange={(e) =>
                        run(u.id, () => api.updateUser(u.id, { role: e.target.value as UserRole }))
                      }
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs disabled:opacity-60"
                    >
                      <option value="admin">{ROLE_LABEL.admin}</option>
                      <option value="operator">{ROLE_LABEL.operator}</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-100 text-slate-500"
                      }`}
                    >
                      {active ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{formatTime(u.last_login)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className={btnGhost} disabled={busy} onClick={() => resetPassword(u)}>
                        Đặt lại mật khẩu
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy || protectedAdmin}
                        onClick={() => run(u.id, () => api.updateUser(u.id, { is_active: !active }))}
                      >
                        {active ? "Khóa" : "Mở khóa"}
                      </button>
                      <button
                        type="button"
                        className={`${btnGhost} hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600`}
                        disabled={busy || protectedAdmin}
                        onClick={() => remove(u)}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createUser({ username: username.trim(), password, full_name: fullName.trim(), role });
      setUsername("");
      setFullName("");
      setPassword("");
      setRole("operator");
      setOpen(false);
      await onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>
        + Thêm tài khoản
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
      <p className="text-xs font-semibold text-slate-900">Tài khoản mới</p>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          placeholder="Tên đăng nhập (chữ, số, . _ - @)"
          aria-label="Tên đăng nhập"
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          pattern="[A-Za-z0-9_.@\-]{3,64}"
          title="3-64 ký tự: chữ không dấu, số, . _ - @"
          required
          className={inputCls}
        />
        <input
          placeholder="Họ và tên"
          aria-label="Họ và tên"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={inputCls}
        />
        <input
          type="password"
          placeholder={`Mật khẩu (≥ ${MIN_PASSWORD_LENGTH} ký tự)`}
          aria-label="Mật khẩu"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={inputCls}
        />
        <select
          aria-label="Vai trò"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className={inputCls}
        >
          <option value="operator">{ROLE_LABEL.operator} — dùng trang quản trị, không quản lý tài khoản</option>
          <option value="admin">{ROLE_LABEL.admin} — toàn quyền, kể cả quản lý tài khoản</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Đang tạo..." : "Tạo tài khoản"}
        </button>
        <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
          Hủy
        </button>
      </div>
    </form>
  );
}
