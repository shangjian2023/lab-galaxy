import type { TeamRole } from "@/lib/team-service";

export interface TeamSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  email: string;
  displayName: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMember[];
}

export interface TeamInvite {
  id: string;
  token: string;
  expiresAt: string;
}

interface ErrorPayload { detail?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => null) as (T & ErrorPayload) | null;
  if (!response.ok) throw new Error(payload?.detail ?? `请求失败（HTTP ${response.status}）`);
  if (!payload) throw new Error("服务未返回有效数据");
  return payload;
}

export function listTeams() {
  return request<{ teams: TeamSummary[] }>("/api/teams");
}

export function createTeam(name: string) {
  return request<{ team: TeamDetail }>("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function joinTeam(token: string) {
  return request<{ team: TeamDetail }>("/api/teams/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export function getTeam(id: string) {
  return request<{ team: TeamDetail }>(`/api/teams/${encodeURIComponent(id)}`);
}

export function createInvite(id: string, expiresInHours: number) {
  return request<{ invite: TeamInvite }>(`/api/teams/${encodeURIComponent(id)}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresInHours }),
  });
}

export function leaveTeam(id: string) {
  return request<{ team: TeamSummary }>(`/api/teams/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function removeMember(id: string, userId: string) {
  return request<{ team: TeamSummary }>(`/api/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export function setMemberRole(id: string, userId: string, role: TeamRole) {
  return request<{ member: TeamMember }>(`/api/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}
