"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarBrand } from "./SidebarBrand";
import { SidebarNav } from "./SidebarNav";
import { SidebarUser } from "./SidebarUser";
import { TrackingControlButton } from "@/components/TrackingControlButton";
import { ScreenManagerModal } from "@/components/ScreenManagerModal";
import { IconClose } from "@/components/icons/Icons";

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [showScreenModal, setShowScreenModal] = useState(false);

  // Close mobile drawer when route changes
  useEffect(() => {
    onMobileClose();
  }, [pathname, onMobileClose]);

  return (
    <>
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200/80 bg-white min-h-screen shrink-0 sticky top-0 h-screen z-30 shadow-2xs">
        {/* Brand Header */}
        <div className="border-b border-slate-100 px-3 py-3">
          <SidebarBrand />
        </div>

        {/* Tracking Action Button */}
        <div className="px-4 pt-3 pb-1">
          <TrackingControlButton className="w-full justify-center" />
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto">
          <SidebarNav
            onOpenScreenModal={() => setShowScreenModal(true)}
          />
        </div>

        {/* User Profile Footer */}
        <SidebarUser />
      </aside>

      {/* ================= MOBILE DRAWER ================= */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            onClick={onMobileClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          />

          {/* Drawer Panel */}
          <div className="relative flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {/* Header with Close */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <SidebarBrand />
              <button
                type="button"
                onClick={onMobileClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            {/* Tracking Action Button */}
            <div className="px-4 pt-3 pb-1">
              <TrackingControlButton className="w-full justify-center" />
            </div>

            {/* Scrollable Nav */}
            <div className="flex-1 overflow-y-auto">
              <SidebarNav
                onOpenScreenModal={() => {
                  onMobileClose();
                  setShowScreenModal(true);
                }}
                onItemClick={onMobileClose}
              />
            </div>

            {/* User Footer */}
            <SidebarUser />
          </div>
        </div>
      )}

      {/* Screen Manager Modal */}
      <ScreenManagerModal
        isOpen={showScreenModal}
        onClose={() => setShowScreenModal(false)}
      />
    </>
  );
}
