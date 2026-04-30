"use client";

import Link from "next/link";
import { getBoardInfo } from "./PostTypeBadge";

interface Props {
  activeBoard?: string;
}

export default function BoardNav({ activeBoard }: Props) {
  const boards = [
    { slug: "methodology", icon: "🔬", name: "方法论堂" },
    { slug: "graph_hall", icon: "🗺️", name: "图谱议事厅" },
    { slug: "emergency_room", icon: "🏥", name: "实验急诊室" },
    { slug: "aha_square", icon: "💡", name: "Aha! 广场" },
    { slug: "cross_discipline", icon: "💥", name: "学科撞车" },
    { slug: "announcements", icon: "📢", name: "公告堂" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl bg-white/30 px-3 py-2 ring-1 ring-white/50">
      <Link
        href="/forum"
        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
          !activeBoard
            ? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-200/50"
            : "text-gray-500 hover:bg-white/60"
        }`}
      >
        全部
      </Link>
      {boards.map((b) => (
        <Link
          key={b.slug}
          href={`/forum/${b.slug}`}
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all ${
            activeBoard === b.slug
              ? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-200/50"
              : "text-gray-500 hover:bg-white/60"
          }`}
        >
          <span>{b.icon}</span>
          {b.name}
        </Link>
      ))}
    </div>
  );
}
