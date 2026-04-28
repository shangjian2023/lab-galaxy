"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { confirmIngest } from "@/lib/api";

interface DuplicateWarning {
  new_name: string;
  existing_name: string;
  existing_id: string;
  similarity: number;
  is_exact: boolean;
}

interface Props {
  docId: string;
  filename: string;
  duplicates: DuplicateWarning[];
  onResolved: () => void;
}

export default function DuplicateDialog({ docId, filename, duplicates, onResolved }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAction = async (action: "overwrite" | "cancel" | "coexist") => {
    setLoading(true);
    setError("");
    try {
      await confirmIngest(docId, action);
      onResolved();
    } catch (e: any) {
      setError(e.message || "操作失败");
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="glass-modal-overlay fixed inset-0 z-50 flex items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="glass-card mx-4 w-full max-w-lg rounded-2xl p-6"
        >
          {/* Header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-lg">
              &#x26A0;
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">检测到相似实验</h3>
              <p className="text-xs text-gray-500">{filename}</p>
            </div>
          </div>

          {/* Duplicate list */}
          <div className="mb-5 max-h-48 space-y-2 overflow-y-auto">
            {duplicates.map((dup, i) => (
              <div
                key={i}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-800">
                    {dup.is_exact ? "完全匹配" : `相似度 ${(dup.similarity * 100).toFixed(0)}%`}
                  </span>
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    {dup.is_exact ? "重复" : "相似"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">新</span>
                  <span className="text-gray-700">{dup.new_name}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-gray-600">已有</span>
                  <span className="text-gray-500">{dup.existing_name}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={() => handleAction("overwrite")}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
            >
              <span>覆盖入库</span>
              <span className="text-xs opacity-75">替换已有的相似实验节点</span>
            </button>
            <button
              onClick={() => handleAction("coexist")}
              disabled={loading}
              className="btn-primary flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              <span>并存入库</span>
              <span className="text-xs opacity-75">保留新旧两份实验节点</span>
            </button>
            <button
              onClick={() => handleAction("cancel")}
              disabled={loading}
              className="btn-secondary flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              <span>取消入库</span>
              <span className="text-xs opacity-75">不写入图谱，仅保留抽取结果</span>
            </button>
          </div>

          {loading && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              处理中...
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
