"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getDashboard, updateProfile, type DashboardData, listAchievements, createAchievement, updateAchievement, deleteAchievement, type AchievementItem, getMyCredit, getBorrowedEquipment } from "@/lib/api";
import LevelBadge from "@/components/growth/LevelBadge";
import Link from "next/link";

const ACHIEVEMENT_TYPES = ["论文", "专利", "获奖", "项目成果", "成就"];
const TYPE_ICONS: Record<string, string> = {
  "论文": "📝",
  "专利": "🔧",
  "获奖": "🏆",
  "项目成果": "💼",
  "成就": "⭐",
};

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedUser, setSavedUser] = useState<typeof user>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [credit, setCredit] = useState<{ credit_score: number; composite: number; title: string; tier: string } | null>(null);
  const [borrowed, setBorrowed] = useState<{ id: string; title: string; catalog_name: string | null; quantity: number; created_at: string | null }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (user) setNickname(user.nickname || "");
  }, [user]);

  useEffect(() => {
    if (user) {
      getDashboard().then(setDashboard).catch(() => {});
      listAchievements().then(setAchievements).catch(() => setAchievements([]));
      getMyCredit().then(setCredit).catch(() => {});
      getBorrowedEquipment().then((r) => setBorrowed(r.items)).catch(() => {});
    }
  }, [user]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-[#4a3e34]">加载中...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-[#4a3e34]">请先登录</p>
          <Link href="/login" className="text-[#9A8C73] hover:underline">去登录</Link>
        </div>
      </main>
    );
  }

  const displayUser = savedUser || user;
  const docCount = dashboard?.stats.document_count ?? 0;
  const tplCount = dashboard?.stats.template_count ?? 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({ nickname });
      setSavedUser(updated);
      setEditing(false);
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAchievement = async (name: string, type: string, desc: string) => {
    try {
      const ach = await createAchievement({ name, achievement_type: type, description: desc || undefined });
      setAchievements(prev => [ach, ...prev]);
      setShowAdd(false);
    } catch {
      alert("添加失败，请重试");
    }
  };

  const handleUpdateAchievement = async (id: string, data: { name?: string; description?: string; achievement_type?: string }) => {
    try {
      const ach = await updateAchievement(id, data);
      setAchievements(prev => prev.map(a => a.id === id ? ach : a));
      setEditId(null);
    } catch {
      alert("更新失败，请重试");
    }
  };

  const handleDeleteAchievement = async (id: string) => {
    if (!confirm("确定删除此成果？")) return;
    try {
      await deleteAchievement(id);
      setAchievements(prev => prev.filter(a => a.id !== id));
    } catch {
      alert("删除失败，请重试");
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 pb-12 pt-8">
      {/* Profile card */}
      <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/80 p-8" style={{ backdropFilter: "blur(12px)" }}>
        {/* Header */}
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#9A8C73] to-[#8C7D70] text-2xl font-bold text-white shadow-lg">
            {(displayUser.nickname || displayUser.username).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="rounded-lg border border-[#DBC7B5]/40 bg-[#F4F1EE] px-3 py-1 text-sm outline-none focus:border-[#9A8C73]/50" placeholder="输入昵称" />
                  <button onClick={handleSave} disabled={saving} className="rounded-lg bg-[#9A8C73] px-3 py-1 text-sm font-medium text-white transition-all hover:bg-[#8C7D70] disabled:opacity-50">
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button onClick={() => { setEditing(false); setNickname(displayUser.nickname || ""); }} className="rounded-lg border border-[#DBC7B5]/40 px-3 py-1 text-sm text-[#4a3e34] transition-all hover:bg-[#DBC7B5]/20">
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-[#8C3232] truncate">
                    {displayUser.nickname || displayUser.username}
                  </h1>
                  <button onClick={() => { setEditing(true); setNickname(displayUser.nickname || ""); }} className="shrink-0 text-xs text-[#9A8C73] hover:underline">
                    编辑
                  </button>
                </>
              )}
            </div>
            <p className="mt-0.5 text-sm text-[#6B5D50]">@{displayUser.username}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LevelBadge level={displayUser.level} icon="" frame="" nickname={displayUser.nickname || displayUser.username} avatar={null} points={displayUser.points} size="sm" />
              {credit && credit.title && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-all duration-200 hover:-translate-y-0.5 ${
                  credit.tier === "high"
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm"
                    : credit.tier === "good"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-[#9A8C73]/15 text-[#6B5D50]"
                }`}>
                  ⭐ {credit.title} · 信用{credit.credit_score}
                </span>
              )}
              {displayUser.display_id && (
                <span className="rounded-full bg-[#9A8C73]/15 px-2 py-0.5 text-[10px] font-mono font-bold text-[#6B5D50]">
                  ID: {displayUser.display_id}
                </span>
              )}
              {displayUser.role === "admin" && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-[#8C3232]">管理员</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-6 grid grid-cols-4 gap-3">
          {[
            { label: "等级", value: `Lv.${displayUser.level}`, href: "/growth" },
            { label: "成长值", value: displayUser.points, href: "/growth" },
            { label: "文档", value: docCount, href: "/documents" },
            { label: "模板", value: tplCount, href: "/templates" },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="rounded-xl border border-[#DBC7B5]/20 bg-[#F4F1EE]/50 p-3 text-center transition-all hover:border-[#9A8C73]/40 hover:bg-[#F4F1EE] hover:shadow-sm">
              <p className="text-xl font-bold text-[#8C3232]">{s.value}</p>
              <p className="mt-0.5 text-[11px] text-[#6B5D50]">{s.label}</p>
            </Link>
          ))}
        </div>

        {/* Account info */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-[#DBC7B5]/20 pt-4 text-xs text-[#6B5D50]">
          <span>邮箱: <span className="font-medium text-[#4a3e34]">{displayUser.email}</span></span>
          <span>注册时间: <span className="font-medium text-[#4a3e34]">{new Date(displayUser.created_at).toLocaleDateString("zh-CN")}</span></span>
        </div>
      </div>

      {/* Borrowed equipment */}
      {borrowed.length > 0 && (
        <div className="mt-6 rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/80 p-6" style={{ backdropFilter: "blur(12px)" }}>
          <h2 className="mb-3 flex items-center justify-between text-sm font-bold text-[#8C3232]">
            <span>正在借用</span>
            <span className="text-xs font-normal text-[#9A8C73]">{borrowed.length} 项</span>
          </h2>
          <div className="space-y-2">
            {borrowed.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-[#DBC7B5]/20 px-3 py-2">
                <span className="truncate text-sm text-[#4a3e34]">{b.catalog_name || b.title}</span>
                <span className="ml-2 shrink-0 text-xs font-medium text-[#8C3232]">× {b.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements card */}
      <div className="mt-6 rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/80 p-8" style={{ backdropFilter: "blur(12px)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#8C3232]">
            我的成果
            <span className="ml-1 text-xs font-normal text-[#9A8C73]">({achievements.length})</span>
          </h2>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-[#9A8C73] px-3 py-1 text-xs font-medium text-white transition-all hover:bg-[#8C7D70]"
          >
            + 添加
          </button>
        </div>

        {achievements.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#9A8C73]">还没有成果记录，点击上方添加你的论文、专利、获奖等成果</p>
        ) : (
          <div className="space-y-3">
            {achievements.map((ach) => (
              <div key={ach.id} className="rounded-xl border border-[#DBC7B5]/20 bg-[#F4F1EE]/50 p-4">
                {editId === ach.id ? (
                  <AchievementEditForm
                    ach={ach}
                    onSave={(data) => handleUpdateAchievement(ach.id, data)}
                    onCancel={() => setEditId(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{TYPE_ICONS[ach.achievement_type] || "⭐"}</span>
                        <span className="text-sm font-medium text-[#4a3e34]">{ach.name}</span>
                        <span className="shrink-0 rounded-full bg-[#9A8C73]/15 px-2 py-0.5 text-[10px] font-medium text-[#6B5D50]">
                          {ach.achievement_type}
                        </span>
                      </div>
                      {ach.description && (
                        <p className="mt-1 text-xs text-[#6B5D50]">{ach.description}</p>
                      )}
                      <p className="mt-1 text-[10px] text-[#9A8C73]">
                        {ach.created_at ? new Date(ach.created_at).toLocaleDateString("zh-CN") : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => setEditId(ach.id)} className="rounded px-1.5 py-1 text-[10px] text-[#9A8C73] hover:bg-[#DBC7B5]/30">
                        编辑
                      </button>
                      <button onClick={() => handleDeleteAchievement(ach.id)} className="rounded px-1.5 py-1 text-[10px] text-red-500 hover:bg-red-50">
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add achievement modal */}
      {showAdd && (
        <AchievementAddForm
          onAdd={handleAddAchievement}
          onClose={() => setShowAdd(false)}
        />
      )}
    </main>
  );
}

function AchievementAddForm({ onAdd, onClose }: { onAdd: (name: string, type: string, desc: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState(ACHIEVEMENT_TYPES[0]);
  const [desc, setDesc] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) { alert("请输入成果名称"); return; }
    onAdd(name.trim(), type, desc.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[#F4F1EE] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-bold text-[#8C3232]">添加成果</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[#6B5D50]">成果名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#DBC7B5]/40 bg-white/80 px-3 py-2 text-sm outline-none focus:border-[#9A8C73]/50" placeholder="如：XX论文发表" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#6B5D50]">类型</label>
            <div className="flex flex-wrap gap-1.5">
              {ACHIEVEMENT_TYPES.map((t) => (
                <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${type === t ? "bg-[#9A8C73] text-white" : "bg-[#DBC7B5]/30 text-[#6B5D50] hover:bg-[#DBC7B5]/50"}`}>
                  {TYPE_ICONS[t]} {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#6B5D50]">描述（可选）</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-lg border border-[#DBC7B5]/40 bg-white/80 px-3 py-2 text-sm outline-none focus:border-[#9A8C73]/50" rows={2} placeholder="简要描述成果" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-[#DBC7B5]/40 px-4 py-2 text-sm text-[#4a3e34] transition-all hover:bg-[#DBC7B5]/20">
              取消
            </button>
            <button onClick={handleSubmit} className="flex-1 rounded-lg bg-[#9A8C73] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#8C7D70]">
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AchievementEditForm({ ach, onSave, onCancel }: { ach: AchievementItem; onSave: (data: { name?: string; description?: string; achievement_type?: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState(ach.name);
  const [type, setType] = useState(ach.achievement_type);
  const [desc, setDesc] = useState(ach.description || "");

  const handleSubmit = () => {
    if (!name.trim()) { alert("请输入成果名称"); return; }
    onSave({ name: name.trim(), description: desc.trim() || undefined, achievement_type: type });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-[#6B5D50]">成果名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#DBC7B5]/40 bg-white/80 px-3 py-1.5 text-sm outline-none focus:border-[#9A8C73]/50" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[#6B5D50]">类型</label>
        <div className="flex flex-wrap gap-1.5">
          {ACHIEVEMENT_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-full px-2 py-0.5 text-xs font-medium transition-all ${type === t ? "bg-[#9A8C73] text-white" : "bg-[#DBC7B5]/30 text-[#6B5D50] hover:bg-[#DBC7B5]/50"}`}>
              {TYPE_ICONS[t]} {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-[#6B5D50]">描述（可选）</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-lg border border-[#DBC7B5]/40 bg-white/80 px-3 py-1.5 text-sm outline-none focus:border-[#9A8C73]/50" rows={2} />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-[#DBC7B5]/40 px-3 py-1.5 text-sm text-[#4a3e34] hover:bg-[#DBC7B5]/20">
          取消
        </button>
        <button onClick={handleSubmit} className="flex-1 rounded-lg bg-[#9A8C73] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#8C7D70]">
          保存
        </button>
      </div>
    </div>
  );
}
