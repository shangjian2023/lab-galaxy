"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getDashboard, updateProfile, type DashboardData } from "@/lib/api";
import LevelBadge from "@/components/growth/LevelBadge";
import Link from "next/link";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedUser, setSavedUser] = useState<typeof user>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (user) setNickname(user.nickname || "");
  }, [user]);

  useEffect(() => {
    if (user) getDashboard().then(setDashboard).catch(() => {});
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

  return (
    <main className="mx-auto max-w-3xl px-6 pb-12 pt-8">
      {/* Unified profile card */}
      <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/80 p-8" style={{ backdropFilter: "blur(12px)" }}>
        {/* Header: avatar + name + badges */}
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#9A8C73] to-[#8C7D70] text-2xl font-bold text-white shadow-lg">
            {(displayUser.nickname || displayUser.username).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="rounded-lg border border-[#DBC7B5]/40 bg-[#F4F1EE] px-3 py-1 text-sm outline-none focus:border-[#9A8C73]/50"
                    placeholder="输入昵称"
                  />
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
              <LevelBadge
                level={displayUser.level}
                icon=""
                frame=""
                nickname={displayUser.nickname || displayUser.username}
                avatar={null}
                points={displayUser.points}
                size="sm"
              />
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

        {/* Quick links */}
        <div className="mt-6 grid grid-cols-4 gap-3">
          {[
            { label: "成长中心", href: "/growth", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
            { label: "我的文档", href: "/documents", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
            { label: "我的模板", href: "/templates", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" },
            { label: "知识发酵池", href: "/forum/my", icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
          ].map((l) => (
            <Link key={l.label} href={l.href} className="group flex flex-col items-center gap-1.5 rounded-xl border border-[#DBC7B5]/20 bg-[#F4F1EE]/50 p-4 transition-all hover:border-[#9A8C73]/40 hover:bg-[#F4F1EE] hover:shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#9A8C73]/15 text-[#9A8C73] transition-colors group-hover:bg-[#9A8C73]/20">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={l.icon} />
                </svg>
              </div>
              <span className="text-xs font-medium text-[#4a3e34]">{l.label}</span>
            </Link>
          ))}
        </div>

        {/* Account info — compact inline */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-[#DBC7B5]/20 pt-4 text-xs text-[#6B5D50]">
          <span>邮箱: <span className="font-medium text-[#4a3e34]">{displayUser.email}</span></span>
          <span>注册时间: <span className="font-medium text-[#4a3e34]">{new Date(displayUser.created_at).toLocaleDateString("zh-CN")}</span></span>
        </div>
      </div>
    </main>
  );
}
