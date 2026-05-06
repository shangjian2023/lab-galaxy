"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { listForumBoards, listForumThreads } from "@/lib/api";
import type { ForumBoard, ForumThread } from "@/lib/api";
import BoardCard from "@/components/forum/BoardCard";
import ThreadCard from "@/components/forum/ThreadCard";
import ThreadList from "@/components/forum/ThreadList";

const SORT_OPTIONS = [
  { value: "hot", label: "综合" },
  { value: "popular", label: "最热" },
  { value: "newest", label: "最新" },
];

const POST_TYPE_FILTERS = [
  { value: "", label: "全部" },
  { value: "regular", label: "讨论" },
  { value: "insight", label: "发现" },
  { value: "prediction", label: "预测" },
  { value: "challenge", label: "挑战" },
  { value: "exchange-diary", label: "交换日记" },
  { value: "cold-knowledge", label: "冷知识" },
];

const PAGE_SIZE = 15;

export default function ForumPage() {
  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);

  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("hot");
  const [postType, setPostType] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(false);

  useEffect(() => {
    listForumBoards()
      .then((res) => setBoards(res.boards))
      .catch(console.error)
      .finally(() => setBoardsLoading(false));
  }, []);

  const fetchThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await listForumThreads({
        sort,
        post_type: postType || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setThreads(res.items);
      setTotal(res.total);
    } catch {
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }, [sort, postType, page]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="liquid-glass-card px-6 py-5">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🧪</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">知识发酵池</h1>
              <p className="text-sm text-gray-700">让静态的知识在这里产生化学反应</p>
            </div>
          </div>
        </div>
      </div>

      {/* Board cards */}
      <div className="mb-8">
        {boardsLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-black">加载板块...</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board, i) => (
              <BoardCard key={board.slug} board={board} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        <span className="text-xs font-medium text-black">全部帖子</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
      </div>

      {/* Filters & Sort */}
      <div className="mb-4 space-y-3">
        {/* Post type filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          {POST_TYPE_FILTERS.map((pt) => (
            <button
              key={pt.value}
              onClick={() => { setPostType(pt.value); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                postType === pt.value
                  ? "bg-orange-500 text-white shadow-sm"
                  : "bg-white/50 text-gray-700 ring-1 ring-white/40 hover:bg-white/70"
              }`}
            >
              {pt.label}
            </button>
          ))}
        </div>

        {/* Sort options */}
        <div className="flex items-center gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setSort(opt.value); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                sort === opt.value
                  ? "bg-gray-800 text-white shadow-sm"
                  : "bg-white/50 text-gray-700 ring-1 ring-white/40 hover:bg-white/70"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="flex-1" />
          <Link
            href="/forum/new"
            className="btn-primary rounded-lg px-4 py-1.5 text-xs font-medium"
          >
            + 发帖
          </Link>
        </div>
      </div>

      {/* Thread list */}
      {threadsLoading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-black">加载中...</p>
        </div>
      ) : (
        <ThreadList
          threads={threads}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </main>
  );
}
