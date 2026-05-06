"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getTemplate, updateTemplate } from "@/lib/api";
import { markdownToDocx, docxToMarkdown, downloadBlob } from "@/lib/word-utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CATEGORIES = ["实验方案", "数据分析", "报告模板", "安全规范", "其他"];

export default function EditTemplatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tplId = params.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!tplId || !user) return;
    getTemplate(tplId)
      .then((tpl) => {
        if (tpl.created_by !== user.id && user.role !== "admin") {
          router.push("/templates");
          return;
        }
        setName(tpl.name);
        setCategory(tpl.category || "");
        setTags((tpl.tags || []).join(", "));
        setDescription(tpl.description || "");
        setContent(tpl.content || "");
      })
      .catch(() => setError("无法加载模板"))
      .finally(() => setDataLoading(false));
  }, [tplId, user, router]);

  if (loading || dataLoading) {
    return <main className="flex min-h-screen items-center justify-center text-black">加载中...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-700">请先登录</p>
          <a href="/login" className="text-brand-600 hover:underline">去登录</a>
        </div>
      </main>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) { setError("请输入模板名称"); return; }
    if (!content.trim()) { setError("请输入模板内容"); return; }

    setSaving(true);
    setError("");
    try {
      const tagList = tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      await updateTemplate(tplId, {
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        tags: tagList.length > 0 ? tagList : undefined,
        category: category || undefined,
      });
      router.push("/templates");
    } catch (e: unknown) {
      setError((e as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadWord = async () => {
    if (!content.trim()) { setError("请先输入模板内容"); return; }
    const blob = await markdownToDocx(content);
    downloadBlob(blob, `${name || "模板"}.docx`);
  };

  const handleImportWord = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const md = await docxToMarkdown(file);
      setContent(md);
    } catch {
      setError("Word 文件解析失败");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">编辑模板</h1>
        <button onClick={() => router.back()} className="text-sm text-gray-700 hover:text-gray-700">
          返回
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-orange-50 p-3 text-sm text-orange-700">{error}</div>
      )}

      {/* Basic info */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">模板名称 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-input w-full px-3 py-2 text-sm"
            placeholder="例如：标准化学实验报告模板"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="glass-input w-full px-3 py-2 text-sm"
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
              className="glass-input w-full px-3 py-2 text-sm"
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
            className="glass-input w-full px-3 py-2 text-sm"
            placeholder="简短描述模板用途..."
          />
        </div>
      </div>

      {/* Content editor */}
      <div className="glass-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">模板内容 * (Markdown)</label>
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".docx" onChange={handleImportWord} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-black transition-colors hover:bg-gray-50"
            >
              导入 Word
            </button>
            <button
              onClick={handleDownloadWord}
              className="rounded-lg border border-orange-200 px-3 py-1.5 text-xs text-orange-600 transition-colors hover:bg-orange-50"
            >
              下载 Word
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4" style={{ minHeight: 400 }}>
          {/* Editor */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="glass-input w-full bg-[rgba(255,248,240,0.3)] px-3 py-2 font-mono text-sm resize-none"
            style={{ minHeight: 380 }}
            placeholder="# 模板标题&#10;&#10;在这里编写模板内容...&#10;&#10;## 一、实验目的&#10;&#10;## 二、实验步骤&#10;&#10;## 三、结果分析"
          />
          {/* Word-style preview */}
          <div
            className="word-preview w-full overflow-auto rounded-lg border border-gray-200 bg-white px-8 py-6"
            style={{ minHeight: 380, fontFamily: '"Times New Roman", "宋体", serif' }}
          >
            {content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <p className="text-sm text-gray-800">预览区域</p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => router.push("/templates")}
          className="btn-secondary rounded-lg px-6 py-2 text-sm font-medium text-black"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary rounded-lg px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存修改"}
        </button>
      </div>
    </main>
  );
}
