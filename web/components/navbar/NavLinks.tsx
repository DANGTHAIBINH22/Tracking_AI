"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAV_ITEMS } from "./nav-config";
import { NavScreensDropdown } from "./NavScreensDropdown";

interface NavLinksProps {
  onOpenScreenModal: () => void;
}

export function NavLinks({ onOpenScreenModal }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 lg:flex text-xs font-medium">
      {/* Primary Links */}
      {MAIN_NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all duration-150 ${
              isActive
                ? "bg-emerald-50/90 font-semibold text-emerald-800 shadow-xs ring-1 ring-emerald-200/60"
                : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
            }`}
          >
            <span className="text-sm">{item.icon}</span>
            <span>{item.label}</span>
            {isActive && (
              <span className="absolute bottom-[-1px] left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-emerald-600" />
            )}
          </Link>
        );
      })}

      {/* Screens & Devices Dropdown */}
      <NavScreensDropdown onOpenScreenModal={onOpenScreenModal} />
    </nav>
  );
}
