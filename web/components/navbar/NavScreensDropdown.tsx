"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREEN_OPTIONS } from "./nav-config";

import { IconPlus, IconTV } from "@/components/icons/Icons";

interface NavScreensDropdownProps {
  onOpenScreenModal: () => void;
}

export function NavScreensDropdown({ onOpenScreenModal }: NavScreensDropdownProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isScreensActive =
    pathname === "/screen" || pathname === "/homescreen";

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150 ${
          isOpen || isScreensActive
            ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80 shadow-xs"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <IconTV className="h-4 w-4" />
        <span className="font-semibold">Màn hình & TV</span>
        <svg
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-indigo-600" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 origin-top-left rounded-xl border border-slate-200/90 bg-white p-2 shadow-xl ring-1 ring-black/5 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="px-2.5 py-1.5 mb-1 border-b border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Thiết bị & Trình chiếu
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {SCREEN_OPTIONS.map((opt) => {
              if (opt.action === "modal") {
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenScreenModal();
                    }}
                    className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition hover:bg-indigo-50/80 group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100/70 text-indigo-700 transition group-hover:scale-105">
                      <IconPlus className="h-4 w-4" />
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-800 group-hover:text-indigo-700">
                        {opt.label}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-snug">
                        {opt.description}
                      </span>
                    </div>
                  </button>
                );
              }

              const isActive = pathname === opt.href;
              return (
                <Link
                  key={opt.id}
                  href={opt.href || "#"}
                  className={`flex items-start gap-3 rounded-lg p-2 transition group ${
                    isActive
                      ? "bg-emerald-50 text-emerald-900"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition group-hover:scale-105 ${
                      isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <IconTV className="h-4 w-4" />
                  </span>
                  <div className="flex flex-col">
                    <span
                      className={`text-xs font-semibold ${
                        isActive ? "text-emerald-700" : "text-slate-800 group-hover:text-emerald-700"
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="text-[11px] text-slate-500 leading-snug">
                      {opt.description}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
