"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getProfile, type UserProfile } from "@/lib/api";

interface AuthCtx {
  user: UserProfile | null;
  loading: boolean;
  setUser: (u: UserProfile | null) => void;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: () => {},
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    getProfile()
      .then((profile) => {
        // Only set user if account is active (approved by admin)
        if ((profile as any).is_active === false) {
          localStorage.removeItem("token");
          setUser(null);
        } else {
          setUser(profile);
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
