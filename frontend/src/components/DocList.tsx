"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { listDocuments, reprocessDocument, deleteDocument, confirmIngest, type DocumentItem } from "@/lib/api";
import { EXPERIMENT_TYPES, SUBJECT_OPTIONS, PRIVACY_OPTIONS } from "@/lib/constants";
import { formatSize } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string; barColor: string; desc: string }> = {
  uploaded:   { label: "样本已注入",   color: "bg-blue-50 text-blue-700",    barColor: "bg-blue-400",   desc: "等待处理队列" },
  parsing:    { label: "🧬 文本解构",  color: "bg-indigo-50 text-indigo-700", barColor: "bg-indigo-500", desc: "提取文本分子" },
  extracting: { label: "⚗️ 知识萃取",  color: "bg-purple-50 text-purple-700", barColor: "bg-purple-500", desc: "AI 萃取知识实体" },
  completed:  { label: "✨ 萃取完成",  color: "bg-green-100 text-green-700",  barColor: "bg-green-500",  desc: "已写入知识图谱" },
  failed:     { label: "⚠️ 实验中断",  color: "bg-red-50 text-red-600",      barColor: "bg-red-400",    desc: "处理异常" },
  awaiting_confirmation: { label: "⏳ 待确认", color: "bg-amber-50 text-amber-700", barColor: "bg-amber-400", desc: "检测到重复实验，请确认处理方式" },
};

function elapsedSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function lookupLabel(list: readonly { value: string; label: string }[], val: string | null) {
  return list.find((i) => i.value === val)?.label ?? val ?? "-";
}

function notify(msg: string, type: "success" | "error" | "info") {
  // Dispatch a custom event that the ToastBar listens to
  window.dispatchEvent(new CustomEvent("kg-notify", { detail: { msg, type } }));
}

