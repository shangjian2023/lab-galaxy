"use client";

import { useEffect, useState } from "react";
import {
  adminListDocuments,
  adminUpdateDocument,
  adminDeleteDocument,
  adminReprocessDocument,
  type DocumentItem,
} from "@/lib/api";
import { EXPERIMENT_TYPES, SUBJECT_OPTIONS } from "@/lib/constants";

const STATUS_OPTIONS = ["uploaded", "parsing", "extracting", "completed", "failed"];

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function lookupLabel(list: readonly { value: string; label: string }[], val: string | null) {
  return list.find((i) => i.value === val)?.label ?? val ?? "-";
}

export default function AdminDocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);

  const load = () => {
    adminListDocuments(page, 50, statusFilter || undefined).then((res) => {
      setDocs(res?.items ?? []);
      setTotal(res?.total ?? 0);
    }).catch(() => {
      setDocs([]);
      setTotal(0);
    });
  };
  useEffect(() => { load(); }, [page, statusFilter]);

  const handleUpdate = async (id: string, field: string, value: unknown) => {
    await adminUpdateDocument(id, { [field]: value });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此文档？")) return;
    await adminDeleteDocument(id);
    load();
  };

  const handleReprocess = async (id: string) => {
    if (!confirm("确定重新处理此文档？")) return;
    try {
      await adminReprocessDocument(id);
      load();
    } catch {
      alert("触发重新处理失败");
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">文档管理</h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-sm text-gray-400">共 {total} 条</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-3 py-2 font-medium">文件名</th>
              <th className="px-3 py-2 font-medium">类型</th>
              <th className="px-3 py-2 font-medium">大小</th>
              <th className="px-3 py-2 font-medium">年份</th>
              <th className="px-3 py-2 font-medium">实验类型</th>
              <th className="px-3 py-2 font-medium">学科</th>
              <th className="px-3 py-2 font-medium">隐私</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium">实体</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => {
              const isEditing = editing === doc.id;
              const entityCount = doc.extraction_result?.entities?.length ?? 0;
              const relCount = doc.extraction_result?.relations?.length ?? 0;
              return (
                <tr key={doc.id} className="border-t hover:bg-gray-50">
                  <td className="max-w-[200px] truncate px-3 py-2 font-medium">{doc.title}</td>
                  <td className="px-3 py-2 uppercase text-gray-500">{doc.file_type}</td>
                  <td className="px-3 py-2 text-gray-500">{formatSize(doc.file_size)}</td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input type="number" defaultValue={doc.experiment_year ?? ""} min={2000} max={2030}
                        onBlur={(e) => handleUpdate(doc.id, "experiment_year", Number(e.target.value) || null)}
                        className="w-20 rounded border px-2 py-1 text-xs" />
                    ) : doc.experiment_year ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select defaultValue={doc.experiment_type ?? ""}
                        onChange={(e) => handleUpdate(doc.id, "experiment_type", e.target.value || null)}
                        className="rounded border px-2 py-1 text-xs">
                        <option value="">-</option>
                        {EXPERIMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    ) : lookupLabel(EXPERIMENT_TYPES, doc.experiment_type)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {isEditing ? (
                      <MultiSelect
                        options={SUBJECT_OPTIONS}
                        selected={doc.subjects ?? []}
                        onChange={(v) => handleUpdate(doc.id, "subjects", v.length ? v : null)}
                      />
                    ) : (
                      (doc.subjects ?? []).map((s) => SUBJECT_OPTIONS.find((o) => o.value === s)?.label ?? s).join("、") || "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select defaultValue={doc.privacy}
                        onChange={(e) => handleUpdate(doc.id, "privacy", e.target.value)}
                        className="rounded border px-2 py-1 text-xs">
                        <option value="public">公开</option>
                        <option value="team">团队</option>
                        <option value="private">私有</option>
                      </select>
                    ) : doc.privacy}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      doc.status === "completed" ? "bg-green-100 text-green-700"
                      : doc.status === "failed" ? "bg-red-100 text-red-600"
                      : "bg-yellow-100 text-yellow-700"
                    }`}>{doc.status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {entityCount > 0 ? `${entityCount}E / ${relCount}R` : "-"}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    <button onClick={() => setEditing(isEditing ? null : doc.id)}
                      className="text-xs text-blue-600 hover:underline">
                      {isEditing ? "完成" : "编辑"}
                    </button>
                    {(doc.status === "failed" || doc.status === "completed") && (
                      <button onClick={() => handleReprocess(doc.id)}
                        className="text-xs text-orange-600 hover:underline">重新处理</button>
                    )}
                    <button onClick={() => handleDelete(doc.id)}
                      className="text-xs text-red-600 hover:underline">删除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex justify-center gap-2">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
          className="rounded border px-3 py-1 text-sm disabled:opacity-40">上一页</button>
        <span className="px-3 py-1 text-sm text-gray-500">{page}</span>
        <button disabled={docs.length < 50} onClick={() => setPage((p) => p + 1)}
          className="rounded border px-3 py-1 text-sm disabled:opacity-40">下一页</button>
      </div>
    </div>
  );
}

function MultiSelect({ options, selected, onChange }: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => toggle(o.value)}
          className={`rounded px-1.5 py-0.5 text-[10px] ${
            selected.includes(o.value) ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"
          }`}>{o.label}</button>
      ))}
    </div>
  );
}
