"use client";

import type { TeamDetail } from "@/lib/api";

interface Props {
  team: TeamDetail;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "创建者",
  admin: "管理员",
  member: "成员",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-orange-100 text-orange-600",
  admin: "bg-blue-100 text-blue-600",
  member: "bg-gray-100 text-gray-500",
};

export default function MemberSidebar({ team }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700">成员 · {team.members.length}</h3>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {team.members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-xs font-bold text-white">
              {(m.nickname || m.username)[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm text-gray-700">{m.nickname || m.username}</span>
                {m.role !== "member" && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[m.role] || ROLE_COLORS.member}`}>
                    {ROLE_LABELS[m.role] || m.role}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
