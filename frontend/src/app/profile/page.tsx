"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getProfile, updateProfile } from "@/lib/api";
import LevelBadge from "@/components/growth/LevelBadge";
import Link from "next/link";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [saving, setSaving] = useState(false);
  const [savedUser, setSavedUser] = useState<typeof user>(null);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">加载中...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-500">请先登录</p>
          <Link href="/login" className="text-brand-600 hover:underline">去登录</Link>
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
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      {/* Profile header */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-6">
          {/* Avatar placeholder */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
            {(displayUser.nickname || displayUser.username).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="rounded-lg border px-3 py-1.5 text-lg font-bold focus:border-brand-400 focus:outline-none"
                    placeholder="输入昵称"
                  />
                  <button onClick={handleSave} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button onClick={() => { setEditing(false); setNickname(displayUser.nickname || ""); }} className="rounded-lg border px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-50">
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-800">
                    {displayUser.nickname || displayUser.username}
                  </h1>
                  <button onClick={() => { setEditing(true); setNickname(displayUser.nickname || ""); }} className="text-xs text-brand-600 hover:underline">
                    编辑
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">@{displayUser.username}</p>
            <div className="mt-2 flex items-center gap-3">
              <LevelBadge
                level={displayUser.level}
                icon=""
                frame=""
                nickname={displayUser.nickname || displayUser.username}
                avatar={null}
                points={displayUser.points}
                size="sm"
              />
              <span className="text-sm text-gray-500">{displayUser.points} 成长值</span>
              {displayUser.role === "admin" && <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">管理员</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "等级", value: `Lv.${displayUser.level}`, href: "/growth" },
          { label: "成长值", value: displayUser.points, href: "/growth" },
          { label: "文档", value: "—", href: "/documents" },
          { label: "模板", value: "—", href: "/templates" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border bg-white p-4 text-center shadow-sm hover:shadow-md transition-shadow">
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/growth" className="flex items-center gap-3 rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-800">成长中心</p>
            <p className="text-xs text-gray-500">查看等级路线图和积分记录</p>
          </div>
        </Link>
        <Link href="/documents" className="flex items-center gap-3 rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-800">我的文档</p>
            <p className="text-xs text-gray-500">管理上传的实验资料</p>
          </div>
        </Link>
      </div>

      {/* Account info */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-800">账号信息</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-gray-500">用户名</span>
            <span className="text-gray-800">{displayUser.username}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-gray-500">邮箱</span>
            <span className="text-gray-800">{displayUser.email}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-gray-500">角色</span>
            <span className="text-gray-800">{displayUser.role === "admin" ? "管理员" : "普通用户"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">注册时间</span>
            <span className="text-gray-800">{new Date(displayUser.created_at).toLocaleDateString("zh-CN")}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
