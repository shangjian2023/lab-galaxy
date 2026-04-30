"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const NAV_ITEMS = [
  { href: "/graph", label: "知识图谱" },
  { href: "/workbench", label: "工作台" },
  { href: "/forum", label: "🧪 知识发酵池" },
  { href: "/templates", label: "模板市场" },
];

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <nav className="glass-light sticky top-0 z-40 px-8 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold text-[#1a1612]">
            创新实验知识图谱平台
          </Link>
          {user && (
            <div className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-4 py-2 text-sm text-[#6b5e50] hover:bg-[rgba(249,115,22,0.06)] hover:text-brand-600 transition-all"
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
                <Link href="/admin" className="glass-button rounded-xl px-4 py-2 text-sm font-medium text-brand-600">
                  管理后台
                </Link>
              )}
              <Link href="/profile" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#6b5e50] hover:bg-[rgba(249,115,22,0.06)] transition-all">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {user.level}
                </span>
                <span>{user.nickname || user.username}</span>
              </Link>
              <button
                onClick={logout}
                className="btn-secondary rounded-xl px-4 py-2 text-sm text-[#6b5e50]"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary rounded-xl px-5 py-2 text-sm text-[#6b5e50]">
                登录
              </Link>
              <Link href="/register" className="btn-primary rounded-xl px-5 py-2 text-sm">
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
