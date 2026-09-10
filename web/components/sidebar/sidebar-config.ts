export interface SidebarItem {
  href: string;
  label: string;
  exact?: boolean;
}

export const SIDEBAR_NAV_ITEMS: SidebarItem[] = [
  { href: "/", label: "Tổng quan", exact: true },
  { href: "/ads", label: "Thư viện Media" },
  { href: "/playlists", label: "Quản lý Playlist" },
  { href: "/admin", label: "Thiết bị" },
];

export const SECONDARY_ITEMS = [
  { href: "/screen", label: "Màn hình TV Client" },
  { href: "/homescreen", label: "Homescreen Display" },
];
