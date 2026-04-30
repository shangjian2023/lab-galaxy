"use client";

import { useEffect, useState } from "react";
import { listForumBoards } from "@/lib/api";
import type { ForumBoard } from "@/lib/api";
import BoardCard from "@/components/forum/BoardCard";

export default function ForumPage() {
  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listForumBoards()
      .then((res) => setBoards(res.boards))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <div className="liquid-glass-card px-6 py-5">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🧪</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">知识发酵池</h1>
              <p className="text-sm text-gray-500">让静态的知识在这里产生化学反应</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-400">加载中...</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board, i) => (
            <BoardCard key={board.slug} board={board} index={i} />
          ))}
        </div>
      )}
    </main>
  );
}
