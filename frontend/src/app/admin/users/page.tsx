"use client";

import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "disabled">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPoints, setShowPoints] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const pageSize = 20;

  const load = async () => {
    try {
      const isActive =
        statusFilter === "active" ? true :
        statusFilter === "pending" ? false :
        statusFilter === "disabled" ? false : undefined;
      const res = await adminListUsers(page, pageSize, search || undefined, roleFilter || undefined, isActive);
      setUsers(res?.items ?? []);
      setTotal(res?.total ?? 0);
      setPendingCount((res?.items ?? []).filter((u) => !u.is_active).length);
    } catch {
      setUsers([]);
      setTotal(0);
      setPendingCount(0);
    }
  };

  useEffect(() => {
    void load();
  }, [page, roleFilter, statusFilter]);

  const handleSearch = () => {
    setPage(1);
    void load();
  };

  const handleUpdate = async (id: string, data: Record<string, unknown>) => {
    await adminUpdateUser(id, data);
    setEditing(null);
    await load();
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
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
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此用户？此操作不可恢复。")) return;
    await adminDeleteUser(id);
    await load();
  };

  const handleApprove = async (id: string) => {
    await adminUpdateUser(id, { is_active: true });
    await load();
  };

  const handleReject = async (id: string) => {
    if (!confirm("确定拒绝此用户？")) return;
    await adminDeleteUser(id);
    await load();
  };

  const handlePassword = async (userId: string, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = fd.get("password") as string;
    const pw2 = fd.get("password2") as string;
    if (pw !== pw2) {
      alert("两次密码不一致");
      return;
    }
    await adminUpdateUser(userId, { password: pw });
    setShowPassword(null);
  };

  const handlePoints = async (userId: string, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await adminAdjustPoints(userId, Number(fd.get("change")), fd.get("reason") as string);
    setShowPoints(null);
    await load();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          用户管理
          {pendingCount > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              待审批
            </span>
          )}
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary px-4 py-2 text-sm"
        >
          + 创建用户
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="搜索用户名/邮箱..."
            className="glass-input w-48 px-3 py-1.5 text-sm"
          />
          <button onClick={handleSearch} className="glass-button px-3 py-1.5 text-sm">搜索</button>
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="glass-input px-3 py-1.5 text-sm"
        >
          <option value="">全部角色</option>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="glass-input px-3 py-1.5 text-sm"
        >
          <option value="all">全部状态</option>
          <option value="active">已激活</option>
          <option value="pending">待审批</option>
          <option value="disabled">已禁用</option>
        </select>
        <span className="ml-auto text-xs text-black">共 {total} 个用户</span>
      </div>

      <AnimatePresence>
        {showCreate && (
          <Modal onClose={() => setShowCreate(false)} title="创建用户">
            <form onSubmit={handleCreate} className="space-y-3">
              <Input name="username" label="用户名" required />
              <Input name="email" label="邮箱" type="email" required />
              <Input name="password" label="密码" type="password" required />
              <Input name="nickname" label="昵称" />
              <div>
                <label className="mb-1 block text-xs text-gray-700">角色</label>
                <select name="role" className="glass-input w-full px-3 py-2 text-sm">
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full py-2 text-sm">
                创建
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPassword && (
          <Modal onClose={() => setShowPassword(null)} title="重置密码">
            <form onSubmit={(e) => handlePassword(showPassword, e)} className="space-y-3">
              <Input name="password" label="新密码" type="password" required />
              <Input name="password2" label="确认密码" type="password" required />
              <button type="submit" className="btn-primary w-full py-2 text-sm">
                确认重置
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPoints && (
          <Modal onClose={() => setShowPoints(null)} title="调整积分">
            <form onSubmit={(e) => handlePoints(showPoints, e)} className="space-y-3">
              <Input name="change" label="积分变动（正数增加，负数减少）" type="number" required />
              <Input name="reason" label="原因" required />
              <button type="submit" className="btn-primary w-full py-2 text-sm">
                确认
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      <div className="glass-card overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead className="glass-table-header">
            <tr className="text-left text-gray-700">
              <th className="px-4 py-2 font-medium">用户名</th>
              <th className="px-4 py-2 font-medium">邮箱</th>
              <th className="px-4 py-2 font-medium">昵称</th>
              <th className="px-4 py-2 font-medium">头像</th>
              <th className="px-4 py-2 font-medium">角色</th>
              <th className="px-4 py-2 font-medium">等级</th>
              <th className="px-4 py-2 font-medium">积分</th>
              <th className="px-4 py-2 font-medium">状态</th>
              <th className="px-4 py-2 font-medium">注册时间</th>
              <th className="px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="glass-table-row border-t">
                <td className="px-4 py-2 font-medium">{u.username}</td>
                <td className="px-4 py-2 text-gray-700">{u.email}</td>
                <td className="px-4 py-2 text-gray-700">
                  {editing === u.id ? (
                    <input
                      type="text"
                      defaultValue={u.nickname || ""}
                      onBlur={(e) => void handleUpdate(u.id, { nickname: e.target.value })}
                      className="glass-input w-24 px-2 py-1 text-xs"
                      placeholder="昵称"
                    />
                  ) : (u.nickname || "-")}
                </td>
                <td className="px-4 py-2 text-gray-700">
                  {editing === u.id ? (
                    <input
                      type="text"
                      defaultValue={u.avatar || ""}
                      onBlur={(e) => void handleUpdate(u.id, { avatar: e.target.value })}
                      className="glass-input w-32 px-2 py-1 text-xs"
                      placeholder="头像URL"
                    />
                  ) : u.avatar ? (
                    <span className="text-xs text-brand-500 truncate max-w-[100px] inline-block" title={u.avatar}>
                      {u.avatar.slice(0, 20)}…
                    </span>
                  ) : "-"}
                </td>
                <td className="px-4 py-2">
                  {editing === u.id ? (
                    <select
                      defaultValue={u.role}
                      onChange={(e) => void handleUpdate(u.id, { role: e.target.value })}
                      className="glass-input px-2 py-1 text-xs"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className={`rounded-xl px-1.5 py-0.5 text-xs font-medium ${
                      u.role === "admin" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-black"
                    }`}>{u.role}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editing === u.id ? (
                    <input
                      type="number"
                      defaultValue={u.level}
                      min={1}
                      onBlur={(e) => void handleUpdate(u.id, { level: Number(e.target.value) })}
                      className="glass-input w-16 px-2 py-1 text-xs"
                    />
                  ) : u.level}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => setShowPoints(u.id)} className="text-brand-600 hover:underline">
                    {u.points}
                  </button>
                </td>
                <td className="px-4 py-2">
                  {!u.is_active && u.role !== "admin" ? (
                    <span className="rounded-xl bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                      待审批
                    </span>
                  ) : u.is_active ? (
                    <button
                      onClick={() => void handleUpdate(u.id, { is_active: false })}
                      className="rounded-xl bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                    >
                      正常
                    </button>
                  ) : (
                    <span className="rounded-xl bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                      已禁用
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-black">
                  {new Date(u.created_at).toLocaleDateString("zh-CN")}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    {!u.is_active && u.role !== "admin" && (
                      <>
                        <button onClick={() => void handleApprove(u.id)} className="rounded-xl bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100">
                          通过
                        </button>
                        <button onClick={() => void handleReject(u.id)} className="rounded-xl bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100">
                          拒绝
                        </button>
                      </>
                    )}
                    {u.is_active && u.role !== "admin" && (
                      <button
                        onClick={() => void handleUpdate(u.id, { is_active: false })}
                        className="text-xs text-red-600 hover:underline"
                      >
                        禁用
                      </button>
                    )}
                    {!u.is_active && u.role !== "admin" && statusFilter === "disabled" && (
                      <button onClick={() => void handleApprove(u.id)} className="text-xs text-green-600 hover:underline">
                        启用
                      </button>
                    )}
                    <button onClick={() => setEditing(editing === u.id ? null : u.id)} className="text-xs text-brand-600 hover:underline">
                      {editing === u.id ? "完成" : "编辑"}
                    </button>
                    <button onClick={() => setShowPassword(u.id)} className="text-xs text-gray-700 hover:underline">
                      改密
                    </button>
                    {u.role !== "admin" && (
                      <button onClick={() => void handleDelete(u.id)} className="text-xs text-red-600 hover:underline">
                        删除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="btn-secondary px-3 py-1 disabled:opacity-40"
        >
          上一页
        </button>
        <span className="text-gray-700">{page} / {Math.max(totalPages, 1)}</span>
        <button
          disabled={page >= totalPages || totalPages === 0}
          onClick={() => setPage((p) => p + 1)}
          className="btn-secondary px-3 py-1 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="glass-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-md rounded-2xl p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-black hover:text-black">×</button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Input({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-700">{label}</label>
      <input {...props} className={className ?? "glass-input w-full px-3 py-2 text-sm"} />
    </div>
  );
}
