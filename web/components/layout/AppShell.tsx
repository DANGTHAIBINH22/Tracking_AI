"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { MobileHeader } from "@/components/sidebar/MobileHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Restore collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed");
      if (saved !== null) {
        setSidebarCollapsed(saved === "true");
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Fullscreen displays, player, or standalone editors without sidebar
  const isFullscreenView =
    pathname === "/screen" ||
    pathname === "/homescreen" ||
    pathname === "/player" ||
    pathname === "/login" ||
    pathname === "/playlists/new" ||
    (pathname?.startsWith("/playlists/") && pathname !== "/playlists");

  if (isFullscreenView) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Left Sidebar */}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-1 flex-col overflow-x-hidden min-w-0 transition-all duration-300">
        <MobileHeader onOpenMobileMenu={() => setMobileOpen(true)} />

        {/* Floating Restore Button when desktop sidebar is collapsed */}
        {sidebarCollapsed && (
          <div className="hidden lg:block sticky top-3 left-3 z-40 px-4 pt-3 pb-0 pointer-events-none">
            <button
              type="button"
              onClick={handleToggleCollapse}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 backdrop-blur-xs px-3 py-2 text-xs font-semibold text-slate-700 shadow-md hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 group"
              title="Hiện thanh điều hướng (Sidebar)"
            >
              <svg
                className="h-4 w-4 text-emerald-600 transition group-hover:scale-110"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <span>Hiện Sidebar</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                Menu
              </span>
            </button>
          </div>
        )}

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
