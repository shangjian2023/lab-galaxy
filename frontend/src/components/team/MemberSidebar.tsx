"use client";

import { useState, useCallback } from "react";
import type { TeamDetail } from "@/lib/api";
import { inviteToTeam } from "@/lib/api";
import { getUserAvatarColor } from "@/lib/utils";

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
  member: "bg-gray-100 text-gray-700",
};

export default function MemberSidebar({ team }: Props) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [inviteMsg, setInviteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  const doInvite = useCallback(async () => {
    const id = parseInt(inviteId, 10);
    if (!id || id < 100000) {
      setInviteMsg({ type: "error", text: "请输入有效的数字ID" });
      return;
    }
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await inviteToTeam(team.id, id);
      setInviteMsg({ type: "success", text: res.message });
      setInviteId("");
    } catch {
      setInviteMsg({ type: "error", text: "邀请失败，请检查用户ID" });
    } finally {
      setInviting(false);
    }
  }, [team.id, inviteId]);

  const isOwner = team.members.some((m) => m.user_id === team.owner_id);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#DBC7B5]/20 px-4 py-3">
        <h3 className="text-sm font-semibold text-[#492D22]">成员 · {team.members.length}</h3>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-lg bg-[#DBC7B5]/30 px-2.5 py-1 text-xs font-medium text-[#6B5D50] transition-colors hover:bg-[#DBC7B5]/50"
        >
          {showInvite ? "取消" : "邀请"}
        </button>
      </div>

      {showInvite && (
        <div className="border-b border-[#DBC7B5]/20 bg-[#DBC7B5]/15 px-4 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteId}
              onChange={(e) => setInviteId(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") doInvite(); }}
              placeholder="输入用户数字ID"
              className="flex-1 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-orange-400"
            />
            <button
              onClick={doInvite}
              disabled={inviting || !inviteId}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
            >
              {inviting ? "邀请中..." : "邀请"}
            </button>
          </div>
          {inviteMsg && (
            <p className={`mt-1.5 text-xs ${inviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
              {inviteMsg.text}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {team.members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50">
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm" style={{ background: getUserAvatarColor(m.user_id).bg }}>
              {(m.nickname || m.username)[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm text-gray-700">{m.nickname || m.username}</span>
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-black font-mono">
                  {m.display_id || "-"}
                </span>
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
