"use client";

import Link from "next/link";
import { getBoardInfo, getPostTypeInfo } from "./PostTypeBadge";
import { getStatusInfo } from "./StatusBadge";
import AuthorBadge from "./AuthorBadge";
import { timeAgo } from "./timeAgo";
import type { ForumThread } from "@/lib/api";

interface Props {
  thread: ForumThread;
}

export default function ThreadCard({ thread }: Props) {
  const boardInfo = getBoardInfo(thread.board);
  const postTypeInfo = getPostTypeInfo(thread.post_type);
  const statusInfo = getStatusInfo(thread.status);

  return (
    <Link
      href={`/forum/thread/${thread.id}`}
      className="liquid-glass-compact block p-4 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <span className="text-2xl">{boardInfo.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-white/40">
              {boardInfo.label}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium ring-1" style={{ color: postTypeInfo.color, backgroundColor: `${postTypeInfo.color}10` }}>
              {postTypeInfo.label}
            </span>
            {thread.is_featured && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200/40">⭐ 精华</span>
            )}
            {thread.status !== "open" && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusInfo.bgColor}`} style={{ color: statusInfo.color }}>
                {statusInfo.label}
              </span>
            )}
          </div>

          <h3 className="mt-1.5 line-clamp-1 text-sm font-semibold text-gray-800">
            {thread.title}
          </h3>

          <div className="mt-1.5 flex items-center justify-between">
            <AuthorBadge nickname={thread.author_nickname} level={thread.author_level} avatar={thread.author_avatar} />
            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              <span>💬 {thread.reply_count}</span>
              <span>❤️ {thread.like_count}</span>
              <span>👁 {thread.view_count}</span>
              <span>{timeAgo(thread.created_at)}</span>
            </div>
          </div>

          {thread.tags && thread.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {thread.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="rounded-full bg-white/30 px-2 py-0.5 text-[9px] text-gray-500 ring-1 ring-white/30">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
