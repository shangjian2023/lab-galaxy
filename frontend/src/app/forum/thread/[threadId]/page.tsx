"use client";

import { useEffect, useState, useCallback } from "react";
import { getForumThread } from "@/lib/api";
import type { ForumThread, ForumReply } from "@/lib/api";
import ThreadDetail from "@/components/forum/ThreadDetail";
import ReplyForm from "@/components/forum/ReplyForm";
import BoardNav from "@/components/forum/BoardNav";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params?.threadId ?? "";
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);

  const loadThread = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getForumThread(threadId);
      setThread(res.thread);
      setReplies(res.replies);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  const handleReplySuccess = useCallback(() => {
    void loadThread();
  }, [loadThread]);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-600">加载中...</p>
        </div>
      </main>
    );
  }

  if (!thread) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="liquid-glass-card py-16 text-center">
          <p className="text-gray-600">帖子不存在</p>
          <Link href="/forum" className="mt-2 text-sm text-orange-600 hover:underline">
            返回论坛
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-3">
        <BoardNav activeBoard={thread.board} />
      </div>
      <ThreadDetail thread={thread} replies={replies} onStatusChange={loadThread} />
      {thread.status !== "locked" && (
        <div className="mt-4">
          <ReplyForm threadId={thread.id} onSuccess={handleReplySuccess} />
        </div>
      )}
    </main>
  );
}
