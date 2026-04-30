"use client";

import { useState, useCallback } from "react";
import type { ForumThread } from "@/lib/api";
import ThreadCard from "./ThreadCard";

interface Props {
  threads: ForumThread[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function ThreadList({ threads, total, page, pageSize, onPageChange }: Props) {
  const totalPages = Math.ceil(total / pageSize);

  if (threads.length === 0) {
    return (
      <div className="liquid-glass-card flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-3xl">🌿</p>
          <p className="mt-2 text-sm text-gray-400">暂无帖子，快来发布第一条吧</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
