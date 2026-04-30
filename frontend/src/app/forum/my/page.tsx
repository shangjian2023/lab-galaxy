"use client";

import { useEffect, useState, useCallback } from "react";
import { getMyForumThreads, getMyForumBookmarks } from "@/lib/api";
import type { ForumThread } from "@/lib/api";
import ThreadList from "@/components/forum/ThreadList";

type Tab = "threads" | "bookmarks";

export default function MyForumPage() {
  const [activeTab, setActiveTab] = useState<Tab>("threads");
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const pageSize = 15;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "threads") {
        const res = await getMyForumThreads(page);
        setThreads(res.items);
        setTotal(res.total);
      } else {
        const res = await getMyForumBookmarks(page);
        setThreads(res.items);
        setTotal(res.total);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <div className="liquid-glass-card px-5 py-4">
          <h1 className="text-xl font-bold text-gray-800">我的帖子</h1>
          <p className="text-xs text-gray-500">查看发布的帖子和收藏</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-white/30 p-1 ring-1 ring-white/40">
        <button
          onClick={() => { setActiveTab("threads"); setPage(1); }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "threads" ? "bg-white text-orange-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          我的帖子
        </button>
        <button
          onClick={() => { setActiveTab("bookmarks"); setPage(1); }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "bookmarks" ? "bg-white text-orange-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          我的收藏
        </button>
      </div>

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
