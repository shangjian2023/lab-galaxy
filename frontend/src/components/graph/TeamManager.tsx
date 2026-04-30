"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMyTeams, createTeam, getTeam, inviteToTeam, leaveTeam, deleteTeam, searchUsers, getProfile } from "@/lib/api";
import type { TeamInfo, TeamDetail } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TeamManager({ open, onClose }: Props) {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; nickname: string; avatar: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getProfile().then((u) => setCurrentUserId(u.id)).catch(() => {});
      loadTeams();
      setSelectedTeam(null);
      setShowCreate(false);
      setMessage("");
    }
  }, [open]);

  const loadTeams = async () => {
    try {
      const data = await getMyTeams();
      setTeams(data);
    } catch {
      // Silently fail
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await createTeam({ name: newName.trim(), description: newDesc.trim() });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      setMessage("团队创建成功");
      await loadTeams();
    } catch (e: unknown) {
      setMessage(`创建失败: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTeam = async (team: TeamInfo) => {
    try {
      const detail = await getTeam(team.id);
      setSelectedTeam(detail);
    } catch {
      // Silently fail
    }
  };

  const handleInvite = async () => {
    if (!selectedTeam || !inviteName.trim()) return;
    setLoading(true);
    try {
      const res = await inviteToTeam(selectedTeam.id, inviteName.trim());
      setMessage(res.message);
      setInviteName("");
      await handleSelectTeam(selectedTeam);
    } catch (e: unknown) {
      setMessage(`邀请失败: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async (teamId: string) => {
    try {
      await leaveTeam(teamId);
      setMessage("已退出团队");
      await loadTeams();
      setSelectedTeam(null);
    } catch (e: unknown) {
      setMessage(`退出失败: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (teamId: string) => {
    try {
      await deleteTeam(teamId);
      setMessage("团队已删除");
      await loadTeams();
      setSelectedTeam(null);
    } catch (e: unknown) {
      setMessage(`删除失败: ${(e as Error).message}`);
    }
  };

  const handleSearch = async (keyword: string) => {
    setInviteName(keyword);
    if (keyword.length >= 1) {
      try {
        const results = await searchUsers(keyword);
        setSearchResults(results);
      } catch {
        // Silently fail
      }
    } else {
      setSearchResults([]);
    }
  };

  const pickUser = (user: { username: string; nickname: string }) => {
    setInviteName(user.username);
    setSearchResults([]);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          style={{ backdropFilter: "blur(8px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-800">团队管理</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Message */}
            {message && (
              <div className="mx-5 mt-3 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
                {message}
                <button className="ml-2 font-medium" onClick={() => setMessage("")}>关闭</button>
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto p-5">
              {!selectedTeam ? (
                <>
                  {/* Team list */}
                  <div className="space-y-2">
                    {teams.length === 0 && (
                      <p className="py-6 text-center text-sm text-gray-400">
                        还没有加入任何团队，创建或邀请加入团队
                      </p>
                    )}
                    {teams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => void handleSelectTeam(t)}
                        className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left transition-all hover:border-orange-200 hover:bg-orange-50"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-semibold text-gray-700">{t.name}</span>
                            {t.description && (
                              <p className="text-[11px] text-gray-400">{t.description}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-gray-400">{t.member_count} 成员</span>
                            <p className="text-[10px] text-gray-300">创建者: {t.owner_nickname}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Create team */}
                  {showCreate ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-orange-100 bg-orange-50 p-4">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="团队名称"
                        className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="团队描述（可选）"
                        className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreate}
                          disabled={loading || !newName.trim()}
                          className="flex-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                        >
                          {loading ? "创建中..." : "创建"}
                        </button>
                        <button
                          onClick={() => setShowCreate(false)}
                          className="rounded-lg bg-white px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="mt-4 w-full rounded-xl border border-dashed border-gray-200 py-3 text-sm text-gray-400 transition-colors hover:border-orange-300 hover:text-orange-600"
                    >
                      + 创建新团队
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Team detail */}
                  <div className="mb-4">
                    <button
                      onClick={() => setSelectedTeam(null)}
                      className="mb-2 text-xs text-gray-400 hover:text-gray-600"
                    >
                      ← 返回团队列表
                    </button>
                    <h3 className="text-base font-bold text-gray-800">{selectedTeam.name}</h3>
                    {selectedTeam.description && (
                      <p className="text-xs text-gray-400">{selectedTeam.description}</p>
                    )}
                  </div>

                  {/* Members */}
                  <div className="mb-4">
                    <h4 className="mb-2 text-sm font-semibold text-gray-600">成员 ({selectedTeam.members.length})</h4>
                    <div className="space-y-1.5">
                      {selectedTeam.members.map((m) => (
                        <div
                          key={m.user_id}
                          className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-xs font-bold text-white">
                              {(m.nickname || m.username)[0]}
                            </div>
                            <div>
                              <span className="text-sm text-gray-700">{m.nickname || m.username}</span>
                              {m.role !== "member" && (
                                <span className={`ml-1.5 rounded px-1 py-0 text-[10px] ${
                                  m.role === "owner" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
                                }`}>
                                  {m.role === "owner" ? "创建者" : "管理员"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Invite */}
                  <div className="mb-4">
                    <h4 className="mb-2 text-sm font-semibold text-gray-600">邀请成员</h4>
                    <div className="relative">
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(e) => void handleSearch(e.target.value)}
                        placeholder="输入用户名搜索..."
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
                      />
                      {searchResults.length > 0 && (
                        <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                          {searchResults.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => pickUser(u)}
                              className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-orange-50 hover:text-orange-700"
                            >
                              {u.nickname || u.username}
                              <span className="ml-1 text-[10px] text-gray-300">({u.username})</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleInvite}
                      disabled={loading || !inviteName.trim()}
                      className="mt-2 w-full rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                    >
                      {loading ? "邀请中..." : "邀请"}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {(() => {
                      const myMember = selectedTeam.members.find((m) => m.user_id === currentUserId);
                      return (
                        <>
                          {myMember && myMember.role !== "owner" && (
                            <button
                              onClick={() => void handleLeave(selectedTeam.id)}
                              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-red-300 hover:text-red-500"
                            >
                              退出团队
                            </button>
                          )}
                          {myMember && myMember.role === "owner" && (
                            <button
                              onClick={() => {
                                if (confirm("确定要删除此团队吗？")) {
                                  void handleDelete(selectedTeam.id);
                                }
                              }}
                              className="flex-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-100"
                            >
                              删除团队
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
