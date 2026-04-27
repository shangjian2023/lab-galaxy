"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { suggestRelations } from "@/lib/api";

interface Props {
  node: {
    id: string;
    name: string;
    type: string;
    summary: string;
    color: string;
    document_id?: string | null;
    size?: number;
  } | null;
  onClose: () => void;
  onJumpToWorkbench?: (documentId: string) => void;
  onAcceptSuggestion?: (suggestion: { source_id: string; target_id: string; type: string; confidence: number }) => void;
}

const TYPE_LABELS: Record<string, string> = {
  Experiment: "实验",
  Equipment: "设备",
  Theory: "理论",
  Consumable: "耗材",
  Tool: "工具",
  Concept: "概念",
};

interface Suggestion {
  source_id: string;
  target_id: string;
  target_name?: string;
  type: string;
  confidence: number;
  reason: string;
}

export default function NodeCard({ node, onClose, onJumpToWorkbench, onAcceptSuggestion }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSuggest = async () => {
    if (!node) return;
    setLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const res = await suggestRelations(node.id);
      setSuggestions(res.suggestions);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute right-4 top-4 z-10 w-72 rounded-xl border bg-white p-4 shadow-lg"
        >
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div
                className="rounded-full"
                style={{
                  backgroundColor: node.color,
                  width: Math.max(12, Math.min((node.size || 20) * 0.4, 28)),
                  height: Math.max(12, Math.min((node.size || 20) * 0.4, 28)),
                }}
              />
              <h3 className="font-bold text-gray-800">{node.name || node.id.slice(0, 8)}</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Type badge */}
          <div className="mb-3">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: node.color }}
            >
              {TYPE_LABELS[node.type] || node.type}
            </span>
          </div>

          {/* Summary */}
          {node.summary && (
            <p className="mb-3 text-sm leading-relaxed text-gray-600">{node.summary}</p>
          )}

          {/* Meta */}
          <div className="space-y-1 text-xs text-gray-400 mb-3">
            <p>ID: {node.id.slice(0, 12)}...</p>
            {node.document_id && (
              <div className="flex items-center justify-between">
                <span>关联文档</span>
                {onJumpToWorkbench && (
                  <button
                    onClick={() => onJumpToWorkbench(node.document_id!)}
                    className="text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    在工作台查看 &rarr;
                  </button>
                )}
              </div>
            )}
          </div>

          {/* AI Suggestions */}
          <div className="border-t pt-3">
            <button
              onClick={handleSuggest}
              disabled={loadingSuggestions}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
            >
              {loadingSuggestions ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              AI 关系建议
            </button>

            <AnimatePresence>
              {showSuggestions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-2 overflow-hidden"
                >
                  {suggestions.length === 0 && !loadingSuggestions && (
                    <p className="text-xs text-gray-400 py-2">暂无建议</p>
                  )}
                  {suggestions.map((s, i) => (
                    <div key={i} className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-purple-600">{s.type}</span>
                        <span className="text-[10px] text-purple-400">{(s.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mb-1.5">
                        {s.target_name || s.target_id.slice(0, 8)}: {s.reason}
                      </p>
                      {onAcceptSuggestion && (
                        <button
                          onClick={() => onAcceptSuggestion(s)}
                          className="text-[10px] font-medium text-purple-700 hover:text-purple-800"
                        >
                          采纳建议
                        </button>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
