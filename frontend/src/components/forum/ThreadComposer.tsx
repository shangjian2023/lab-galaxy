"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createForumThread } from "@/lib/api";
import NodeMentionInput from "./NodeMentionInput";
import { soundEngine } from "@/lib/audio/SoundEngine";

const BOARDS = [
  { slug: "methodology", name: "方法论堂", icon: "🔬" },
  { slug: "graph_hall", name: "图谱议事厅", icon: "🗺️" },
  { slug: "emergency_room", name: "实验急诊室", icon: "🏥" },
  { slug: "aha_square", name: "Aha! 广场", icon: "💡" },
  { slug: "cross_discipline", name: "学科撞车现场", icon: "💥" },
  { slug: "announcements", name: "公告堂", icon: "📢" },
];

const POST_TYPES = [
  { value: "regular", label: "普通讨论" },
  { value: "insight", label: "发现" },
  { value: "prediction", label: "预测" },
  { value: "challenge", label: "挑战" },
];

interface Props {
  defaultBoard?: string;
}

export default function ThreadComposer({ defaultBoard }: Props) {
  const router = useRouter();
  const [board, setBoard] = useState(defaultBoard || "methodology");
  const [postType, setPostType] = useState("regular");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      setError("标题和内容不能为空");
      return;
    }
    if (title.length > 200) {
      setError("标题不能超过200字");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      // Extract graph_node_ids from @[name](id) mentions in content
      const nodeIdRegex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;
      const graphNodeIds: string[] = [];
      let m;
      while ((m = nodeIdRegex.exec(content)) !== null) {
        if (!graphNodeIds.includes(m[2])) graphNodeIds.push(m[2]);
      }
      const res = await createForumThread({
        board,
        post_type: postType,
        title: title.trim(),
        content: content.trim(),
        tags: tags.length > 0 ? tags : undefined,
        graph_node_ids: graphNodeIds.length > 0 ? graphNodeIds : undefined,
      });
      soundEngine.play("hover");
      router.push(`/forum/thread/${res.id}`);
    } catch (e: any) {
      setError(e.message || "发帖失败");
    } finally {
      setLoading(false);
    }
  }, [board, postType, title, content, tagsInput, router]);

  return (
    <div className="liquid-glass-card p-5">
      <h2 className="mb-4 text-base font-bold text-gray-800">✍️ 发布新帖</h2>

      <div className="space-y-4">
        {/* Board & Type selector */}
        <div className="flex flex-wrap gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">板块</label>
            <select
              value={board}
              onChange={(e) => setBoard(e.target.value)}
              className="w-full rounded-lg bg-white/50 px-3 py-2 text-sm ring-1 ring-white/40 transition-all focus:ring-orange-300/50"
            >
              {BOARDS.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.icon} {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-gray-700">类型</label>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
              className="w-full rounded-lg bg-white/50 px-3 py-2 text-sm ring-1 ring-white/40 transition-all focus:ring-orange-300/50"
            >
              {POST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="请输入标题..."
            maxLength={200}
            className="w-full rounded-lg bg-white/50 px-3 py-2 text-sm ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
          />
          <div className="mt-1 text-right text-[10px] text-gray-600">{title.length}/200</div>
        </div>

        {/* Content */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">内容</label>
          <NodeMentionInput
            value={content}
            onChange={setContent}
            placeholder="写下你的想法...&#10;输入 @ 后输入节点名称可关联图谱节点"
            rows={8}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            标签（用逗号分隔）
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如: PCR, 优化, 温度"
            className="w-full rounded-lg bg-white/50 px-3 py-2 text-sm ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-200/40">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between border-t border-white/40 pt-3">
          <span className="text-[10px] text-gray-600">发布帖子可获得 +3 积分</span>
          <button
            onClick={handleSubmit}
            disabled={loading || !title.trim() || !content.trim()}
            className="btn-primary rounded-lg px-6 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "发布中..." : "发布"}
          </button>
        </div>
      </div>
    </div>
  );
}
