"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminListUsers, adminListDocuments, adminGraphOverview, getAIConfig } from "@/lib/api";

interface Stats {
  users: number;
  pendingUsers: number;
  documents: number;
  processing: number;
  nodes: number;
  relations: number;
  aiConfigs: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ users: 0, pendingUsers: 0, documents: 0, processing: 0, nodes: 0, relations: 0, aiConfigs: 0 });

  useEffect(() => {
    Promise.all([
      adminListUsers(1, 1),
      adminListUsers(1, 1, undefined, undefined, false),
      adminListDocuments(1, 1),
      adminListDocuments(1, 1, "parsing"),
      adminListDocuments(1, 1, "extracting"),
      adminGraphOverview(),
      getAIConfig().catch(() => ({ configs: [] })),
    ]).then(([allUsers, pendingUsers, docs, parsingDocs, extractingDocs, graph, aiCfg]) => {
      setStats({
        users: allUsers.total,
        pendingUsers: pendingUsers.total,
        documents: docs.total,
        processing: parsingDocs.total + extractingDocs.total,
        nodes: graph.nodes.length,
        relations: graph.relations?.length ?? 0,
        aiConfigs: aiCfg.configs?.length ?? 0,
      });
    });
  }, []);

  const cards = [
    { label: "用户总数", value: stats.users, href: "/admin/users", icon: "👤", gradient: "from-blue-500/8 to-blue-500/3", text: "text-blue-700" },
    { label: "待审批", value: stats.pendingUsers, href: "/admin/users?status=pending", icon: "⏳", gradient: "from-amber-500/8 to-amber-500/3", text: "text-amber-700" },
    { label: "文档总数", value: stats.documents, href: "/admin/documents", icon: "📄", gradient: "from-green-500/8 to-green-500/3", text: "text-green-700" },
    { label: "处理中", value: stats.processing, href: "/admin/documents?status=parsing", icon: "⚙️", gradient: "from-yellow-500/8 to-yellow-500/3", text: "text-yellow-700" },
    { label: "图谱节点", value: stats.nodes, href: "/admin/graph", icon: "🕸️", gradient: "from-purple-500/8 to-purple-500/3", text: "text-purple-700" },
    { label: "图谱关系", value: stats.relations, href: "/admin/graph", icon: "🔗", gradient: "from-pink-500/8 to-pink-500/3", text: "text-pink-700" },
    { label: "AI 配置项", value: stats.aiConfigs, href: "/admin/ai", icon: "🤖", gradient: "from-[#9A8C73]/8 to-[#9A8C73]/3", text: "text-[#6B5D50]" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold">管理概览</h1>
        <span className="rounded-full bg-[#9A8C73]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#6B5D50]">实时数据</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`group relative overflow-hidden rounded-xl border border-[#DBC7B5]/25 bg-gradient-to-br ${c.gradient} p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#9A8C73]/30`}
          >
            <div className="mb-2 text-xl">{c.icon}</div>
            <p className="text-[11px] font-medium text-[#6B5D50]">{c.label}</p>
            <p className={`mt-0.5 text-2xl font-bold ${c.text}`}>{c.value}</p>
            {/* Hover sheen */}
            <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-bold text-[#4a3e34]">快捷操作</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "用户管理", href: "/admin/users", icon: "👤" },
            { label: "文档审核", href: "/admin/documents", icon: "📄" },
            { label: "图谱管理", href: "/admin/graph", icon: "🕸️" },
            { label: "器材管理", href: "/admin/equipment", icon: "🔧" },
            { label: "AI 配置", href: "/admin/ai", icon: "🤖" },
            { label: "模板审核", href: "/admin/templates", icon: "📋" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center gap-1.5 rounded-xl border border-[#DBC7B5]/20 bg-[#F4F1EE]/50 px-3.5 py-2 text-xs font-medium text-[#4a3e34] transition-all hover:border-[#9A8C73]/30 hover:bg-[#F4F1EE] hover:shadow-sm"
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
