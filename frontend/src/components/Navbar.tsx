"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const NAV_ITEMS = [
  { href: "/graph", label: "知识图谱" },
  { href: "/workbench", label: "工作台" },
  { href: "/templates", label: "模板市场" },
];

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-gray-800">
          创新实验知识图谱平台
        </Link>
        {user && (
          <div className="flex items-center gap-4">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-gray-600 hover:text-brand-600 transition-colors">
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            {isAdmin && (
              <Link href="/admin" className="text-sm text-orange-600 font-medium hover:text-orange-700">
                管理后台
              </Link>
            )}
            <Link href="/profile" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {user.level}
              </span>
              <span>{user.nickname || user.username}</span>
            </Link>
            <button
              onClick={logout}
              className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              退出
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-sm text-blue-600 hover:underline">
              登录
            </Link>
            <Link href="/register" className="text-sm text-blue-600 hover:underline">
              注册
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
