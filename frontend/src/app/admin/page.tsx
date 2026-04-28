"use client";

import { useEffect, useState } from "react";
import { adminListUsers, adminListDocuments, adminGraphOverview } from "@/lib/api";

interface Stats {
  users: number;
  pendingUsers: number;
  documents: number;
  processing: number;
  nodes: number;
  relations: number;
}

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
        relations: graph.relations.length,
      });
    });
  }, []);

  const cards = [
    { label: "用户总数", value: stats.users, color: "border-l-4 border-l-blue-400 text-blue-700" },
    { label: "待审批", value: stats.pendingUsers, color: "border-l-4 border-l-red-400 text-red-700" },
    { label: "文档总数", value: stats.documents, color: "border-l-4 border-l-green-400 text-green-700" },
    { label: "处理中", value: stats.processing, color: "border-l-4 border-l-yellow-400 text-yellow-700" },
    { label: "图谱节点", value: stats.nodes, color: "border-l-4 border-l-purple-400 text-purple-700" },
    { label: "图谱关系", value: stats.relations, color: "border-l-4 border-l-orange-400 text-orange-700" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">管理概览</h1>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className={`glass-card rounded-xl p-4 ${c.color}`}>
            <p className="text-xs font-medium opacity-75">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
