"use client";

import { useEffect, useState } from "react";
import { adminListUsers, adminListDocuments, adminGraphOverview } from "@/lib/api";
import type { UserProfile, DocumentItem, GraphNode, GraphRelation } from "@/lib/api";

interface Stats {
  users: number;
  documents: number;
  processing: number;
  nodes: number;
  relations: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ users: 0, documents: 0, processing: 0, nodes: 0, relations: 0 });

  useEffect(() => {
    Promise.all([
      adminListUsers(1, 1),
      adminListDocuments(1, 1),
      adminGraphOverview(),
    ]).then(([users, docs, graph]) => {
      setStats({
        users: users.length,
        documents: docs.total,
        processing: docs.items.filter((d) => d.status === "parsing" || d.status === "extracting").length,
        nodes: graph.nodes.length,
        relations: graph.relations.length,
      });
    });
  }, []);

  const cards = [
    { label: "用户总数", value: stats.users, color: "bg-blue-50 text-blue-700" },
    { label: "文档总数", value: stats.documents, color: "bg-green-50 text-green-700" },
    { label: "处理中", value: stats.processing, color: "bg-yellow-50 text-yellow-700" },
    { label: "图谱节点", value: stats.nodes, color: "bg-purple-50 text-purple-700" },
    { label: "图谱关系", value: stats.relations, color: "bg-orange-50 text-orange-700" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">管理概览</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl p-4 ${c.color}`}>
            <p className="text-xs font-medium opacity-75">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
