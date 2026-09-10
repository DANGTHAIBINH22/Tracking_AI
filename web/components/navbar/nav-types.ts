export interface NavItem {
  href: string;
  label: string;
  icon?: string;
  description?: string;
  isExternal?: boolean;
}

export interface ScreenOption {
  id: string;
  label: string;
  description: string;
  icon?: string;
  href?: string;
  action?: "modal";
}
