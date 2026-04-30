"use client";

import { useState } from "react";
import { createForumReply } from "@/lib/api";

interface Props {
  threadId: string;
  onSuccess: () => void;
}

export default function ReplyForm({ threadId, onSuccess }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await createForumReply(threadId, { content: content.trim() });
      setContent("");
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="liquid-glass-card p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-700">✍️ 发表回复</h3>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写下你的回复..."
        className="w-full rounded-lg bg-white/50 p-3 text-sm ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
        rows={3}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          使用 @图谱节点ID 可关联图谱节点
        </span>
        <button
          onClick={handleSubmit}
          disabled={loading || !content.trim()}
          className="btn-primary rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {loading ? "发送中..." : "回复"}
        </button>
      </div>
    </div>
  );
}
