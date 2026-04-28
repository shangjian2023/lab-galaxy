"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login as loginApi } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await loginApi(username, password);
      localStorage.setItem("token", res.access_token);
      const { getProfile } = await import("@/lib/api");
      const profile = await getProfile();
      setUser(profile);
      router.push("/documents");
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf7f5]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 glass-card rounded-2xl p-8"
      >
        <h1 className="text-2xl font-bold text-center">登录</h1>

        {error && <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-700">{error}</p>}

        <input
          type="text"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="glass-input w-full px-4 py-2.5 text-sm"
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="glass-input w-full px-4 py-2.5 text-sm"
        />

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full py-2.5 text-sm"
        >
          {busy ? "登录中..." : "登录"}
        </button>

        <p className="text-center text-sm text-gray-500">
          还没有账号？
          <a href="/register" className="text-brand-600 hover:text-brand-700">注册</a>
        </p>
      </form>
    </main>
  );
}
