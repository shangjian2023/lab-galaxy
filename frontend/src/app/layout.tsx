import type { Metadata } from "next";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query";
import { AuthProvider } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import ToastBar from "@/components/ToastBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "创新实验知识图谱平台",
  description: "知识图谱驱动的创新实验管理平台",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: '"KaiTi", "楷体", "STKaiti", "楷体_GB2312", "AR PL UKai CN", serif' }} className="antialiased">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Navbar />
            {children}
            <ToastBar />
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
