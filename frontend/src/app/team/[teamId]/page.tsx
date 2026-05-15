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

  const isChatTab = tab === "chat";

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col" style={{ background: "#F4F1EE" }}>
      <TeamSpaceHeader team={team} />

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Main area */}
        <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
          {/* Tab bar */}
          <div className="flex items-center gap-2 border-b border-[#DBC7B5]/25 px-5 py-2.5" style={{ background: "#F4F1EE" }}>
            {(["chat", "members", "growth"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                  tab === t
                    ? "bg-[#9A8C73] text-white shadow-sm"
                    : "text-[#6B5D50] hover:bg-[#DBC7B5]/25"
                }`}
              >
                {t === "chat" ? "💬 聊天" : t === "members" ? "👥 成员" : "📈 成长历程"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            {tab === "chat" ? (
              <div className="flex flex-1 justify-center overflow-hidden" style={{ minHeight: 0 }}>
                <div className="w-full max-w-[720px] flex flex-col" style={{ minHeight: 0 }}>
                  <ChatRoom teamId={teamId} currentUserId={user.id} />
                </div>
              </div>
            ) : tab === "members" ? (
              <div className="h-full overflow-y-auto">
                <MemberSidebar team={team} />
              </div>
            ) : (
              <GrowthTimeline teamId={teamId} />
            )}
          </div>
        </div>

        {/* Right sidebar — only show on non-chat tabs or always */}
        {!isChatTab && (
          <div className="hidden w-64 border-l border-[#DBC7B5]/25 lg:block overflow-y-auto" style={{ background: "#F4F1EE" }}>
            <div className="px-4 py-3 border-b border-[#DBC7B5]/20">
              <h3 className="text-xs font-bold text-[#492D22]">{team.name}</h3>
              <p className="text-[10px] text-[#9A8C73] mt-0.5">{team.member_count} 成员</p>
            </div>
            <MemberSidebar team={team} />
          </div>
        )}
      </div>
    </div>
  );
}
