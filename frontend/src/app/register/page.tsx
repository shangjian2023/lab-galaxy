"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { register as registerApi } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    setBusy(true);
    try {
      await registerApi(username, email, password);
      setRegistered(true);
    } catch (err: any) {
      setError(err.message || "注册失败");
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
        <h1 className="text-2xl font-bold text-center">注册</h1>

        {registered ? (
          <div className="space-y-3 text-center">
            <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
              注册成功！<br />请等待管理员审批后登录。
            </div>
            <a href="/login" className="inline-block text-sm text-brand-600 hover:text-brand-700">
              去登录
            </a>
          </div>
        ) : (
        <>
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
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        <input
          type="password"
          placeholder="确认密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="glass-input w-full px-4 py-2.5 text-sm"
        />

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full py-2.5 text-sm"
        >
          {busy ? "注册中..." : "注册"}
        </button>

        <p className="text-center text-sm text-gray-500">
          已有账号？
          <a href="/login" className="text-brand-600 hover:text-brand-700">登录</a>
        </p>
        </>
        )}
      </form>
    </main>
  );
}
