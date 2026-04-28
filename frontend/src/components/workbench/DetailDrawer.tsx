"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CardItem } from "@/lib/api";
import { deleteDocument } from "@/lib/api";
import { NODE_TYPE_COLORS } from "@/lib/constants";

interface Props {
  card: CardItem | null;
  onClose: () => void;
  onJumpToGraph: (nodeId: string) => void;
  onDelete?: (id: string) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const TYPE_LABELS: Record<string, string> = {
  Experiment: "实验",
  Equipment: "设备",
  Theory: "理论",
  Consumable: "耗材",
  Tool: "工具",
  Concept: "概念",
};

export default function DetailDrawer({ card, onClose, onJumpToGraph, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!card || !onDelete) return;
    if (!confirm(`确定删除「${card.title}」？此操作不可恢复。`)) return;
    setDeleting(true);
    try {
      await deleteDocument(card.id);
      onDelete(card.id);
      onClose();
    } catch {
      alert("删除失败，请重试");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {card && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 250 }}
          className="flex h-full w-80 flex-shrink-0 flex-col border-l border-white/60 bg-white/45 shadow-lg backdrop-blur-[20px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-bold text-gray-800 truncate">{card.title}</h3>
            <div className="flex items-center gap-1">
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="删除文档"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <button onClick={onClose} className="btn-secondary rounded p-1 text-gray-400 hover:text-gray-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Meta label="文件类型" value={card.file_type.toUpperCase()} />
              <Meta label="文件大小" value={formatSize(card.file_size)} />
              <Meta label="实验年份" value={card.experiment_year ? String(card.experiment_year) : "-"} />
              <Meta label="实验类型" value={card.experiment_type || "-"} />
              <Meta label="隐私" value={card.privacy} />
              <Meta label="状态" value={card.status} />
            </div>

            {/* Subjects */}
            {card.subjects && card.subjects.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-400">学科领域</h4>
                <div className="flex flex-wrap gap-1">
                  {card.subjects.map((s) => (
                    <span key={s} className="glass-button rounded-full px-2 py-0.5 text-xs text-gray-600">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {card.ai_summary && (
              <div className="glass-warm rounded-lg p-3">
                <h4 className="mb-1 text-xs font-medium text-blue-600">AI 解析摘要</h4>
                <p className="text-xs leading-relaxed text-blue-800">{card.ai_summary}</p>
              </div>
            )}

            {/* Entities */}
            {card.entities.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium text-gray-400">
                  提取实体 ({card.entities.length})
                </h4>
                <div className="space-y-2">
                  {card.entities.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start gap-2 glass-button rounded-lg p-2"
                    >
                      <span
                        className="mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: NODE_TYPE_COLORS[e.type] || "#6b7280" }}
                      >
                        {TYPE_LABELS[e.type] || e.type}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800">{e.name}</p>
                        {e.summary && (
                          <p className="mt-0.5 text-[10px] text-gray-500 line-clamp-2">{e.summary}</p>
                        )}
                      </div>
                      <button
                        onClick={() => onJumpToGraph(e.id)}
                        className="flex-shrink-0 text-[10px] text-brand-600 hover:underline"
                      >
                        图谱 &rarr;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Relations */}
            {card.relations.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium text-gray-400">
                  关系 ({card.relations.length})
                </h4>
                <div className="space-y-1">
                  {card.relations.slice(0, 20).map((r, i) => {
                    const srcEntity = card.entities.find((e) => e.id === r.source_id);
                    const tgtEntity = card.entities.find((e) => e.id === r.target_id);
                    return (
                      <div key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span className="font-medium">{srcEntity?.name || r.source_id.slice(0, 6)}</span>
                        <span className="rounded bg-gray-200 px-1 text-gray-600">{r.type}</span>
                        <span className="font-medium">{tgtEntity?.name || r.target_id.slice(0, 6)}</span>
                        <span className="text-gray-400">({(r.confidence * 100).toFixed(0)}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="font-medium text-gray-700">{value}</p>
    </div>
  );
}
