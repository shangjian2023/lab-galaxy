"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountUser } from "@/lib/auth-types";

interface AuthContextValue {
  user: AccountUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchSession(): Promise<AccountUser | null> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  const payload = await response.json().catch(() => null) as { user?: AccountUser; detail?: string } | null;
  if (!response.ok) throw new Error(payload?.detail ?? "无法读取登录状态");
  return payload?.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ["auth", "session"], queryFn: fetchSession, retry: false, staleTime: 60_000 });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
  }, [queryClient]);

  const logout = useCallback(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(payload?.detail ?? "退出失败");
    }
    queryClient.setQueryData(["auth", "session"], null);
    queryClient.removeQueries({ queryKey: ["auth", "users"] });
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{
      user: session.data ?? null,
      loading: session.isLoading,
      error: session.error instanceof Error ? session.error.message : null,
      refresh,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth 必须在 AuthProvider 中使用");
  return context;
}
