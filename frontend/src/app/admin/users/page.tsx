"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminListUsers,
  adminUpdateUser,
  adminCreateUser,
  adminDeleteUser,
  adminAdjustPoints,
  type UserProfile,
} from "@/lib/api";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPoints, setShowPoints] = useState<string | null>(null);

  const load = () => adminListUsers().then(setUsers);
  useEffect(() => { load(); }, []);

  const handleUpdate = async (id: string, data: Record<string, unknown>) => {
    await adminUpdateUser(id, data);
    setEditing(null);
    load();
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await adminCreateUser({
      username: fd.get("username") as string,
      email: fd.get("email") as string,
      password: fd.get("password") as string,
      nickname: (fd.get("nickname") as string) || undefined,
      role: (fd.get("role") as string) || "user",
    });
    setShowCreate(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定禁用此用户？")) return;
    await adminDeleteUser(id);
    load();
  };

  const handlePoints = async (userId: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await adminAdjustPoints(userId, Number(fd.get("change")), fd.get("reason") as string);
    setShowPoints(null);
    load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">用户管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          + 创建用户
        </button>
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <Modal onClose={() => setShowCreate(false)} title="创建用户">
            <form onSubmit={handleCreate} className="space-y-3">
              <Input name="username" label="用户名" required />
              <Input name="email" label="邮箱" type="email" required />
              <Input name="password" label="密码" type="password" required />
              <Input name="nickname" label="昵称" />
              <div>
                <label className="mb-1 block text-xs text-gray-500">角色</label>
                <select name="role" className="w-full rounded border px-3 py-2 text-sm">
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <button type="submit" className="w-full rounded-lg bg-orange-600 py-2 text-sm font-medium text-white">
                创建
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* Points modal */}
      <AnimatePresence>
        {showPoints && (
          <Modal onClose={() => setShowPoints(null)} title="调整积分">
            <form onSubmit={(e) => handlePoints(showPoints, e)} className="space-y-3">
              <Input name="change" label="积分变动（正数增加，负数减少）" type="number" required />
              <Input name="reason" label="原因" required />
              <button type="submit" className="w-full rounded-lg bg-orange-600 py-2 text-sm font-medium text-white">
                确认
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-4 py-2 font-medium">用户名</th>
              <th className="px-4 py-2 font-medium">邮箱</th>
              <th className="px-4 py-2 font-medium">昵称</th>
              <th className="px-4 py-2 font-medium">角色</th>
              <th className="px-4 py-2 font-medium">等级</th>
              <th className="px-4 py-2 font-medium">积分</th>
              <th className="px-4 py-2 font-medium">状态</th>
              <th className="px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{u.username}</td>
                <td className="px-4 py-2 text-gray-500">{u.email}</td>
                <td className="px-4 py-2">{u.nickname || "-"}</td>
                <td className="px-4 py-2">
                  {editing === u.id ? (
                    <select
                      defaultValue={u.role}
                      onChange={(e) => handleUpdate(u.id, { role: e.target.value })}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      u.role === "admin" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
                    }`}>{u.role}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editing === u.id ? (
                    <input
                      type="number" defaultValue={u.level} min={1}
                      onBlur={(e) => handleUpdate(u.id, { level: Number(e.target.value) })}
                      className="w-16 rounded border px-2 py-1 text-xs"
                    />
                  ) : u.level}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => setShowPoints(u.id)} className="text-blue-600 hover:underline">
                    {u.points}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleUpdate(u.id, { is_active: !u.is_active })}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                    }`}
                  >
                    {u.is_active ? "正常" : "已禁用"}
                  </button>
                </td>
                <td className="px-4 py-2 space-x-2">
                  <button onClick={() => setEditing(editing === u.id ? null : u.id)} className="text-xs text-blue-600 hover:underline">
                    {editing === u.id ? "完成" : "编辑"}
                  </button>
                  {u.role !== "admin" && (
                    <button onClick={() => handleDelete(u.id)} className="text-xs text-red-600 hover:underline">
                      禁用
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Reusable small components
function Input({ name, label, type = "text", required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <input name={name} type={type} required={required}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-orange-400 focus:outline-none" />
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold">{title}</h3>
        {children}
      </motion.div>
    </motion.div>
  );
}
