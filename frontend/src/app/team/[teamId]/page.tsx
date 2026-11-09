"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Clipboard, Clock3, Crown, KeyRound, LogOut, ShieldCheck, UserMinus, Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/components/app/AuthProvider";
import { createInvite, getTeam, leaveTeam, removeMember, setMemberRole, type TeamDetail, type TeamInvite } from "@/lib/team-api";

export default function TeamSpacePage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    if (!user || !teamId) return;
    setLoading(true);
    setError("");
    try {
      setTeam((await getTeam(teamId)).team);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "团队不存在或无权访问");
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, [teamId, user]);

  useEffect(() => { void reload(); }, [reload]);

  const run = async (key: string, operation: () => Promise<void>) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy("");
    }
  };

  const isOwner = Boolean(team && user && team.members.some((member) => member.userId === user.id && member.role === "owner"));
  const ownerCount = team?.members.filter((member) => member.role === "owner").length ?? 0;

  if (!user && !authLoading) return <div className="panel team-empty"><span className="team-empty-icon"><KeyRound size={25} /></span><h2>请先登录</h2><p>登录后才能验证团队成员身份。</p><Link href="/account" className="btn btn-primary">前往登录</Link></div>;
  if (loading || authLoading) return <div className="panel team-loading"><span /><p>正在验证团队访问权限…</p></div>;
  if (!team) return <div className="panel team-empty"><span className="team-empty-icon"><Users size={25} /></span><h2>无法打开团队</h2><p>{error || "团队不存在或你已不在成员列表中。"}</p><Link href="/team" className="btn btn-secondary">返回团队列表</Link></div>;

  return (
    <>
      <PageHeader eyebrow="TEAM / MEMBER ACCESS" title={team.name} description="成员、邀请与角色均由服务端实时校验。离开团队后，团队文档的检索与问答权限立即回收。" actions={<Link href="/team" className="btn btn-secondary"><ArrowLeft size={14} />团队列表</Link>} />
      {error ? <div className="form-message error" role="alert">{error}</div> : null}
      {notice ? <div className="form-message success" role="status"><Check size={14} />{notice}</div> : null}
      <div className="team-detail-grid">
        <section className="panel team-members-panel">
          <div className="panel-heading"><div><p className="eyebrow"><Users size={13} />MEMBERS</p><h2 className="panel-title">团队成员</h2><p className="panel-subtitle">{team.members.length} 名成员 · {ownerCount} 名所有者</p></div><span className={`account-role ${isOwner ? "" : "member"}`}>{isOwner ? "你拥有管理权限" : "你是团队成员"}</span></div>
          <div className="team-member-list">{team.members.map((member) => <div className="team-member-row" key={member.userId}>
            <span className="profile-avatar">{member.displayName.slice(0, 1)}</span>
            <div className="team-member-identity"><strong>{member.displayName}{member.userId === user?.id ? "（你）" : ""}</strong><span>{member.email}</span><small>加入于 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(member.joinedAt))}</small></div>
            <span className={`team-role ${member.role}`}>{member.role === "owner" ? <Crown size={12} /> : <ShieldCheck size={12} />}{member.role === "owner" ? "所有者" : "成员"}</span>
            {isOwner ? <div className="team-member-actions"><select value={member.role} onChange={(event) => void run(`role-${member.userId}`, async () => { await setMemberRole(team.id, member.userId, event.target.value as "owner" | "member"); setNotice(`已更新 ${member.displayName} 的角色`); await reload(); })} disabled={busy === `role-${member.userId}`} aria-label={`设置 ${member.displayName} 的角色`}><option value="member">成员</option><option value="owner">所有者</option></select>{member.userId !== user?.id ? <button className="icon-button" onClick={() => { if (window.confirm(`确定移除 ${member.displayName}？其团队文档访问权限将立即失效。`)) void run(`remove-${member.userId}`, async () => { await removeMember(team.id, member.userId); setNotice(`已移除 ${member.displayName}`); await reload(); }); }} disabled={busy === `remove-${member.userId}`} aria-label={`移除 ${member.displayName}`}><UserMinus size={14} /></button> : null}</div> : null}
          </div>)}</div>
          <div className="team-leave-zone"><div><LogOut size={15} /><p><strong>退出这个团队</strong><span>退出后将无法继续读取团队私有知识；最后一个所有者不能退出。</span></p></div><button className="btn btn-secondary" onClick={() => { if (window.confirm(`确定退出「${team.name}」？`)) void run("leave", async () => { await leaveTeam(team.id); router.push("/team"); }); }} disabled={busy === "leave"}>退出团队</button></div>
        </section>
        <aside className="team-detail-sidebar">
          <section className="panel team-summary-card"><p className="eyebrow">TEAM PROFILE</p><span className="team-summary-mark">{team.name.slice(0, 1)}</span><h2>{team.name}</h2><div><span>创建时间</span><strong>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(team.createdAt))}</strong></div><div><span>成员规模</span><strong>{team.members.length} 人</strong></div><div><span>共享范围</span><strong>仅当前成员</strong></div></section>
          {isOwner ? <section className="panel team-invite-card"><p className="eyebrow"><KeyRound size={13} />INVITE MEMBER</p><h2 className="panel-title">创建一次性邀请</h2><p>令牌只在创建时显示一次。请通过你信任的渠道发送，不要发布到公开论坛。</p><label htmlFor="invite-expiry"><Clock3 size={13} />有效期</label><select id="invite-expiry" value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.target.value))}><option value={24}>24 小时</option><option value={72}>3 天</option><option value={168}>7 天</option><option value={1}>1 小时</option></select><button className="btn btn-primary" onClick={() => void run("invite", async () => { setInvite(null); setInvite((await createInvite(team.id, expiresInHours)).invite); setNotice("邀请已创建，请立即复制"); })} disabled={busy === "invite"}>{busy === "invite" ? "正在创建…" : "生成邀请令牌"}</button>{invite ? <div className="invite-result"><span>仅显示这一次 · 至 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invite.expiresAt))}</span><code>{invite.token}</code><button className="btn btn-secondary" onClick={() => void navigator.clipboard.writeText(invite.token).then(() => setNotice("邀请令牌已复制")).catch(() => setError("浏览器未允许复制，请手动选择令牌"))}><Clipboard size={13} />复制令牌</button></div> : null}</section> : <section className="panel team-invite-card"><p className="eyebrow"><ShieldCheck size={13} />MEMBER ACCESS</p><h2 className="panel-title">成员权限</h2><p>你可以读取团队共享文档并参与证据问答。邀请、角色和成员移除仅团队所有者可操作。</p></section>}
        </aside>
      </div>
    </>
  );
}
