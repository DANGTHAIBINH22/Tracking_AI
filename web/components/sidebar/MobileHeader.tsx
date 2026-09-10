"use client";

import { SidebarBrand } from "./SidebarBrand";
import { TrackingControlButton } from "@/components/TrackingControlButton";

interface MobileHeaderProps {
  onOpenMobileMenu: () => void;
}

export function MobileHeader({ onOpenMobileMenu }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md lg:hidden">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100"
          aria-label="Mở menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <SidebarBrand />
      </div>

      <div className="flex items-center gap-2">
        <TrackingControlButton showFps={false} />
      </div>
    </header>
  );
}
