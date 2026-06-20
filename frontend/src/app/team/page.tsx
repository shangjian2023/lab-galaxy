"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMyTeams, createTeam } from "@/lib/api";
import type { TeamInfo } from "@/lib/api";

export default function TeamListPage() {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyTeams()
      .then(setTeams)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const team = await createTeam({ name: newName.trim(), description: newDesc.trim() });
      setTeams((prev) => [team, ...prev]);
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* ── Hero Header ── */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-[#DBC7B5]/30 bg-gradient-to-br from-[#9A8C73]/12 via-[#F4F1EE]/80 to-[#8C7D70]/8 p-6 shadow-sm" style={{ backdropFilter: "blur(12px)" }}>
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#9A8C73]/8 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-[#8C7D70]/6 blur-xl" />
        {/* Top stripe */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#9A8C73] via-[#8C7D70] to-[#9A8C73]" />

        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[#492D22]">
              <span className="text-2xl">🏠</span> 团队空间
            </h1>
            <p className="mt-1 text-sm text-[#6B5D50]">管理你的团队，与成员实时协作、共享知识</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-xl bg-[#9A8C73] px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-[#9A8C73]/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#8C7D70] hover:shadow-lg active:scale-95"
          >
            {showCreate ? "取消" : "+ 创建团队"}
          </button>
        </div>
      </div>

      {/* ── Create Form (animated) ── */}
      {showCreate && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-[#9A8C73]/20 bg-[#F4F1EE]/80 p-5 shadow-sm" style={{ backdropFilter: "blur(12px)", animation: "slideDown 0.3s ease-out" }}>
          <style>{`@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6B5D50]">团队名称</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如：创新实验第一小组"
                className="w-full rounded-xl border border-[#DBC7B5]/40 bg-white/70 px-4 py-2.5 text-sm text-[#492D22] outline-none transition-all focus:border-[#9A8C73]/50 focus:bg-white focus:shadow-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6B5D50]">团队描述（可选）</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="一句话介绍团队的研究方向"
                className="w-full rounded-xl border border-[#DBC7B5]/40 bg-white/70 px-4 py-2.5 text-sm text-[#492D22] outline-none transition-all focus:border-[#9A8C73]/50 focus:bg-white focus:shadow-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="rounded-xl bg-[#9A8C73] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#8C7D70] hover:shadow-md disabled:opacity-40 active:scale-95"
              >
                {creating ? "创建中..." : "创建团队"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-[#DBC7B5]/40 px-5 py-2.5 text-sm text-[#4a3e34] transition-all hover:bg-[#DBC7B5]/15"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Team List ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#DBC7B5] border-t-[#9A8C73]" />
          <p className="mt-3 text-sm text-[#6B5D50]">加载中...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DBC7B5]/40 bg-[#F4F1EE]/40 py-20 text-center">
          <div className="mb-3 text-5xl">🏠</div>
          <p className="text-base font-medium text-[#492D22]">还没有加入任何团队</p>
          <p className="mt-1 text-sm text-[#6B5D50]">创建团队，邀请伙伴一起协作</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-xl bg-[#9A8C73] px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#8C7D70] active:scale-95"
          >
            创建第一个团队
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t, i) => (
            <Link
              key={t.id}
              href={`/team/${t.id}`}
              className="group relative overflow-hidden rounded-2xl border border-[#DBC7B5]/25 bg-[#F4F1EE]/70 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#9A8C73]/35 hover:bg-[#F4F1EE]/90 hover:shadow-lg hover:shadow-[#9A8C73]/8"
              style={{ backdropFilter: "blur(8px)", animationDelay: `${i * 80}ms` }}
            >
              {/* Hover sheen */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {/* Top gradient bar */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#9A8C73]/0 via-[#9A8C73]/40 to-[#9A8C73]/0 transition-opacity duration-300 group-hover:via-[#9A8C73]/70" />

              <div className="relative">
                {/* Team icon + name */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#9A8C73] to-[#8C7D70] text-lg shadow-md shadow-[#9A8C73]/15 transition-transform duration-300 group-hover:scale-110">
                      🏠
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#492D22] transition-colors group-hover:text-[#8C3232]">
                        {t.name}
                      </h3>
                      <p className="text-[11px] text-[#9A8C73]">by {t.owner_nickname}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#9A8C73]/10 px-2.5 py-1 text-[11px] font-medium text-[#6B5D50] transition-colors group-hover:bg-[#9A8C73]/15">
                    👥 {t.member_count}
                  </span>
                </div>

                {/* Description */}
                {t.description && (
                  <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-[#6B5D50]">
                    {t.description}
                  </p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-[10px] text-[#9A8C73]">
                  <span>📅 {new Date(t.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</span>
                  <span className="flex items-center gap-1 font-medium text-[#9A8C73] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    进入团队 →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
