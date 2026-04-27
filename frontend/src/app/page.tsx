"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getDashboard, type DashboardData } from "@/lib/api";

export default function Home() {
  const { user, loading } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (user) getDashboard().then(setDashboard).catch(() => {});
  }, [user]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">加载中...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-[calc(100vh-53px)] flex-col items-center justify-center px-6">
        <h1 className="mb-2 text-4xl font-bold text-gray-800">创新实验知识图谱平台</h1>
        <p className="mb-10 text-lg text-gray-500">AI 驱动的实验知识管理与发现</p>
        <div className="flex justify-center gap-4">
          <Link href="/login" className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            登录
          </Link>
          <Link href="/register" className="rounded-lg border px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            注册
          </Link>
        </div>
      </main>
    );
  }

  const stats = dashboard?.stats ?? { document_count: 0, template_count: 0, points: user.points, level: user.level };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            欢迎回来，{user.nickname || user.username}
          </h1>
          <p className="mt-1 text-sm text-gray-500">这里是你的知识图谱工作台概览</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {stats.level}
          </span>
          <span className="text-sm text-gray-500">{stats.points} 成长值</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "我的文档", value: stats.document_count, href: "/documents", color: "bg-blue-50 text-blue-600" },
          { label: "我的模板", value: stats.template_count, href: "/templates", color: "bg-purple-50 text-purple-600" },
          { label: "成长值", value: stats.points, href: "/growth", color: "bg-orange-50 text-orange-600" },
          { label: "当前等级", value: `Lv.${stats.level}`, href: "/growth", color: "bg-green-50 text-green-600" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color.split(" ")[1]}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "上传文档", href: "/documents", icon: "M12 4v16m8-8H4" },
          { label: "知识图谱", href: "/graph", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
          { label: "模板市场", href: "/templates", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" },
          { label: "工作台", href: "/workbench", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
        ].map((a) => (
          <Link key={a.label} href={a.href} className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={a.icon} />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">{a.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent documents */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-gray-800">最近文档</h2>
          {(!dashboard?.recent_documents || dashboard.recent_documents.length === 0) ? (
            <p className="text-sm text-gray-400">暂无文档，去<a href="/documents" className="text-brand-600 hover:underline">上传</a>吧</p>
          ) : (
            <div className="space-y-2">
              {dashboard.recent_documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-700 truncate max-w-[200px]">{doc.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    doc.status === "completed" ? "bg-green-100 text-green-700" :
                    doc.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{doc.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent points */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-gray-800">最近积分变动</h2>
          {(!dashboard?.recent_points || dashboard.recent_points.length === 0) ? (
            <p className="text-sm text-gray-400">暂无积分记录</p>
          ) : (
            <div className="space-y-2">
              {dashboard.recent_points.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span className="text-gray-600">{p.reason}</span>
                  <span className="font-bold text-brand-600">+{p.change}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
