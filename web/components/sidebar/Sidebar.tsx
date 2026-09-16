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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  mobileOpen,
  onMobileClose,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const [showScreenModal, setShowScreenModal] = useState(false);

  // Close mobile drawer when route changes
  useEffect(() => {
    onMobileClose();
  }, [pathname, onMobileClose]);

  return (
    <>
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside
        className={`hidden ${
          collapsed ? "lg:hidden" : "lg:flex"
        } w-64 flex-col border-r border-slate-200/80 bg-white min-h-screen shrink-0 sticky top-0 h-screen z-30 shadow-2xs transition-all duration-300`}
      >
        {/* Brand Header with Hide Button */}
        <div className="flex items-center justify-between border-b border-slate-100 px-2.5 py-3">
          <div className="flex-1 min-w-0">
            <SidebarBrand />
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Ẩn thanh điều hướng (Sidebar)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
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
