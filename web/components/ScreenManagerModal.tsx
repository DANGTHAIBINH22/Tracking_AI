"use client";

import { useEffect, useState } from "react";
import { ScreenPublic, api } from "@/lib/api";
import { IconCheck, IconClose, IconTV } from "@/components/icons/Icons";

interface ScreenManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScreenManagerModal({ isOpen, onClose }: ScreenManagerModalProps) {
  const [screens, setScreens] = useState<ScreenPublic[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Pair form state
  const [pairingCode, setPairingCode] = useState("");
  const [screenName, setScreenName] = useState("");
  const [location, setLocation] = useState("");

  const loadScreens = async () => {
    try {
      const list = await api.listScreens();
      setScreens(list);
    } catch {
      // Ignore network errors
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadScreens();
      const id = setInterval(loadScreens, 4000);
      return () => clearInterval(id);
    }
  }, [isOpen]);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode.trim() || !screenName.trim()) {
      setError("Vui lòng nhập mã kết nối (từ TV) và tên màn hình.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.pairScreen({
        pairing_code: pairingCode.trim(),
        name: screenName.trim(),
        location: location.trim() || undefined,
      });

      setSuccess(`Đã kích hoạt thành công màn hình "${res.name}"!`);
      setPairingCode("");
      setScreenName("");
      setLocation("");
      await loadScreens();
    } catch (err) {
      setError((err as Error).message || "Ghép nối màn hình thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number, name: string | null) => {
    if (!confirm(`Hủy liên kết màn hình "${name || id}"? Thiết bị sẽ dừng phát quảng cáo ngay lập tức.`)) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteScreen(id);
      await loadScreens();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div className="card w-full max-w-2xl overflow-hidden p-0 shadow-2xl bg-white border border-slate-200 rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 text-base border border-indigo-200">
              <IconTV className="h-4 w-4 text-indigo-600" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Quản lý Màn hình Quảng cáo (Screens)</h2>
              <p className="text-[11px] text-[var(--muted)]">
                Ghép nối các TV/Kiosk tại cửa hàng bằng Mã Kết Nối (Pairing Code)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-5 space-y-5">
          {/* Pair new screen form */}
          <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-4">
            <h3 className="text-xs font-semibold text-slate-900">
              Ghép nối Màn hình TV mới
            </h3>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              Mở trang <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[10px] text-slate-800">/screen</code> trên màn hình TV để nhận mã 6 ký tự, sau đó nhập vào đây:
            </p>

            {error && (
              <div className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
                <IconCheck className="h-3.5 w-3.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handlePair} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Mã ghép đôi *
                </label>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  placeholder="VD: 4TT-9YG"
                  maxLength={10}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Tên màn hình *
                </label>
                <input
                  type="text"
                  value={screenName}
                  onChange={(e) => setScreenName(e.target.value)}
                  placeholder="VD: TV Sảnh A"
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Vị trí (tùy chọn)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="VD: Tầng 1 - Cửa đón khách"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? "Đang ghép đôi..." : "Kích hoạt màn hình"}
                </button>
              </div>
            </form>
          </div>

          {/* Screens list */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-900">
              Danh sách thiết bị ({screens.length})
            </h3>

            {screens.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
                Chưa có màn hình nào được kết nối. Hãy mở <code className="font-mono text-emerald-700">/screen</code> trên thiết bị TV để bắt đầu!
              </div>
            ) : (
              <div className="space-y-2">
                {screens.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          s.status === "paired"
                            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                            : "bg-amber-400"
                        }`}
                        title={s.status === "paired" ? "Đã liên kết" : "Chờ phê duyệt"}
                      />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {s.name || "Màn hình chưa đặt tên"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {s.location ? `${s.location} · ` : ""}
                          Mã: <code className="font-mono font-semibold text-indigo-600">{s.pairing_code}</code>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                          s.status === "paired"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {s.status === "paired" ? "Đang phát sóng" : "Chờ kích hoạt"}
                      </span>

                      <button
                        onClick={() => handleDelete(s.id, s.name)}
                        disabled={busy}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-100"
                        title="Hủy quyền phát quảng cáo của màn hình này"
                      >
                        Hủy liên kết
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
