"use client";

import { useState, useCallback } from "react";
import type { ForumThread, ForumReply } from "@/lib/api";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getBoardInfo, getPostTypeInfo } from "./PostTypeBadge";
import { getStatusInfo } from "./StatusBadge";
import AuthorBadge from "./AuthorBadge";
import MentionHighlight from "./MentionHighlight";
import { timeAgo } from "./timeAgo";
import { toggleThreadLike, toggleThreadBookmark, toggleReplyLike } from "@/lib/api";

interface Props {
  thread: ForumThread;
  replies: ForumReply[];
  onStatusChange?: () => void;
}

export default function ThreadDetail({ thread, replies, onStatusChange }: Props) {
  const [liked, setLiked] = useState(thread.is_liked);
  const [likeCount, setLikeCount] = useState(thread.like_count);
  const [bookmarked, setBookmarked] = useState(thread.is_bookmarked);
  const [replyLikes, setReplyLikes] = useState<Record<string, boolean>>(
    Object.fromEntries(replies.map((r) => [r.id, r.is_liked]))
  );
  const [replyLikeCounts, setReplyLikeCounts] = useState<Record<string, number>>(
    Object.fromEntries(replies.map((r) => [r.id, r.like_count]))
  );

  const boardInfo = getBoardInfo(thread.board);
  const postTypeInfo = getPostTypeInfo(thread.post_type);
  const statusInfo = getStatusInfo(thread.status);

  const handleLike = useCallback(async () => {
    try {
      const res = await toggleThreadLike(thread.id);
      setLiked(res.is_liked);
      setLikeCount(res.like_count);
    } catch {}
  }, [thread.id]);

  const handleBookmark = useCallback(async () => {
    try {
      const res = await toggleThreadBookmark(thread.id);
      setBookmarked(res.is_bookmarked);
    } catch {}
  }, [thread.id]);

  const handleReplyLike = useCallback(async (replyId: string) => {
    try {
      const res = await toggleReplyLike(replyId);
      setReplyLikes((prev) => ({ ...prev, [replyId]: res.is_liked }));
      setReplyLikeCounts((prev) => ({ ...prev, [replyId]: res.like_count }));
    } catch {}
  }, []);

  // Group replies: top-level then children
  const topLevelReplies = replies.filter((r) => !r.parent_id);
  const childMap = new Map<string, ForumReply[]>();
  replies.forEach((r) => {
    if (r.parent_id) {
      const arr = childMap.get(r.parent_id) || [];
      arr.push(r);
      childMap.set(r.parent_id, arr);
    }
  });

  return (
    <div className="space-y-4">
      {/* Thread header */}
      <div className="liquid-glass-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/forum/${thread.board}`} className="rounded-full bg-white/50 px-2.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-white/40 hover:bg-white/70">
            {boardInfo.icon} {boardInfo.label}
          </Link>
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium" style={{ color: postTypeInfo.color, backgroundColor: `${postTypeInfo.color}10` }}>
            {postTypeInfo.label}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ring-1 ${statusInfo.bgColor}`} style={{ color: statusInfo.color }}>
            {statusInfo.label}
          </span>
          {thread.is_featured && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200/40">⭐ 精华</span>
          )}
          {thread.tags?.map((tag) => (
            <span key={tag} className="rounded-full bg-white/40 px-2.5 py-0.5 text-[10px] text-gray-700 ring-1 ring-white/40">
              #{tag}
            </span>
          ))}
        </div>

        <h1 className="mb-2 text-xl font-bold text-gray-800">{thread.title}</h1>

        <AuthorBadge nickname={thread.author_nickname} level={thread.author_level} avatar={thread.author_avatar} />

        <div className="mt-4 border-t border-white/40 pt-4">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            <MentionHighlight content={thread.content} />
          </div>
        </div>

        {/* Graph node refs */}
        {thread.graph_node_ids && thread.graph_node_ids.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {thread.graph_node_ids.map((nid) => (
              <Link
                key={nid}
                href={`/graph?node=${nid}`}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 ring-1 ring-blue-200/40 hover:bg-blue-100"
              >
                🔗 图谱节点 {nid.slice(0, 8)}...
              </Link>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
          <span>{timeAgo(thread.created_at)}</span>
          <span>👁 {thread.view_count}</span>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-3 border-t border-white/40 pt-3">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              liked ? "bg-red-50 text-red-500 ring-1 ring-red-200/40" : "bg-white/40 text-gray-700 ring-1 ring-white/40 hover:bg-white/60"
            }`}
          >
            {liked ? "❤️" : "🤍"} {likeCount}
          </button>
          <button
            onClick={handleBookmark}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              bookmarked ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200/40" : "bg-white/40 text-gray-700 ring-1 ring-white/40 hover:bg-white/60"
            }`}
          >
            {bookmarked ? "⭐" : "☆"} 收藏
          </button>
        </div>
      </div>

      {/* Replies */}
      <div className="liquid-glass-card p-5">
        <h3 className="mb-4 text-sm font-bold text-gray-700">💬 回复 ({thread.reply_count})</h3>

        {replies.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-600">暂无回复，快来抢沙发吧！</p>
        )}

        <div className="space-y-3">
          {topLevelReplies.map((reply) => (
            <div key={reply.id} className="rounded-lg bg-white/30 p-3 ring-1 ring-white/40">
              <div className="flex items-center justify-between">
                <AuthorBadge nickname={reply.author_nickname} level={reply.author_level} avatar={reply.author_avatar} />
                {reply.is_best_answer && (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600 ring-1 ring-green-200/40">✅ 最佳</span>
                )}
              </div>
              <div className="mt-2 text-sm leading-relaxed text-gray-700">
                <MentionHighlight content={reply.content} />
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                <span>{timeAgo(reply.created_at)}</span>
                <button
                  onClick={() => handleReplyLike(reply.id)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-all ${
                    replyLikes[reply.id] ? "text-red-500" : "text-gray-600 hover:text-red-400"
                  }`}
                >
                  {replyLikes[reply.id] ? "❤️" : "🤍"} {replyLikeCounts[reply.id]}
                </button>
              </div>

              {/* Child replies */}
              {childMap.has(reply.id) && (
                <div className="mt-2 space-y-2 border-l-2 border-orange-200/50 pl-3">
                  {childMap.get(reply.id)!.map((child) => (
                    <div key={child.id} className="rounded-lg bg-white/20 p-2.5 ring-1 ring-white/30">
                      <div className="flex items-center gap-2">
                        <AuthorBadge nickname={child.author_nickname} level={child.author_level} avatar={child.author_avatar} />
                        <span className="text-[10px] text-gray-600">
                          {timeAgo(child.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-700">
                        <MentionHighlight content={child.content} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
