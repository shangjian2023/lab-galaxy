"use client";

import { motion } from "framer-motion";

const TYPES = [
  { value: "", label: "全部", color: "#6b7280" },
  { value: "Experiment", label: "实验", color: "#3b82f6" },
  { value: "Equipment", label: "设备", color: "#ef4444" },
  { value: "Theory", label: "理论", color: "#8b5cf6" },
  { value: "Consumable", label: "耗材", color: "#f59e0b" },
  { value: "Tool", label: "工具", color: "#10b981" },
];

const VIEWS = [
  { value: "galaxy", label: "星系视图", icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" },
  { value: "timeline", label: "时间线", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { value: "matrix", label: "矩阵视图", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" },
] as const;

export type ViewMode = "galaxy" | "timeline" | "matrix";

interface Props {
  viewType: ViewMode;
  onViewChange: (v: ViewMode) => void;
  nodeType: string;
  onNodeTypeChange: (t: string) => void;
  keyword: string;
  onKeywordChange: (k: string) => void;
  onSearch: () => void;
  nodeCount: number;
  edgeCount: number;
  liveCount?: number;
  fromDate?: string;
  toDate?: string;
  onDateChange?: (from?: string, to?: string) => void;
}

export default function GraphToolbar({
  viewType, onViewChange, nodeType, onNodeTypeChange,
  keyword, onKeywordChange, onSearch, nodeCount, edgeCount,
  liveCount, fromDate, toDate, onDateChange,
}: Props) {
  return (
    <div className="space-y-3">
      {/* View switcher */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => onViewChange(v.value as ViewMode)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                viewType === v.value
                  ? "bg-white text-orange-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={v.icon} />
              </svg>
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 text-xs text-gray-400">
          <span>{nodeCount} 节点</span>
          <span>{edgeCount} 关系</span>
          {liveCount !== undefined && liveCount > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {liveCount} 实时更新
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      {viewType === "galaxy" && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2"
        >
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => onNodeTypeChange(t.value)}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                nodeType === t.value
                  ? "border-orange-400 bg-orange-50 text-orange-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
              {t.label}
            </button>
          ))}

          {/* Search */}
          <div className="ml-auto flex items-center gap-2">
            {/* Temporal filter */}
            {onDateChange && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={fromDate || ""}
                  onChange={(e) => onDateChange(e.target.value || undefined, toDate)}
                  className="rounded border border-gray-200 px-2 py-1 text-[10px] focus:border-orange-400 focus:outline-none"
                  placeholder="起始日期"
                />
                <span className="text-[10px] text-gray-400">—</span>
                <input
                  type="date"
                  value={toDate || ""}
                  onChange={(e) => onDateChange(fromDate, e.target.value || undefined)}
                  className="rounded border border-gray-200 px-2 py-1 text-[10px] focus:border-orange-400 focus:outline-none"
                  placeholder="结束日期"
                />
              </div>
            )}
            <input
              type="text"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="搜索节点..."
              className="w-40 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-orange-400 focus:outline-none"
            />
            <button
              onClick={onSearch}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
            >
              搜索
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
