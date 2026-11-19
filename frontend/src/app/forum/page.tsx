"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { listForumBoards, listForumThreads } from "@/lib/api";
import type { ForumBoard, ForumThread } from "@/lib/api";
import BoardCard from "@/components/forum/BoardCard";
import ThreadCard from "@/components/forum/ThreadCard";
import ThreadList from "@/components/forum/ThreadList";
import { PageHeader } from "@/components/app/PageHeader";

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
  const [boardsError, setBoardsError] = useState("");

  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("hot");
  const [postType, setPostType] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState("");

  useEffect(() => {
    listForumBoards()
      .then((res) => setBoards(res.boards))
      .catch(() => setBoardsError("论坛板块服务尚未接入新版数据源，当前无法读取真实板块。"))
      .finally(() => setBoardsLoading(false));
  }, []);

  const fetchThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError("");
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
      setTotal(0);
      setThreadsError("论坛帖子服务尚未接入新版数据源，当前无法读取真实帖子。");
    } finally {
      setThreadsLoading(false);
    }
  }, [sort, postType, page]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return (
    <main className="atlas-legacy-page">
      <PageHeader eyebrow="RESEARCH COMMONS / 知识发酵池" title="让问题，在讨论中继续生长。" description="围绕实验发现、方法与研究问题展开讨论。帖子与板块只在真实服务返回后展示。" actions={<Link href="/forum/new" className="btn btn-primary">发布研究讨论</Link>} />

      {/* Board cards */}
      {boardsError ? <div className="form-message error mb-6" role="alert">{boardsError}</div> : null}
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
        </div>
      </div>

      {/* Thread list */}
      {threadsLoading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-black">加载中...</p>
        </div>
      ) : threadsError ? (
        <div className="form-message error" role="alert">{threadsError}</div>
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
