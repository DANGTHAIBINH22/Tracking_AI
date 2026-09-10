"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NavBrand } from "./NavBrand";
import { NavLinks } from "./NavLinks";
import { NavUserMenu } from "./NavUserMenu";
import { NavMobileMenu } from "./NavMobileMenu";
import { TrackingControlButton } from "@/components/TrackingControlButton";
import { ScreenManagerModal } from "@/components/ScreenManagerModal";

export function Navbar() {
  const pathname = usePathname();
  const [showScreenModal, setShowScreenModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Exclude fullscreen playback / dedicated CMS editor pages
  if (
    pathname?.startsWith("/playlists") ||
    pathname === "/homescreen" ||
    pathname === "/screen" ||
    pathname === "/player"
  ) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-all">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
          {/* Left: Brand & Desktop Navigation */}
          <div className="flex items-center gap-6 lg:gap-8">
            <NavBrand />
            <NavLinks onOpenScreenModal={() => setShowScreenModal(true)} />
          </div>

          {/* Right: Controls, User Auth & Mobile Hamburger */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Live Camera Tracking Toggle */}
            <div className="hidden xs:block">
              <TrackingControlButton />
            </div>

            {/* Desktop User Menu / Auth */}
            <div className="hidden lg:flex items-center">
              <NavUserMenu />
            </div>

            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
            >
              {mobileMenuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <NavMobileMenu
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          onOpenScreenModal={() => setShowScreenModal(true)}
        />
      </header>

      {/* Screen Manager Modal */}
      <ScreenManagerModal
        isOpen={showScreenModal}
        onClose={() => setShowScreenModal(false)}
      />
    </>
  );
}

// Alias for compatibility
export { Navbar as HeaderNav };
