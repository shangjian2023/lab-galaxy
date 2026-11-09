"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, LockKeyhole, LogOut, ShieldCheck, UserCheck, Users } from "lucide-react";
import { useAuth } from "@/components/app/AuthProvider";
import type { AccountUser, UserStatus } from "@/lib/auth-types";

interface AuthPayload {
  user?: AccountUser;
  users?: AccountUser[];
  detail?: string;
  message?: string;
  requiresApproval?: boolean;
}

async function request(path: string, init?: RequestInit): Promise<AuthPayload> {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => null) as AuthPayload | null;
  if (!response.ok) throw new Error(payload?.detail ?? `请求失败（HTTP ${response.status}）`);
  return payload ?? {};
}

export function AccountPanel() {
  const { user, loading, logout } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const usersQuery = useQuery({
    queryKey: ["auth", "users"],
    enabled: user?.role === "admin",
    queryFn: () => request("/api/auth/users"),
    retry: false,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await request(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { email, password, displayName } : { email, password }),
      });
      if (payload.requiresApproval) {
        setMessage(payload.message ?? "注册成功，请等待管理员审核");
        setMode("login");
        setPassword("");
      } else if (payload.user) {
        queryClient.setQueryData(["auth", "session"], payload.user);
        await queryClient.invalidateQueries({ queryKey: ["auth", "users"] });
        setPassword("");
        setMessage(mode === "login" ? "登录成功" : payload.message ?? "账户已创建");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (id: string, status: UserStatus) => {
    setError("");
    try {
      await request(`/api/auth/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await usersQuery.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "状态更新失败");
    }
  };

  if (loading) return <div className="panel account-card"><div className="account-loading"><span /><p>正在验证本地会话…</p></div></div>;

  if (!user) {
    return (
      <div className="account-grid">
        <section className="panel account-card">
          <div className="account-card-icon"><KeyRound size={21} /></div>
          <p className="eyebrow">SECURE ACCESS</p>
          <h2 className="panel-title">{mode === "login" ? "欢迎回到研究空间" : "创建研究账户"}</h2>
          <p className="panel-subtitle">会话令牌保存在 HttpOnly Cookie 中，密码不会离开服务端验证流程。</p>
          <div className="account-tabs" role="tablist" aria-label="账户操作">
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>登录</button>
            <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); setMessage(""); }}>注册</button>
          </div>
          <form className="account-form" onSubmit={(event) => void submit(event)}>
            {mode === "register" ? <label>昵称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={40} autoComplete="name" placeholder="用于团队中的显示名称" required /></label> : null}
            <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="name@example.com" required /></label>
            <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 10 个字符" required /></label>
            {error ? <div className="form-message error" role="alert">{error}</div> : null}
            {message ? <div className="form-message success" role="status"><Check size={14} />{message}</div> : null}
            <button className="btn btn-primary account-submit" disabled={busy}>{busy ? "正在安全验证…" : mode === "login" ? "登录研究空间" : "提交注册"}</button>
          </form>
          <p className="account-footnote">首个注册账户成为本机初始管理员；后续账户需要审核。首次部署请仅在本机完成管理员创建。</p>
        </section>
        <aside className="panel account-boundary-card">
          <span className="boundary-orbit"><LockKeyhole size={25} /></span>
          <p className="eyebrow">SERVER-SIDE POLICY</p>
          <h2>不是隐藏入口，而是拒绝越权查询。</h2>
          <div className="boundary-list">
            <div><span>公开</span><p>任何人都能阅读已公开的实验报告和来源。</p></div>
            <div><span>私有</span><p>仅文档所有者能检索原文、分块与统计。</p></div>
            <div><span>团队</span><p>仅同一团队成员可访问，管理员也不默认越权阅读。</p></div>
          </div>
          <Link href="/documents" className="btn btn-secondary">先浏览公开报告</Link>
        </aside>
      </div>
    );
  }

  return (
    <div className="account-page-stack">
      <section className="panel signed-in-card">
        <div className="signed-in-identity"><span className="signed-in-avatar">{user.displayName.slice(0, 1)}</span><div><p className="eyebrow"><ShieldCheck size={13} />VERIFIED SESSION</p><h2>{user.displayName}</h2><p>{user.email}</p></div></div>
        <div className="signed-in-meta"><span className="account-role">{user.role === "admin" ? "管理员" : "研究员"}</span><span>账号已审核</span><span>会话有效期 30 天</span></div>
        <div className="signed-in-actions"><Link href="/assistant" className="btn btn-primary">进入研究助手</Link><button className="btn btn-secondary" onClick={() => void logout().catch((reason) => setError(reason instanceof Error ? reason.message : "退出失败"))}><LogOut size={14} />退出登录</button></div>
      </section>
      {message ? <div className="form-message success" role="status"><Check size={14} />{message}</div> : null}
      {error ? <div className="form-message error" role="alert">{error}</div> : null}
      <div className="account-lower-grid">
        <section className="panel account-info-card"><p className="eyebrow"><LockKeyhole size={13} />DATA BOUNDARY</p><h2 className="panel-title">当前知识访问范围</h2><p>你可以读取公开语料、自己拥有的私有文档，以及已加入团队共享的文档。文档列表、原文、全文检索和 RAG 问答复用同一条服务端授权规则。</p><div className="account-policy-tags"><span>公开语料</span><span>本人私有</span><span>所在团队</span></div></section>
        {user.role === "admin" ? <section className="panel admin-users-card"><div className="panel-heading"><div><p className="eyebrow"><Users size={13} />ACCESS REVIEW</p><h2 className="panel-title">账号审核</h2></div><span className="local-badge">{usersQuery.data?.users?.length ?? 0} 个账户</span></div><div className="admin-user-list">{usersQuery.isLoading ? <p>正在读取账户…</p> : usersQuery.data?.users?.map((account) => <div className="admin-user-row" key={account.id}><span className="profile-avatar">{account.displayName.slice(0, 1)}</span><div><strong>{account.displayName}{account.id === user.id ? "（你）" : ""}</strong><small>{account.email} · {account.role === "admin" ? "管理员" : "研究员"}</small></div><span className={`user-status ${account.status}`}>{account.status === "active" ? "已启用" : account.status === "pending" ? "待审核" : "已禁用"}</span><div className="admin-user-actions">{account.status !== "active" ? <button onClick={() => void changeStatus(account.id, "active")} aria-label={`启用 ${account.displayName}`}><UserCheck size={14} />启用</button> : null}{account.status === "active" && account.id !== user.id ? <button className="danger" onClick={() => void changeStatus(account.id, "disabled")}>禁用</button> : null}</div></div>)}{usersQuery.error ? <div className="form-message error">{usersQuery.error instanceof Error ? usersQuery.error.message : "无法读取用户"}</div> : null}</div></section> : null}
      </div>
    </div>
  );
}
