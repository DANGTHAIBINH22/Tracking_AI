"use client";

import Link from "next/link";
import { IconBrand } from "@/components/icons/Icons";

export function SidebarBrand() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 px-1.5 py-1 transition hover:opacity-95"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-emerald-600 shadow-md shadow-emerald-700/20 ring-1 ring-emerald-400/30 transition duration-200 group-hover:scale-105">
        <IconBrand className="h-6 w-6 text-white" />
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1 text-base font-extrabold tracking-tight text-slate-900 leading-tight">
          <span>Tapio</span>
          <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Analytics
          </span>
        </div>
        <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase leading-none mt-1">
          Smart Retail AI
        </span>
      </div>
    </Link>
  );
}
