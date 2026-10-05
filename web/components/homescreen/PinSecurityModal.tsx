"use client";

import React, { useState, useEffect, useEffectEvent, useRef } from "react";

interface PinSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

const PIN_STORAGE_KEY = "kiosk_dock_pin";
const DEFAULT_PIN = "1234";

export function PinSecurityModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Bảo mật Kiosk",
  description = "Nhập mã PIN để mở khoá thanh điều khiển",
}: PinSecurityModalProps) {
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<boolean>(false);
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);
  const [oldPinInput, setOldPinInput] = useState<string>("");
  const [newPinInput, setNewPinInput] = useState<string>("");
  const [confirmPinInput, setConfirmPinInput] = useState<string>("");
  const [changeStep, setChangeStep] = useState<"verify_old" | "enter_new" | "confirm_new">("verify_old");
  const [changeMessage, setChangeMessage] = useState<{ text: string; type: "info" | "error" | "success" } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Get current active PIN from localStorage
  const getStoredPin = (): string => {
    if (typeof window === "undefined") return DEFAULT_PIN;
    return localStorage.getItem(PIN_STORAGE_KEY) || DEFAULT_PIN;
  };

  // Reset inputs each time the modal opens. Adjusted during render (React's
  // "adjust state on prop change"), so the old PIN is never painted.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setPin("");
      setError(false);
      setIsChangingPin(false);
      setOldPinInput("");
      setNewPinInput("");
      setConfirmPinInput("");
      setChangeStep("verify_old");
      setChangeMessage(null);
    }
  }

  // Trigger verification when PIN reaches 4 digits
  const handleDigitPress = (digit: string) => {
    if (pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setError(false);

    if (nextPin.length === 4) {
      const correctPin = getStoredPin();
      if (nextPin === correctPin) {
        // Success
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 180);
      } else {
        // Wrong PIN
        setTimeout(() => {
          setError(true);
          setPin("");
        }, 200);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    setPin("");
    setError(false);
  };

  // Handling Change PIN logic
  const handleChangePinDigit = (digit: string) => {
    setChangeMessage(null);
    if (changeStep === "verify_old") {
      const next = oldPinInput + digit;
      setOldPinInput(next);
      if (next.length === 4) {
        if (next === getStoredPin()) {
          setChangeStep("enter_new");
          setChangeMessage({ text: "Nhập mã PIN mới (4 chữ số)", type: "info" });
        } else {
          setChangeMessage({ text: "Mã PIN hiện tại không đúng", type: "error" });
          setOldPinInput("");
        }
      }
    } else if (changeStep === "enter_new") {
      const next = newPinInput + digit;
      setNewPinInput(next);
      if (next.length === 4) {
        setChangeStep("confirm_new");
        setChangeMessage({ text: "Xác nhận lại mã PIN mới", type: "info" });
      }
    } else if (changeStep === "confirm_new") {
      const next = confirmPinInput + digit;
      setConfirmPinInput(next);
      if (next.length === 4) {
        if (next === newPinInput) {
          localStorage.setItem(PIN_STORAGE_KEY, next);
          setChangeMessage({ text: "Đổi mã PIN thành công!", type: "success" });
          setTimeout(() => {
            setIsChangingPin(false);
            setPin("");
            setChangeStep("verify_old");
          }, 1200);
        } else {
          setChangeMessage({ text: "Mã xác nhận không khớp. Vui lòng nhập lại mã mới.", type: "error" });
          setNewPinInput("");
          setConfirmPinInput("");
          setChangeStep("enter_new");
        }
      }
    }
  };

  const handleChangePinBackspace = () => {
    if (changeStep === "verify_old") {
      setOldPinInput((prev) => prev.slice(0, -1));
    } else if (changeStep === "enter_new") {
      setNewPinInput((prev) => prev.slice(0, -1));
    } else if (changeStep === "confirm_new") {
      setConfirmPinInput((prev) => prev.slice(0, -1));
    }
  };

  // Handle keyboard typing (0-9, Backspace, Esc). An effect event reads the
  // current PIN and handlers, so the listener is attached once per opening.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }

    if (isChangingPin) return; // In change PIN mode, use on-screen or specific input handlers

    if (e.key >= "0" && e.key <= "9") {
      if (pin.length < 4) {
        handleDigitPress(e.key);
      }
    } else if (e.key === "Backspace") {
      handleBackspace();
    }
  });
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        ref={containerRef}
        className={`relative w-full max-w-sm rounded-3xl bg-zinc-900/95 border border-white/15 p-6 shadow-2xl backdrop-blur-2xl transition-all duration-200 ${
          error ? "animate-shake border-rose-500/60 shadow-rose-500/20" : ""
        }`}
      >
        {/* macOS Window Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-3 w-3 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors shadow-sm"
              title="Đóng"
            />
            <span className="h-3 w-3 rounded-full bg-amber-500/40" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/40" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {isChangingPin ? "Đổi Mã PIN" : title}
          </span>
          <div className="w-12" />
        </div>

        {/* Content Body */}
        {!isChangingPin ? (
          <div className="mt-6 flex flex-col items-center">
            {/* Lock Icon */}
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 shadow-lg">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>

            <h3 className="text-base font-semibold text-white tracking-tight">Xác thực mã PIN Kiosk</h3>
            <p className="mt-1 text-xs text-zinc-400 text-center px-4">
              {description}
            </p>

            {/* PIN Dots Display */}
            <div className="my-6 flex items-center justify-center gap-4">
              {[0, 1, 2, 3].map((index) => {
                const filled = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`h-4 w-4 rounded-full transition-all duration-200 ${
                      filled
                        ? "bg-emerald-400 scale-110 shadow-[0_0_12px_#34d399]"
                        : error
                        ? "bg-rose-500/40 border border-rose-500/60"
                        : "bg-zinc-800 border border-zinc-700"
                    }`}
                  />
                );
              })}
            </div>

            {error && (
              <p className="mb-3 text-xs font-medium text-rose-400 animate-in fade-in">
                Mã PIN không đúng. Vui lòng thử lại!
              </p>
            )}

            {/* Touchscreen Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigitPress(num)}
                  className="flex h-12 items-center justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 active:scale-95 text-lg font-semibold text-white transition-all border border-white/5 shadow-sm cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="flex h-12 items-center justify-center rounded-xl bg-zinc-800/40 hover:bg-zinc-800 active:scale-95 text-xs font-medium text-zinc-400 transition-all border border-white/5 cursor-pointer"
              >
                Xoá
              </button>
              <button
                type="button"
                onClick={() => handleDigitPress("0")}
                className="flex h-12 items-center justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 active:scale-95 text-lg font-semibold text-white transition-all border border-white/5 shadow-sm cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="flex h-12 items-center justify-center rounded-xl bg-zinc-800/40 hover:bg-zinc-800 active:scale-95 text-sm text-zinc-400 transition-all border border-white/5 cursor-pointer"
                title="Xoá lùi"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6-6h12a1 1 0 011 1v10a1 1 0 01-1 1H9l-6-6z" />
                </svg>
              </button>
            </div>

            {/* Footer Options */}
            <div className="mt-5 flex items-center justify-between w-full pt-4 border-t border-white/10 text-[11px]">
              <span className="text-zinc-500 font-mono">Mã mặc định: 1234</span>
              <button
                type="button"
                onClick={() => setIsChangingPin(true)}
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer"
              >
                Đổi mã PIN
              </button>
            </div>
          </div>
        ) : (
          /* Change PIN Mode */
          <div className="mt-6 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-white tracking-tight">
              {changeStep === "verify_old"
                ? "Bước 1: Nhập mã PIN hiện tại"
                : changeStep === "enter_new"
                ? "Bước 2: Nhập mã PIN mới"
                : "Bước 3: Xác nhận lại mã PIN mới"}
            </h3>

            {/* Step Indicators */}
            <div className="my-5 flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((index) => {
                const currentActive =
                  changeStep === "verify_old"
                    ? oldPinInput
                    : changeStep === "enter_new"
                    ? newPinInput
                    : confirmPinInput;
                const filled = currentActive.length > index;
                return (
                  <div
                    key={index}
                    className={`h-3.5 w-3.5 rounded-full transition-all duration-200 ${
                      filled
                        ? "bg-teal-400 scale-110 shadow-[0_0_10px_#2dd4bf]"
                        : "bg-zinc-800 border border-zinc-700"
                    }`}
                  />
                );
              })}
            </div>

            {changeMessage && (
              <p
                className={`mb-3 text-xs font-medium text-center ${
                  changeMessage.type === "error"
                    ? "text-rose-400"
                    : changeMessage.type === "success"
                    ? "text-emerald-400 font-bold"
                    : "text-zinc-300"
                }`}
              >
                {changeMessage.text}
              </p>
            )}

            {/* Keypad for changing PIN */}
            <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleChangePinDigit(num)}
                  className="flex h-11 items-center justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 active:scale-95 text-base font-semibold text-white transition-all border border-white/5 cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handleChangePinDigit("0")}
                className="flex h-11 items-center justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 active:scale-95 text-base font-semibold text-white transition-all border border-white/5 cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleChangePinBackspace}
                className="flex h-11 items-center justify-center rounded-xl bg-zinc-800/40 hover:bg-zinc-800 active:scale-95 text-sm text-zinc-400 transition-all border border-white/5 cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6-6h12a1 1 0 011 1v10a1 1 0 01-1 1H9l-6-6z" />
                </svg>
              </button>
            </div>

            <div className="mt-5 flex items-center justify-center w-full pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(false);
                  setPin("");
                  setChangeStep("verify_old");
                }}
                className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Quay lại xác thực
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
