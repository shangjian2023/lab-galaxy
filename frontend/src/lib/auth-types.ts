export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "active" | "disabled";
export type DocumentVisibility = "private" | "team" | "public";

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Viewer {
  id: string;
  role: UserRole;
}
