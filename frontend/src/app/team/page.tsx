"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, KeyRound, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/components/app/AuthProvider";
import { createTeam, joinTeam, listTeams, type TeamSummary } from "@/lib/team-api";

export default function TeamListPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      setTeams((await listTeams()).teams);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取团队");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const result = await createTeam(name.trim());
      router.push(`/team/${result.team.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建团队失败");
      setCreating(false);
    }
  };

  const submitJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    setJoining(true);
    setError("");
    setNotice("");
    try {
      const result = await joinTeam(token.trim());
      setToken("");
      router.push(`/team/${result.team.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加入团队失败");
      setJoining(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="COLLABORATION / SHARED KNOWLEDGE" title="让研究，在共同的边界里发生。" description="创建团队、分享一次性邀请，并管理成员角色。团队文档的访问权限会随成员加入和退出实时变化。" actions={<Link href="/documents" className="btn btn-secondary">查看团队知识<ArrowUpRight size={14} /></Link>} />
      {!user && !authLoading ? <div className="panel team-empty"><span className="team-empty-icon"><KeyRound size={25} /></span><h2>登录后进入协作空间</h2><p>团队与成员信息只向已审核账户开放。</p><Link href="/account" className="btn btn-primary">登录 / 注册</Link></div> : null}
      {user ? <div className="team-page-stack">
        <div className="team-action-grid">
          <section className="panel team-action-card"><div className="team-action-heading"><span><Plus size={18} /></span><div><p className="eyebrow">NEW TEAM</p><h2>创建研究团队</h2></div></div><p>你将成为团队所有者，可以邀请成员并管理共享知识。</p><form onSubmit={(event) => void submitCreate(event)}><label htmlFor="team-name">团队名称</label><div><input id="team-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} placeholder="例如：计算机网络研究组" required /><button className="btn btn-primary" disabled={creating || !name.trim()}>{creating ? "创建中…" : "创建团队"}</button></div></form></section>
          <section className="panel team-action-card"><div className="team-action-heading"><span><KeyRound size={18} /></span><div><p className="eyebrow">ONE-TIME INVITE</p><h2>使用邀请加入</h2></div></div><p>邀请仅可使用一次并会在 1–168 小时后过期，令牌不会明文保存在数据库中。</p><form onSubmit={(event) => void submitJoin(event)}><label htmlFor="invite-token">一次性邀请令牌</label><div><input id="invite-token" value={token} onChange={(event) => setToken(event.target.value)} placeholder="粘贴团队所有者分享的令牌" autoComplete="off" required /><button className="btn btn-secondary" disabled={joining || !token.trim()}>{joining ? "验证中…" : "加入团队"}</button></div></form></section>
        </div>
        {error ? <div className="form-message error" role="alert">{error}</div> : null}
        {notice ? <div className="form-message success" role="status"><Check size={14} />{notice}</div> : null}
        <section className="team-list-section"><div className="team-section-heading"><div><p className="eyebrow"><Users size={13} />YOUR TEAMS</p><h2>我的团队</h2></div><span>{teams.length} 个团队</span></div>
          {loading ? <div className="panel team-loading"><span /><p>正在读取团队与成员权限…</p></div> : teams.length ? <div className="team-card-grid">{teams.map((team, index) => <Link href={`/team/${team.id}`} className="panel team-card" key={team.id}><span className="team-card-index">{String(index + 1).padStart(2, "0")}</span><span className="team-card-icon">{team.name.slice(0, 1)}</span><h3>{team.name}</h3><p>{team.ownerId === user.id ? "你创建的研究团队" : "你加入的研究团队"}</p><footer><span>创建于 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(team.createdAt))}</span><ArrowUpRight size={15} /></footer></Link>)}</div> : <div className="panel team-empty"><span className="team-empty-icon"><Users size={25} /></span><h2>还没有加入团队</h2><p>创建一个新的研究团队，或使用伙伴分享的一次性邀请。</p></div>}
        </section>
      </div> : null}
    </>
  );
}
