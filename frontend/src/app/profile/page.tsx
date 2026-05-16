"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getProfile, updateProfile } from "@/lib/api";
import LevelBadge from "@/components/growth/LevelBadge";
import Link from "next/link";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedUser, setSavedUser] = useState<typeof user>(null);

  useEffect(() => {
    if (user) setNickname(user.nickname || "");
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
    <main className="mx-auto max-w-4xl px-6 pb-12 pt-8">
      {/* Profile header card */}
      <div className="mb-8 rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/80 p-8" style={{ backdropFilter: "blur(12px)" }}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#9A8C73] to-[#8C7D70] text-3xl font-bold text-white shadow-lg">
            {(displayUser.nickname || displayUser.username).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="rounded-lg border border-[#DBC7B5]/40 bg-[#F4F1EE] px-3 py-1.5 text-sm outline-none focus:border-[#9A8C73]/50"
                    placeholder="输入昵称"
                  />
                  <button onClick={handleSave} disabled={saving} className="rounded-lg bg-[#9A8C73] px-4 py-1.5 text-sm font-medium text-white transition-all hover:bg-[#8C7D70] disabled:opacity-50">
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button onClick={() => { setEditing(false); setNickname(displayUser.nickname || ""); }} className="rounded-lg border border-[#DBC7B5]/40 px-4 py-1.5 text-sm text-[#4a3e34] transition-all hover:bg-[#DBC7B5]/20">
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-[#8C3232]">
                    {displayUser.nickname || displayUser.username}
                  </h1>
                  <button onClick={() => { setEditing(true); setNickname(displayUser.nickname || ""); }} className="text-xs text-[#9A8C73] hover:underline">
                    编辑
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-[#6B5D50]">@{displayUser.username}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
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
                <span className="rounded-full bg-[#9A8C73]/15 px-2.5 py-0.5 text-[11px] font-mono font-bold text-[#6B5D50]" title="分享此 ID 以便别人邀请你加入团队">
                  ID: {displayUser.display_id}
                </span>
              )}
              {displayUser.role === "admin" && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-[#8C3232]">管理员</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats + Quick links in one row */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Stats */}
        <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/70 p-6">
          <h2 className="mb-4 text-sm font-bold text-[#8C3232]">数据统计</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "等级", value: `Lv.${displayUser.level}`, href: "/growth" },
              { label: "成长值", value: displayUser.points, href: "/growth" },
              { label: "文档", value: "—", href: "/documents" },
              { label: "模板", value: "—", href: "/templates" },
            ].map((s) => (
              <Link key={s.label} href={s.href} className="rounded-xl border border-[#DBC7B5]/20 bg-[#F4F1EE]/50 p-4 text-center transition-all hover:border-[#9A8C73]/40 hover:bg-[#F4F1EE] hover:shadow-sm">
                <p className="text-2xl font-bold text-[#8C3232]">{s.value}</p>
                <p className="mt-1 text-xs text-[#6B5D50]">{s.label}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/70 p-6">
          <h2 className="mb-4 text-sm font-bold text-[#8C3232]">快捷入口</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "成长中心", desc: "查看等级和积分记录", href: "/growth", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
              { label: "我的文档", desc: "管理上传的实验资料", href: "/documents", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
              { label: "我的模板", desc: "查看和编辑模板", href: "/templates", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" },
              { label: "知识发酵池", desc: "我的帖子和回复", href: "/forum/my", icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="group flex items-center gap-3 rounded-xl border border-[#DBC7B5]/20 bg-[#F4F1EE]/50 p-4 transition-all hover:border-[#9A8C73]/40 hover:bg-[#F4F1EE] hover:shadow-sm">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#9A8C73]/15 text-[#9A8C73] transition-colors group-hover:bg-[#9A8C73]/20">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={l.icon} />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#4a3e34]">{l.label}</p>
                  <p className="text-[10px] text-[#6B5D50]">{l.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/80 p-6" style={{ backdropFilter: "blur(12px)" }}>
        <h2 className="mb-4 text-sm font-bold text-[#8C3232]">账号信息</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["用户名", displayUser.username],
            ["用户 ID", displayUser.display_id ?? "未分配"],
            ["邮箱", displayUser.email],
            ["角色", displayUser.role === "admin" ? "管理员" : "普通用户"],
            ["注册时间", new Date(displayUser.created_at).toLocaleDateString("zh-CN")],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-[#DBC7B5]/10 px-4 py-3">
              <span className="text-sm text-[#6B5D50]">{label}</span>
              <span className={`text-sm font-medium text-[#4a3e34] ${typeof value === "number" || (value as string).match(/^\d/) ? "font-mono" : ""}`}>{String(value)}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