export default function DocList({ refreshKey }: { refreshKey: number }) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});
  const pageSize = 20;

  const loadDocs = useCallback(() => {
    listDocuments(page, pageSize).then((res) => {
      setDocs(res.items);
      setTotal(res.total);
    });
  }, [page]);

  useEffect(() => { loadDocs(); }, [page, refreshKey, loadDocs]);

  // Auto-refresh for docs that are still processing
  useEffect(() => {
    const hasProcessing = docs.some((d) => d.status === "parsing" || d.status === "extracting" || d.status === "uploaded");
    if (!hasProcessing) return;
    const timer = setTimeout(() => { loadDocs(); }, 2000);
    return () => clearTimeout(timer);
  }, [docs, page, loadDocs]);

  const handleConfirm = async (docId: string, action: "coexist" | "overwrite" | "cancel") => {
    if (confirming[docId]) return;
    setConfirming((prev) => ({ ...prev, [docId]: true }));
    try {
      await confirmIngest(docId, action);
      const labels: Record<string, string> = { coexist: "共存", overwrite: "覆盖", cancel: "取消" };
      notify(`已${labels[action]}处理，知识已写入图谱`, "success");
      loadDocs();
    } catch (err: any) {
      notify(err?.message || "操作失败，请重试", "error");
    } finally {
      setConfirming((prev) => ({ ...prev, [docId]: false }));
    }
  };

  const handleReprocess = async (docId: string) => {
    if (confirming[docId]) return;
    setConfirming((prev) => ({ ...prev, [docId]: true }));
    try {
      await reprocessDocument(docId);
      notify("已触发重新处理", "info");
      loadDocs();
    } catch (err: any) {
      notify(err?.message || "重试失败", "error");
    } finally {
      setConfirming((prev) => ({ ...prev, [docId]: false }));
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("确定删除此文档？将同时删除关联的图谱数据，不可恢复。")) return;
    try {
      await deleteDocument(docId);
      notify("文档已删除", "success");
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err: any) {
      notify(err?.message || "删除失败", "error");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <section className="glass-card rounded-xl p-6">
      <h2 className="mb-4 text-lg font-bold">我的文档</h2>

      {docs.length === 0 ? (
        <p className="py-10 text-center text-sm text-black">暂无文档，点击上方区域上传</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-700">
                <th className="py-2 pr-3 font-medium">文件名</th>
                <th className="py-2 pr-3 font-medium">类型</th>
                <th className="py-2 pr-3 font-medium">大小</th>
                <th className="py-2 pr-3 font-medium">实验类型</th>
                <th className="py-2 pr-3 font-medium">年份</th>
                <th className="py-2 pr-3 font-medium">状态</th>
                <th className="py-2 font-medium">上传时间</th>
                <th className="py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {docs.map((doc) => {
                  const s = STATUS_MAP[doc.status] || STATUS_MAP.uploaded;
                  const isExpanded = expanded === doc.id;
                  const isLoading = !!confirming[doc.id];
                  return (
                    <motion.tr
                      key={doc.id}
                      layout
                      className="glass-table-row cursor-pointer last:border-0"
                      onClick={() => setExpanded(isExpanded ? null : doc.id)}
                    >
                      <td className="py-2.5 pr-3 font-medium text-gray-800">{doc.title}</td>
                      <td className="py-2.5 pr-3 uppercase text-gray-700">{doc.file_type}</td>
                      <td className="py-2.5 pr-3 text-gray-700">{formatSize(doc.file_size)}</td>
                      <td className="py-2.5 pr-3 text-gray-700">
                        {lookupLabel(EXPERIMENT_TYPES, doc.experiment_type)}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-700">{doc.experiment_year ?? "-"}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit items-center gap-1.5 rounded-xl px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                            {(doc.status === "parsing" || doc.status === "extracting") && (
                              <span className="flex h-2 w-2">
                                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-current opacity-60" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                              </span>
                            )}
                            {s.label}
                          </span>
                          {(doc.status === "parsing" || doc.status === "extracting") && doc.created_at && (
                            <span className="text-[10px] text-black">
                              ⏱ {elapsedSince(doc.created_at)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 text-black">
                        {new Date(doc.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          {doc.status === "awaiting_confirmation" && (
                            <>
                              <button
                                disabled={isLoading}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleConfirm(doc.id, "coexist");
                                }}
                                className={`rounded px-2 py-0.5 text-xs transition ${
                                  isLoading ? "opacity-40 cursor-not-allowed" : "text-green-600 hover:bg-green-50"
                                }`}
                              >
                                {isLoading ? "处理中…" : "共存"}
                              </button>
                              <button
                                disabled={isLoading}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleConfirm(doc.id, "overwrite");
                                }}
                                className={`rounded px-2 py-0.5 text-xs transition ${
                                  isLoading ? "opacity-40 cursor-not-allowed" : "text-orange-600 hover:bg-orange-50"
                                }`}
                              >
                                {isLoading ? "处理中…" : "覆盖"}
                              </button>
                              <button
                                disabled={isLoading}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleConfirm(doc.id, "cancel");
                                }}
                                className={`rounded px-2 py-0.5 text-xs transition ${
                                  isLoading ? "opacity-40 cursor-not-allowed" : "text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                {isLoading ? "处理中…" : "取消"}
                              </button>
                            </>
                          )}
                          {(doc.status === "failed" || doc.status === "parsing" || doc.status === "uploaded") && (
                            <button
                              disabled={isLoading}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await handleReprocess(doc.id);
                              }}
                              className={`rounded px-2 py-0.5 text-xs transition ${
                                isLoading ? "opacity-40 cursor-not-allowed text-gray-500" : "text-brand-600 hover:bg-brand-50"
                              }`}
                            >
                              {isLoading ? "处理中…" : "重试"}
                            </button>
                          )}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await handleDelete(doc.id);
                            }}
                            className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded detail panel */}
      <AnimatePresence>
        {expanded && (() => {
          const doc = docs.find((d) => d.id === expanded);
          if (!doc || !doc.extraction_result) return null;
          const entities = doc.extraction_result.entities ?? [];
          const relations = doc.extraction_result.relations ?? [];
          const subjects = (doc.subjects ?? []).map(
            (s) => SUBJECT_OPTIONS.find((o) => o.value === s)?.label ?? s,
          );
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 glass-card rounded-lg p-4 text-sm"
            >
              <h3 className="mb-2 font-semibold">解析结果</h3>
              <div className="mb-2 flex gap-4 text-black">
                <span>实体数: <strong>{entities.length}</strong></span>
                <span>关系数: <strong>{relations.length}</strong></span>
                {subjects.length > 0 && <span>学科: {subjects.join("、")}</span>}
              </div>
              {entities.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-gray-700">
                        <th className="py-1 pr-2 text-left">类型</th>
                        <th className="py-1 pr-2 text-left">名称</th>
                        <th className="py-1 text-left">描述</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entities.map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="py-1 pr-2">
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                              {e.type}
                            </span>
                          </td>
                          <td className="py-1 pr-2 font-medium">{e.name}</td>
                          <td className="py-1 text-gray-700">{e.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {doc.duplicate_info && doc.duplicate_info.length > 0 && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                  <p className="mb-1 text-xs font-medium text-amber-700">重复实验检测：</p>
                  {doc.duplicate_info.map((dup: any, i: number) => (
                    <p key={i} className="text-xs text-amber-600">
                      「{dup.new_name}」与已有实验「{dup.existing_name}」相似度 {Math.round(dup.similarity * 100)}%
                    </p>
                  ))}
                </div>
              )}
              {doc.error_message && (
                <p className="mt-2 text-red-500">{doc.error_message}</p>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary px-3 py-1 text-sm disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-sm text-gray-700">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary px-3 py-1 text-sm disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
