"use client";

import { useEffect, useState, useCallback } from "react";
import { listForumThreads, listForumBoards } from "@/lib/api";
import type { ForumThread, ForumBoard } from "@/lib/api";
import ThreadList from "@/components/forum/ThreadList";
import BoardNav from "@/components/forum/BoardNav";
import Link from "next/link";
import { useSearchParams, useRouter, useParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "newest", label: "最新" },
  { value: "popular", label: "最热" },
  { value: "latest_reply", label: "最新回复" },
];

export default function BoardPage() {
  const router = useRouter();
  const params = useParams<{ board: string }>();
  const board = params?.board ?? "";
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<ForumBoard[]>([]);

  const pageSize = 15;

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listForumThreads({
        board: board,
        sort,
        keyword: keyword || undefined,
        page,
        page_size: pageSize,
      });
      setThreads(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [board, sort, keyword, page]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    listForumBoards()
      .then((res) => setBoards(res.boards))
      .catch(console.error);
  }, []);

  const boardInfo = boards.find((b) => b.slug === board);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-4">
        <div className="liquid-glass-card px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/forum" className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">
                  {boardInfo ? `${boardInfo.icon} ${boardInfo.name}` : board}
                </h1>
                <p className="text-xs text-gray-500">{boardInfo?.description}</p>
              </div>
            </div>
            <Link href={`/forum/new?board=${board}`} className="btn-primary rounded-lg px-4 py-2 text-xs font-medium">
              发帖
            </Link>
          </div>
        </div>
      </div>

      {/* Board Nav */}
      <div className="mb-3">
        <BoardNav activeBoard={board} />
      </div>

      {/* Sort & Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/30 p-1 ring-1 ring-white/40">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => { setSort(s.value); setPage(1); }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                sort === s.value ? "bg-white text-orange-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          onKeyDown={(e) => e.key === "Enter" && void loadThreads()}
          placeholder="搜索帖子..."
          className="ml-auto w-40 rounded-lg bg-white/50 px-3 py-1.5 text-xs ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
        />
      </div>

      {/* Thread List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-400">加载中...</p>
        </div>
      ) : (
        <ThreadList
          threads={threads}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}
    </main>
  );
}
