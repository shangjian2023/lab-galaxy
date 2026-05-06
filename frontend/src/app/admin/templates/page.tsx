"use client";

import { useEffect, useState } from "react";
import {
  adminListTemplates,
  adminUpdateTemplate,
  adminDeleteTemplate,
  type TemplateItem,
} from "@/lib/api";

const STATUS_OPTIONS = ["published", "draft", "rejected"];

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);
  const pageSize = 50;

  const load = () => {
    adminListTemplates(page, pageSize, statusFilter || undefined).then((res) => {
      setTemplates(res?.items ?? []);
      setTotal(res?.total ?? 0);
    }).catch(() => {
      setTemplates([]);
      setTotal(0);
    });
  };
  useEffect(() => { load(); }, [page, statusFilter]);

  const handleUpdate = async (id: string, field: string, value: unknown) => {
    await adminUpdateTemplate(id, { [field]: value });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此模板？")) return;
    await adminDeleteTemplate(id);
    load();
  };

  const handleApprove = async (id: string) => {
    await adminUpdateTemplate(id, { status: "published" });
    load();
  };

  const handleReject = async (id: string) => {
    await adminUpdateTemplate(id, { status: "rejected" });
    load();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">模板管理</h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="glass-input px-3 py-1.5 text-sm"
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-sm text-gray-600">共 {total} 条</span>
        </div>
      </div>

      <div className="glass-card overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead className="glass-table-header">
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 font-medium">模板名称</th>
              <th className="px-3 py-2 font-medium">分类</th>
              <th className="px-3 py-2 font-medium">标签</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium">官方</th>
              <th className="px-3 py-2 font-medium">创建者</th>
              <th className="px-3 py-2 font-medium">❤️</th>
              <th className="px-3 py-2 font-medium">下载</th>
              <th className="px-3 py-2 font-medium">收藏</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => {
              const isEditing = editing === tpl.id;
              return (
                <tr key={tpl.id} className="glass-table-row border-t">
                  <td className="max-w-[160px] truncate px-3 py-2 font-medium">{tpl.name}</td>
                  <td className="px-3 py-2 text-gray-700">{tpl.category || "-"}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {tpl.tags?.join("、") || "-"}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select
                        defaultValue={tpl.status || "published"}
                        onChange={(e) => handleUpdate(tpl.id, "status", e.target.value)}
                        className="glass-input px-2 py-1 text-xs"
                      >
                        <option value="published">已发布</option>
                        <option value="draft">草稿</option>
                        <option value="rejected">已拒绝</option>
                      </select>
                    ) : (
                      <span className={`rounded-xl px-2 py-0.5 text-xs font-medium ${
                        tpl.status === "published" ? "bg-green-100 text-green-700"
                        : tpl.status === "rejected" ? "bg-red-100 text-red-600"
                        : "bg-yellow-100 text-yellow-700"
                      }`}>{tpl.status || "published"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        defaultChecked={tpl.is_official}
                        onChange={(e) => handleUpdate(tpl.id, "is_official", e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                    ) : tpl.is_official ? (
                      <span className="rounded-xl bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">官方</span>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{tpl.created_by?.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-xs">{tpl.likes}</td>
                  <td className="px-3 py-2 text-xs">{tpl.downloads}</td>
                  <td className="px-3 py-2 text-xs">{tpl.bookmarks}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button
                      onClick={() => setEditing(isEditing ? null : tpl.id)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      {isEditing ? "完成" : "编辑"}
                    </button>
                    {tpl.status !== "published" && (
                      <button onClick={() => handleApprove(tpl.id)} className="text-xs text-green-600 hover:underline">
                        通过
                      </button>
                    )}
                    {tpl.status === "published" && (
                      <button onClick={() => handleReject(tpl.id)} className="text-xs text-red-600 hover:underline">
                        下架
                      </button>
                    )}
                    <button onClick={() => handleDelete(tpl.id)} className="text-xs text-red-600 hover:underline">
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-center gap-2 text-sm">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
          className="btn-secondary px-3 py-1 text-sm disabled:opacity-40">上一页</button>
        <span className="px-3 py-1 text-sm text-gray-700">{page} / {Math.max(totalPages, 1)}</span>
        <button disabled={templates.length < pageSize} onClick={() => setPage((p) => p + 1)}
          className="btn-secondary px-3 py-1 text-sm disabled:opacity-40">下一页</button>
      </div>
    </div>
  );
}
