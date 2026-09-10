"use client";

import Link from "next/link";
import { IconBrand } from "@/components/icons/Icons";

export function NavBrand() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 font-bold tracking-tight transition hover:opacity-95"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-500/30 transition duration-200 group-hover:scale-105">
        <IconBrand className="h-5 w-5" />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1 text-sm font-extrabold text-slate-900 sm:text-base leading-tight">
          <span>Tapio</span>
          <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Analytics
          </span>
        </div>
        <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase leading-none mt-0.5">
          AI Smart Signage
        </span>
      </div>
    </Link>
  );
}
