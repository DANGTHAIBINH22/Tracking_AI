"use client";

import { usePathname } from "next/navigation";
import { DockNav } from "@/components/sidebar/DockNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Fullscreen displays, player, or standalone editors without navigation
  const isFullscreenView =
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
      {/* Desktop: a floating dock in a slim rail (was a 256px sidebar). It is
          always this narrow, so there is no collapse toggle any more. */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[76px] shrink-0 items-center justify-center lg:flex">
        <DockNav orientation="vertical" />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
        {/* Bottom padding on phones keeps the last row clear of the dock. */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      {/* Phones and tablets: the same dock along the bottom edge. */}
      <nav className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 lg:hidden">
        <DockNav orientation="horizontal" />
      </nav>
    </div>
  );
}
