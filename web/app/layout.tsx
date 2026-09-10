import type { Metadata } from "next";
import "./globals.css";
import { ClerkAppProvider } from "@/components/ClerkWrapper";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Tapio Analytics",
  description: "Hệ thống đo lường hiệu quả quảng cáo & màn hình trình chiếu thông minh",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="min-h-screen antialiased bg-[#f8fafc]" suppressHydrationWarning>
        <ClerkAppProvider>
          <AppShell>{children}</AppShell>
        </ClerkAppProvider>
      </body>
    </html>
  );
}
