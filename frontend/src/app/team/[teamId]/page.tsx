"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getTeam, getProfile } from "@/lib/api";
import type { TeamDetail, UserProfile } from "@/lib/api";
import TeamSpaceHeader from "@/components/team/TeamSpaceHeader";
import ChatRoom from "@/components/team/ChatRoom";
import MemberSidebar from "@/components/team/MemberSidebar";
import GrowthTimeline from "@/components/team/GrowthTimeline";

export default function TeamSpacePage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
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

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col" style={{ background: "#F4F1EE" }}>
      <TeamSpaceHeader team={team} />

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left: Members */}
        <div className="w-56 shrink-0 border-r border-[#DBC7B5]/25 overflow-y-auto" style={{ background: "#F4F1EE" }}>
          <MemberSidebar team={team} />
        </div>

        {/* Center: Chat Room */}
        <div className="flex flex-1 justify-center overflow-hidden" style={{ minHeight: 0 }}>
          <div className="w-full max-w-[800px] flex flex-col" style={{ minHeight: 0 }}>
            <ChatRoom teamId={teamId} currentUserId={user.id} />
          </div>
        </div>

        {/* Right: Growth Timeline */}
        <div className="w-80 shrink-0 border-l border-[#DBC7B5]/25 overflow-y-auto" style={{ background: "#F4F1EE" }}>
          <GrowthTimeline teamId={teamId} />
        </div>
      </div>
    </div>
  );
}
