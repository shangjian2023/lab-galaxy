"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { browseTemplates, toggleTemplateLike, adoptTemplate, deleteTemplate, type TemplateItem } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { soundEngine } from "@/lib/audio/SoundEngine";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "course", label: "课程实验" },
  { value: "innovation", label: "创新实验" },
  { value: "research", label: "科研项目" },
  { value: "competition", label: "竞赛项目" },
];

const SORT_OPTIONS = [
  { value: "popular", label: "最热" },
  { value: "newest", label: "最新" },
  { value: "downloads", label: "下载最多" },
];

export default function TemplatesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("popular");

  const load = () => {
    browseTemplates({ keyword: keyword || undefined, category: category || undefined, sort }).then((res) => {
      setItems(res.items);
      setTotal(res.total);
    });
  };

  useEffect(() => { load(); }, [category, sort]);

  const handleLike = async (id: string) => {
    const res = await toggleTemplateLike(id);
    soundEngine.play("connect");
    setItems((prev) => prev.map((t) => t.id === id ? { ...t, is_liked: res.is_liked, likes: res.likes } : t));
  };

  const handleAdopt = async (id: string) => {
    await adoptTemplate(id);
    soundEngine.play("achievement");
    setItems((prev) => prev.map((t) => t.id === id ? { ...t, adoptions: t.adoptions + 1 } : t));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此模板？")) return;
    await deleteTemplate(id);
    soundEngine.play("connect");
    load();
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">模板市场</h1>
          <p className="text-sm text-gray-500">发现、使用、分享实验模板</p>
        </div>
        <span className="text-sm text-gray-400">{total} 个模板</span>
        <a href="/templates/new" className="btn-primary px-4 py-1.5 text-sm font-medium text-white">
          创建模板
        </a>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {CATEGORIES.map((c) => (
          <button key={c.value} onClick={() => setCategory(c.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              category === c.value ? "bg-orange-100 text-orange-700" : "glass-button text-gray-600"
            }`}>{c.label}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {SORT_OPTIONS.map((s) => (
            <button key={s.value} onClick={() => setSort(s.value)}
              className={`text-xs font-medium ${sort === s.value ? "text-orange-600" : "text-gray-400 hover:text-gray-600"}`}>{s.label}</button>
          ))}
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="搜索模板..." className="glass-input ml-2 w-40 px-3 py-1.5 text-sm" />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((tpl, i) => (
          <motion.div key={tpl.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className="glass-card group p-5 transition-shadow hover:shadow-md">
            {/* Badge */}
            <div className="mb-3 flex items-center gap-2">
              {tpl.is_official && <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">官方</span>}
              {tpl.category && <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{tpl.category}</span>}
            </div>

            <h3 className="mb-1 text-base font-bold text-gray-800 group-hover:text-orange-600">{tpl.name}</h3>
            <p className="mb-3 text-sm text-gray-500 line-clamp-2">{tpl.description || "暂无描述"}</p>

            {/* Tags */}
            {tpl.tags && tpl.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {tpl.tags.map((t) => <span key={t} className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-400">{t}</span>)}
              </div>
            )}

            {/* Owner actions */}
            {user && (tpl.created_by === user.id || user.role === "admin") && (
              <div className="mb-2 flex gap-2">
                <a href={`/templates/${tpl.id}/edit`} className="text-xs text-blue-600 hover:underline">编辑</a>
                <button onClick={() => handleDelete(tpl.id)} className="text-xs text-red-500 hover:underline">删除</button>
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <div className="flex gap-3">
                <button onClick={() => handleLike(tpl.id)} className={`flex items-center gap-1 hover:text-red-500 transition-colors ${tpl.is_liked ? "text-red-500" : "text-gray-400"}`}>
                  <svg className="h-3.5 w-3.5" fill={tpl.is_liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {tpl.likes}
                </button>
                <span>{tpl.downloads} 下载</span>
                <span>{tpl.adoptions} 采纳</span>
              </div>
              <button onClick={() => handleAdopt(tpl.id)}
                className="btn-primary rounded-lg px-3 py-1 text-xs font-medium text-white">
                采纳
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="py-20 text-center text-sm text-gray-400">暂无模板</div>
      )}
    </main>
  );
}
