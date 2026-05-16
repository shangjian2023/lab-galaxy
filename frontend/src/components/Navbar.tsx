"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const NAV_ITEMS = [
  { href: "/graph", label: "知识图谱" },
  { href: "/workbench", label: "工作台" },
  { href: "/team", label: "团队空间" },
  { href: "/forum", label: "知识发酵池" },
  { href: "/templates", label: "模板市场" },
  { href: "/equipment", label: "实验器材" },
];

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#F4F1EE]/95 shadow-lg shadow-[#9A8C73]/5 backdrop-blur-md"
          : "bg-[#F4F1EE]/80 backdrop-blur-sm"
      }`}
      style={{ borderBottom: "1px solid rgba(154,140,115,0.12)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-3.5">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold text-[#8C3232]">
            创新实验知识图谱平台
          </Link>
          {user && (
            <div className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3.5 py-1.5 text-sm text-[#8C3232] transition-colors hover:bg-[#9A8C73]/10 hover:text-[#6B2020]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {isAdmin && (
                <Link href="/admin" className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#9A8C73] transition-colors hover:bg-[#9A8C73]/10">
                  管理后台
                </Link>
              )}
              <Link href="/profile" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[#4a3e34] transition-colors hover:bg-[#9A8C73]/10">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#9A8C73]/20 text-xs font-bold text-[#6B5D50]">
                  {user.level}
                </span>
                <span className="hidden sm:inline">{user.nickname || user.username}</span>
              </Link>
              <button
                onClick={logout}
                className="rounded-lg border border-[#9A8C73]/30 bg-[#F4F1EE] px-3.5 py-1.5 text-sm text-[#4a3e34] transition-all hover:bg-[#9A8C73]/10 hover:border-[#9A8C73]/50"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg border border-[#9A8C73]/30 px-4 py-1.5 text-sm text-[#4a3e34] transition-all hover:bg-[#9A8C73]/10 hover:border-[#9A8C73]/50">
                登录
              </Link>
              <Link href="/register" className="rounded-lg bg-[#9A8C73] px-4 py-1.5 text-sm font-medium text-white transition-all hover:bg-[#8C7D70] hover:shadow-md hover:shadow-[#9A8C73]/20">
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
