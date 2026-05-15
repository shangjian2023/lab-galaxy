"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminListUsers, adminListDocuments, adminGraphOverview } from "@/lib/api";

interface Stats {
  users: number;
  pendingUsers: number;
  documents: number;
  processing: number;
  nodes: number;
  relations: number;
}

const ADMIN_LINKS = [
  { label: "用户管理", href: "/admin/users", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z", color: "from-blue-500/10 to-blue-500/5", border: "border-blue-400/30", text: "text-blue-700", iconBg: "bg-blue-500/15" },
  { label: "待审批", href: "/admin/users", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", color: "from-amber-500/10 to-amber-500/5", border: "border-amber-400/30", text: "text-amber-700", iconBg: "bg-amber-500/15" },
  { label: "文档管理", href: "/admin/documents", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", color: "from-green-500/10 to-green-500/5", border: "border-green-400/30", text: "text-green-700", iconBg: "bg-green-500/15" },
  { label: "处理中", href: "/admin/documents", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15", color: "from-yellow-500/10 to-yellow-500/5", border: "border-yellow-400/30", text: "text-yellow-700", iconBg: "bg-yellow-500/15" },
  { label: "图谱管理", href: "/admin/graph", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1", color: "from-purple-500/10 to-purple-500/5", border: "border-purple-400/30", text: "text-purple-700", iconBg: "bg-purple-500/15" },
  { label: "AI 配置", href: "/admin/ai", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", color: "from-[#9A8C73]/10 to-[#9A8C73]/5", border: "border-[#9A8C73]/30", text: "text-[#6B5D50]", iconBg: "bg-[#9A8C73]/15" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ users: 0, pendingUsers: 0, documents: 0, processing: 0, nodes: 0, relations: 0 });

  useEffect(() => {
    Promise.all([
      adminListUsers(1, 1),
      adminListUsers(1, 1, undefined, undefined, false),
      adminListDocuments(1, 1),
      adminListDocuments(1, 1, "parsing"),
      adminListDocuments(1, 1, "extracting"),
      adminGraphOverview(),
    ]).then(([allUsers, pendingUsers, docs, parsingDocs, extractingDocs, graph]) => {
      setStats({
        users: allUsers.total,
        pendingUsers: pendingUsers.total,
        documents: docs.total,
        processing: parsingDocs.total + extractingDocs.total,
        nodes: graph.nodes.length,
        relations: graph.relations?.length ?? 0,
      });
    });
  }, []);

  const values = [stats.users, stats.pendingUsers, stats.documents, stats.processing, stats.nodes, stats.relations];

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">管理概览</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {ADMIN_LINKS.map((c, i) => (
          <Link key={c.label} href={c.href} className={`group relative overflow-hidden rounded-xl border ${c.border} bg-gradient-to-br ${c.color} p-4 transition-all hover:shadow-md hover:-translate-y-0.5`}>
            <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${c.iconBg}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={c.icon} />
              </svg>
            </div>
            <p className="text-xs font-medium opacity-75">{c.label}</p>
            <p className={`mt-0.5 text-xl font-bold ${c.text}`}>{values[i]}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
