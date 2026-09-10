import { NavItem, ScreenOption } from "./nav-types";

export const MAIN_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan" },
  { href: "/ads", label: "Thư viện Media" },
  { href: "/playlists", label: "Quản lý Playlist" },
  { href: "/admin", label: "Thiết bị" },
];

export const SCREEN_OPTIONS: ScreenOption[] = [
  {
    id: "screen-manager",
    label: "Quản lý thiết bị TV",
    description: "Ghép mã kết nối & cấu hình màn hình hiển thị",
    action: "modal",
  },
  {
    id: "tv-screen",
    label: "Màn hình TV Client",
    description: "Giao diện chạy trực tiếp trên Smart TV hoặc Android Box",
    href: "/screen",
  },
  {
    id: "homescreen",
    label: "Homescreen Display",
    description: "Màn hình trình chiếu vòng lặp AI tự động",
    href: "/homescreen",
  },
];
