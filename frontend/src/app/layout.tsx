import type { Metadata } from "next";
import { AppProviders } from "@/components/app/AppProviders";
import { AppShell } from "@/components/app/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lab Galaxy · 创新实验知识平台", template: "%s · Lab Galaxy" },
  description: "让实验文档、知识与研究结论连接成可探索的知识网络。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
