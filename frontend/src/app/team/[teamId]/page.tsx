"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getTeam, getProfile } from "@/lib/api";
import type { TeamDetail, UserProfile } from "@/lib/api";
import TeamSpaceHeader from "@/components/team/TeamSpaceHeader";
import ChatRoom from "@/components/team/ChatRoom";
import MemberSidebar from "@/components/team/MemberSidebar";
import GrowthTimeline from "@/components/team/GrowthTimeline";

type Tab = "chat" | "members" | "growth";

export default function TeamSpacePage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [loading, setLoading] = useState(true);

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
        <p className="text-black">加载中...</p>
      </div>
    );
  }

  if (!team || !user) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <p className="text-black">团队不存在或无权访问</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <TeamSpaceHeader team={team} />

      {/* Team graph quick link */}
      <div className="flex justify-end border-b border-gray-100 bg-white px-4 py-1.5">
        <button
          onClick={() => router.push(`/graph?team_id=${teamId}&scope=team`)}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          查看团队图谱
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Main area */}
        <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-100 bg-white px-4">
            {(["chat", "members", "growth"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-black hover:text-black"
                }`}
              >
                {t === "chat" ? "聊天" : t === "members" ? "成员" : "成长历程"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            {tab === "chat" ? (
              <ChatRoom teamId={teamId} currentUserId={user.id} />
            ) : tab === "members" ? (
              <div className="h-full overflow-y-auto">
                <MemberSidebar team={team} />
              </div>
            ) : (
              <GrowthTimeline teamId={teamId} />
            )}
          </div>
        </div>

        {/* Right sidebar — always show members on desktop */}
        <div className="hidden w-64 border-l border-gray-100 bg-white lg:block">
          <MemberSidebar team={team} />
        </div>
      </div>
    </div>
  );
}
