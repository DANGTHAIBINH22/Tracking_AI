"use client";

import React, { useState } from "react";
import { IconCheck, IconCopy, IconDevices, IconExternal } from "@/components/icons/Icons";

interface DevicePairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenToken: string | null;
  screenInfo: {
    id?: number | null;
    name: string | null;
    location: string | null;
    playlist_id?: number | null;
    playlist_name?: string | null;
    user_id?: number | null;
    account_name?: string | null;
    account_username?: string | null;
  } | null;
  pairingCode: string | null;
  timeLeft: number;
  copiedCode: boolean;
  onCopyCode: () => void;
  onRefreshCode: () => void;
  onConnectAdmin: () => void;
  onUnpair: () => void;
}

export function DevicePairingModal({
  isOpen,
  onClose,
  screenToken,
  screenInfo,
  pairingCode,
  timeLeft,
  copiedCode,
  onCopyCode,
  onRefreshCode,
  onConnectAdmin,
  onUnpair,
}: DevicePairingModalProps) {
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  const isPaired = Boolean(screenToken);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  const deviceUniqueId = screenInfo?.id
    ? `SCREEN-${String(screenInfo.id).padStart(4, "0")}`
    : "SCREEN-UNKNOWN";

  const handleCopyDeviceId = () => {
    const textToCopy = screenToken ? `${deviceUniqueId} (${screenToken})` : deviceUniqueId;
    navigator.clipboard.writeText(textToCopy).catch(() => undefined);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* macOS Style Window */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/15 bg-zinc-900/90 backdrop-blur-2xl shadow-2xl text-white overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* macOS Titlebar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-800/40">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-3 w-3 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors"
              title="Đóng"
            />
            <div className="h-3 w-3 rounded-full bg-amber-500/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
            <span className="ml-2 text-xs font-semibold text-zinc-300">
              {isPaired ? "Thông Tin Thiết Bị & Tài Khoản" : "Ghép Nối Thiết Bị"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                isPaired
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isPaired ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-ping"
                }`}
              />
              {isPaired ? "Đã liên kết tài khoản" : "Chờ ghép nối"}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          {/* ======================================================== */}
          {/* CASE 1: ĐÃ GHÉP NỐI THÀNH CÔNG (PAIRED)                  */}
          {/* ======================================================== */}
          {isPaired ? (
            <>
              {/* ID ĐỊNH DANH THIẾT BỊ NỔI BẬT */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <span>🆔</span>
                    <span>Mã ID Định Danh Thiết Bị</span>
                  </span>
                  <span className="text-[10px] text-zinc-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Hardware ID
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/80 border border-white/10">
                  <div>
                    <span className="font-mono text-xl font-bold tracking-wider text-emerald-300 block">
                      {deviceUniqueId}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 truncate max-w-[280px] block mt-0.5">
                      Token: {screenToken ? `${screenToken.slice(0, 16)}...` : "None"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyDeviceId}
                    className="flex h-9 items-center gap-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-zinc-200 transition cursor-pointer"
                    title="Sao chép ID định danh"
                  >
                    {copiedId ? (
                      <>
                        <IconCheck className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <IconCopy className="h-4 w-4" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* THÔNG TIN TÀI KHOẢN KẾT NỐI (ACCOUNT CONNECT) */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold block">
                  Tài Khoản Đang Liên Kết (Account Connect)
                </span>

                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-zinc-950/60 border border-white/10">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-white text-base shadow-md">
                    {screenInfo?.account_name ? screenInfo.account_name.charAt(0).toUpperCase() : "A"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-100 truncate">
                        {screenInfo?.account_name || "Quản trị viên"}
                      </span>
                      <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium">
                        Chính thức
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400 block truncate">
                      {screenInfo?.account_username ? `@${screenInfo.account_username}` : "admin"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-white/10">
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Tên màn hình:</span>
                    <span className="font-medium text-zinc-100">{screenInfo?.name || "Chưa đặt tên"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Vị trí:</span>
                    <span className="font-medium text-zinc-100">{screenInfo?.location || "Chưa thiết lập"}</span>
                  </div>
                  <div className="col-span-2 pt-1">
                    <span className="text-zinc-400 block text-[11px]">Playlist được phân công:</span>
                    <span className="font-medium text-emerald-400">
                      {screenInfo?.playlist_name || "Chưa có Playlist nào gán cho màn hình này"}
                    </span>
                  </div>
                </div>
              </div>

              {/* ACTION: UNPAIR */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onUnpair}
                  className="w-full py-2.5 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 font-semibold text-xs hover:bg-rose-500/20 transition cursor-pointer"
                >
                  Huỷ Liên Kết Thiết Bị Này
                </button>
              </div>
            </>
          ) : (
            /* ======================================================== */
            /* CASE 2: CHƯA GHÉP NỐI (HIỂN THỊ MÃ GHÉP NỐI & HƯỚNG DẪN)  */
            /* ======================================================== */
            <>
              {/* Pairing Code Card */}
              <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-5 text-center space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-medium uppercase tracking-wider">Mã Kết Nối Thiết Bị (Pairing Code)</span>
                  {timeLeft > 0 && (
                    <span className="font-mono text-amber-400 text-[11px]">
                      Hết hạn: {formattedTime}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 py-2">
                  <span className="font-mono text-4xl sm:text-5xl font-extrabold tracking-widest text-emerald-400 select-all">
                    {pairingCode || "------"}
                  </span>
                  {pairingCode && (
                    <button
                      type="button"
                      onClick={onCopyCode}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-zinc-200 hover:bg-white/20 transition cursor-pointer"
                      title="Sao chép mã ghép nối"
                    >
                      {copiedCode ? (
                        <IconCheck className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <IconCopy className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onRefreshCode}
                    className="text-xs text-zinc-400 hover:text-white underline underline-offset-4 cursor-pointer"
                  >
                    Lấy mã kết nối mới
                  </button>
                </div>
              </div>

              {/* Action Button: Connect via Admin */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onConnectAdmin}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold text-sm shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.99] transition cursor-pointer"
                >
                  <IconDevices className="h-4 w-4" />
                  <span>Mở Trang Admin Kết Nối Ngay</span>
                  <IconExternal className="h-3.5 w-3.5 opacity-70" />
                </button>
                <p className="text-center text-[11px] text-zinc-500">
                  (Mã ghép nối sẽ được chuyển qua trang quản trị để liên kết với tài khoản)
                </p>
              </div>

              {/* Guide Steps */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-300 space-y-2">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Hướng dẫn ghép nối thiết bị:</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1.5 text-zinc-400 text-[11px] leading-relaxed">
                  <li>
                    Đăng nhập tài khoản quản trị trên máy tính hoặc điện thoại tại <strong className="text-emerald-400">/admin</strong>.
                  </li>
                  <li>
                    Nhập mã gồm 6 ký tự trên để phê duyệt và liên kết màn hình vào tài khoản.
                  </li>
                  <li>
                    Sau khi liên kết, hệ thống sẽ cấp mã ID định danh vĩnh viễn cho màn hình này.
                  </li>
                </ol>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <span>Kiosk Client v2.0</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
