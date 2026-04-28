import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query";
import { AuthProvider } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "创新实验知识图谱平台",
  description: "知识图谱驱动的创新实验管理平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="font-sans bg-[#faf7f5] text-[#1a1612] antialiased">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Navbar />
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
