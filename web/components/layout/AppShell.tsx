"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { MobileHeader } from "@/components/sidebar/MobileHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
      />

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-1 flex-col overflow-x-hidden min-w-0">
        <MobileHeader onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
