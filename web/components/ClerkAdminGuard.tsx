"use client";

import React from "react";

export function ClerkAdminGuard({ children }: { children: React.ReactNode }) {
  // [DEV MODE]: Tạm thời tắt chức năng đăng nhập - cho phép truy cập trực tiếp toàn quyền
  return <>{children}</>;
}
