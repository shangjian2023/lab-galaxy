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
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="liquid-glass-card px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">团队空间</h1>
              <p className="text-sm text-gray-700">管理你的团队，与成员实时协作</p>
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600"
            >
              + 创建团队
            </button>
          </div>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50 p-5">
          {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
          <div className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="团队名称"
              className="w-full rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm focus:border-orange-400 focus:outline-none"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="团队描述（可选）"
              className="w-full rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm focus:border-orange-400 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
              >
                {creating ? "创建中..." : "创建"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-xl bg-white px-5 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-100"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-600">加载中...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-600">还没有加入任何团队</p>
          <p className="mt-1 text-sm text-gray-500">点击上方按钮创建你的第一个团队</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/team/${t.id}`}
              className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-orange-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-800 group-hover:text-orange-600 transition-colors">
                    {t.name}
                  </h3>
                  {t.description && (
                    <p className="mt-1 text-xs text-gray-600 line-clamp-2">{t.description}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] text-orange-500">
                  {t.member_count} 人
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
                <span>创建者: {t.owner_nickname}</span>
                <span>{new Date(t.created_at).toLocaleDateString("zh-CN")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
