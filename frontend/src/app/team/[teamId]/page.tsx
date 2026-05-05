"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getTeam, getProfile } from "@/lib/api";
import type { TeamDetail, UserProfile } from "@/lib/api";
import TeamSpaceHeader from "@/components/team/TeamSpaceHeader";
import ChatRoom from "@/components/team/ChatRoom";
import MemberSidebar from "@/components/team/MemberSidebar";
import GrowthTimeline from "@/components/team/GrowthTimeline";

type Tab = "chat" | "members" | "growth";

export default function TeamSpacePage() {
  const params = useParams();
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
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  if (!team || !user) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <p className="text-gray-400">团队不存在或无权访问</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <TeamSpaceHeader team={team} />

      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex flex-1 flex-col">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-100 bg-white px-4">
            {(["chat", "members", "growth"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t === "chat" ? "聊天" : t === "members" ? "成员" : "成长历程"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
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
