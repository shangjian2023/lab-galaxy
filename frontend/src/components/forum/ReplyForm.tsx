"use client";

import { useState } from "react";
import { createForumReply } from "@/lib/api";
import NodeMentionInput from "./NodeMentionInput";
import { soundEngine } from "@/lib/audio/SoundEngine";

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
      // Extract graph_node_ids from @[name](id) mentions
      const nodeIdRegex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;
      const graphNodeIds: string[] = [];
      let m;
      while ((m = nodeIdRegex.exec(content)) !== null) {
        if (!graphNodeIds.includes(m[2])) graphNodeIds.push(m[2]);
      }
      await createForumReply(threadId, {
        content: content.trim(),
        graph_node_ids: graphNodeIds.length > 0 ? graphNodeIds : undefined,
      });
      soundEngine.play("hover");
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
      <NodeMentionInput
        value={content}
        onChange={setContent}
        placeholder="写下你的回复... 输入 @ 后输入节点名称可关联图谱节点"
        rows={3}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          输入 @ 后输入节点名称，选择即可关联图谱节点
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
