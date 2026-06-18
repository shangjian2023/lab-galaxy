"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getProfile, getTeam } from "@/lib/api";
import type { TeamDetail, UserProfile } from "@/lib/api";
import TeamSpaceHeader from "@/components/team/TeamSpaceHeader";
import ChatRoom from "@/components/team/ChatRoom";
import MemberSidebar from "@/components/team/MemberSidebar";
import GrowthTimeline from "@/components/team/GrowthTimeline";
import PollPanel from "@/components/team/PollPanel";

type RightTab = "growth" | "polls";

export default function TeamSpacePage() {
  const params = useParams();
  const teamId = params.teamId as string;
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<RightTab>("growth");

  useEffect(() => {
    if (!teamId) return;
    Promise.all([getTeam(teamId), getProfile()])
      .then(([t, u]) => {
        setTeam(t);
        setUser(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <p className="text-[#6B5D50]">加载中...</p>
      </div>
    );
  }

  if (!team || !user) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <p className="text-[#6B5D50]">团队不存在或无权访问</p>
      </div>
    );
  }

  const tabs: ReadonlyArray<{ key: RightTab; label: string }> = [
    { key: "growth", label: "成长时间线" },
    { key: "polls", label: "团队投票" },
  ];

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col" style={{ background: "var(--bg-warm)" }}>
      <TeamSpaceHeader team={team} />

      <div className="flex flex-1 gap-3 overflow-hidden p-3" style={{ minHeight: 0 }}>
        {/* Left: members */}
        <aside className="liquid-glass-card hidden w-56 shrink-0 overflow-hidden md:block">
          <MemberSidebar team={team} />
        </aside>

        {/* Center: chat */}
        <main className="liquid-glass-card flex min-w-0 flex-1 flex-col overflow-hidden">
          <ChatRoom teamId={teamId} currentUserId={user.id} />
        </main>

        {/* Right: tabbed growth / polls */}
        <aside className="liquid-glass-card flex w-80 shrink-0 flex-col overflow-hidden">
          <div className="flex gap-1 border-b border-black/5 p-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 ${
                  tab === t.key ? "bg-[#9A8C73] text-white shadow-sm" : "glass-button text-[#6B5D50]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === "growth" ? <GrowthTimeline teamId={teamId} /> : <PollPanel teamId={teamId} currentUserId={user.id} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
