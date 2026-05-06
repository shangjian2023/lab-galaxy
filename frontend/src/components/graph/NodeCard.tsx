"use client";

import { motion, AnimatePresence } from "framer-motion";

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
}

const TYPE_LABELS: Record<string, string> = {
  Experiment: "实验",
  Equipment: "设备",
  Theory: "理论",
  Consumable: "耗材",
  Tool: "工具",
  Concept: "概念",
};

export default function NodeCard({ node, onClose, onJumpToWorkbench }: Props) {
  return (
    <AnimatePresence>
      {node && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="glass-dark absolute right-4 top-4 z-10 w-72 overflow-hidden rounded-2xl"
        >
          <div className="p-4">
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
                <h3 className="font-bold text-white">{node.name || node.id.slice(0, 8)}</h3>
              </div>
              <button onClick={onClose} className="text-gray-900 hover:text-gray-600">
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
              <p className="mb-3 text-sm leading-relaxed text-gray-900">{node.summary}</p>
            )}

            {/* Meta */}
            <div className="space-y-1 text-xs text-gray-900">
              <p>ID: {node.id.slice(0, 12)}...</p>
              {node.document_id && (
                <div className="flex items-center justify-between">
                  <span>关联文档</span>
                  {onJumpToWorkbench && (
                    <button
                      onClick={() => onJumpToWorkbench(node.document_id!)}
                      className="text-orange-400 hover:text-orange-300 hover:underline"
                    >
                      在工作台查看 &rarr;
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
