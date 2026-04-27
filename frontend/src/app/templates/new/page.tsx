"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createTemplate } from "@/lib/api";

const CATEGORIES = ["实验方案", "数据分析", "报告模板", "安全规范", "其他"];

export default function TemplateEditorPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">加载中...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-500">请先登录</p>
          <a href="/login" className="text-brand-600 hover:underline">去登录</a>
        </div>
      </main>
    );
  }

  const handleSave = async (publish: boolean) => {
    if (!name.trim()) { setError("请输入模板名称"); return; }
    if (!content.trim()) { setError("请输入模板内容"); return; }

    setSaving(true);
    setError("");
    try {
      const tagList = tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      const res = await createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        tags: tagList.length > 0 ? tagList : undefined,
        category: category || undefined,
      });
      if (publish) {
        const { publishTemplate } = await import("@/lib/api");
        await publishTemplate(res.id);
      }
      router.push("/templates");
    } catch (e: any) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">创建模板</h1>
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
          返回
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* Basic info */}
      <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">模板名称 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            placeholder="例如：标准化学实验报告模板"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            >
              <option value="">选择分类</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">标签</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              placeholder="逗号分隔，如：化学, 报告"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">简介</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            placeholder="简短描述模板用途..."
          />
        </div>
      </div>

      {/* Content editor */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-gray-700">模板内容 * (支持 Markdown)</label>
        <div className="grid grid-cols-2 gap-4" style={{ minHeight: 320 }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-lg border bg-gray-50 px-3 py-2 font-mono text-sm focus:border-brand-400 focus:outline-none resize-none"
            style={{ minHeight: 300 }}
            placeholder="# 模板标题&#10;&#10;在这里编写模板内容...&#10;&#10;## 一、实验目的&#10;&#10;## 二、实验步骤&#10;&#10;## 三、结果分析"
          />
          <div
            className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm overflow-auto prose prose-sm max-w-none"
            style={{ minHeight: 300 }}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="rounded-lg border px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存草稿"}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "发布中..." : "保存并发布"}
        </button>
      </div>
    </main>
  );
}

/** Minimal markdown-to-HTML for preview */
function markdownToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n/g, "<br/>");
}
