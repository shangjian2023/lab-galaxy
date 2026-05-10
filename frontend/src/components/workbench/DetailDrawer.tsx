"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CardItem } from "@/lib/api";
import { deleteDocument, downloadDocument, getDocumentPreviewBlob } from "@/lib/api";
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
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Clean up preview URL when modal closes
  useEffect(() => {
    if (!showPreview && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [showPreview, previewUrl]);

  const openPreview = async () => {
    if (!card) return;
    setPreviewLoading(true);
    setShowPreview(true);
    try {
      const url = await getDocumentPreviewBlob(card.id);
      setPreviewUrl(url);
    } catch {
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setShowPreview(false);
  };

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

  const handleDownload = async () => {
    if (!card) return;
    setDownloading(true);
    try {
      await downloadDocument(card.id, card.title);
    } catch {
      alert("下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
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
                  className="rounded p-1 text-black transition-colors hover:bg-red-50 hover:text-red-500"
                  title="删除文档"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <button onClick={onClose} className="btn-secondary rounded p-1 text-black hover:text-black">
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

            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="glass-button w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-gray-700 transition-colors disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloading ? "下载中..." : "下载原始文件"}
            </button>

            {/* Preview button (click to open modal) */}
            {card.file_type === "pdf" && (
              <button
                onClick={openPreview}
                disabled={previewLoading}
                className="glass-button w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-brand-600 transition-colors disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                在线预览
              </button>
            )}

            {/* Subjects */}
            {card.subjects && card.subjects.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-medium text-black">学科领域</h4>
                <div className="flex flex-wrap gap-1">
                  {card.subjects.map((s) => (
                    <span key={s} className="glass-button rounded-full px-2 py-0.5 text-xs text-black">{s}</span>
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
                <h4 className="mb-2 text-xs font-medium text-black">
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
                          <p className="mt-0.5 text-[10px] text-gray-700 line-clamp-2">{e.summary}</p>
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
                <h4 className="mb-2 text-xs font-medium text-black">
                  关系 ({card.relations.length})
                </h4>
                <div className="space-y-1">
                  {card.relations.slice(0, 20).map((r, i) => {
                    const srcEntity = card.entities.find((e) => e.id === r.source_id);
                    const tgtEntity = card.entities.find((e) => e.id === r.target_id);
                    return (
                      <div key={i} className="flex items-center gap-1 text-[10px] text-gray-700">
                        <span className="font-medium">{srcEntity?.name || r.source_id.slice(0, 6)}</span>
                        <span className="rounded bg-gray-200 px-1 text-black">{r.type}</span>
                        <span className="font-medium">{tgtEntity?.name || r.target_id.slice(0, 6)}</span>
                        <span className="text-black">({(r.confidence * 100).toFixed(0)}%)</span>
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

    {/* Fullscreen PDF preview modal */}
    <AnimatePresence>
      {showPreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col bg-black/70 backdrop-blur-sm"
          onClick={closePreview}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative mx-auto my-6 flex h-[calc(100vh-48px)] w-[calc(100vw-48px)] max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
              <h3 className="text-sm font-bold text-black">
                {card?.title || "文档预览"}
              </h3>
              <button
                onClick={closePreview}
                className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-black"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* PDF iframe */}
            <div className="relative flex-1">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white">
                  <div className="text-center">
                    <svg className="mx-auto h-8 w-8 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="mt-2 text-sm text-black">加载中...</p>
                  </div>
                </div>
              )}
              {previewUrl && (
                <iframe
                  src={previewUrl}
                  className="h-full w-full"
                  title="文档预览"
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-black">{label}</p>
      <p className="font-medium text-gray-700">{value}</p>
    </div>
  );
}
