"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ForceSettings } from "./GalaxyView";

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
  forceSettings: ForceSettings;
  onForceSettingsChange: (s: ForceSettings) => void;
  onTimelineAnimate: () => void;
  isAnimating?: boolean;
}

export default function GraphToolbar({
  viewType, onViewChange, nodeType, onNodeTypeChange,
  keyword, onKeywordChange, onSearch, nodeCount, edgeCount,
  liveCount, fromDate, toDate, onDateChange,
  forceSettings, onForceSettingsChange, onTimelineAnimate, isAnimating,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="space-y-3">
      {/* View switcher + stats + settings toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 glass-button rounded-xl p-1">
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

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{nodeCount} 节点</span>
          <span>{edgeCount} 关系</span>
          {liveCount !== undefined && liveCount > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {liveCount} 实时更新
            </span>
          )}

          {/* Settings gear button */}
          {viewType === "galaxy" && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-lg p-1.5 transition-colors ${showSettings ? "bg-orange-100 text-orange-700" : "text-gray-400 hover:text-gray-600"}`}
              title="力导向参数"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {/* Timeline animate button */}
          {viewType === "galaxy" && (
            <button
              onClick={onTimelineAnimate}
              disabled={isAnimating}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                isAnimating
                  ? "bg-orange-100 text-orange-700"
                  : "glass-button text-gray-500 hover:text-orange-700"
              }`}
            >
              {isAnimating ? "播放中..." : "时间轴动画"}
            </button>
          )}
        </div>
      </div>

      {/* Filters row */}
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
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                nodeType === t.value
                  ? "border-orange-400 bg-orange-50 text-orange-700"
                  : "glass-button text-gray-500"
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
                  className="glass-input rounded px-2 py-1 text-[10px]"
                  placeholder="起始日期"
                />
                <span className="text-[10px] text-gray-400">—</span>
                <input
                  type="date"
                  value={toDate || ""}
                  onChange={(e) => onDateChange(fromDate, e.target.value || undefined)}
                  className="glass-input rounded px-2 py-1 text-[10px]"
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
              className="glass-input w-40 rounded-lg px-3 py-1.5 text-xs"
            />
            <button
              onClick={onSearch}
              className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              搜索
            </button>
          </div>
        </motion.div>
      )}

      {/* Force settings panel */}
      <AnimatePresence>
        {showSettings && viewType === "galaxy" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-xl p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-16 shrink-0">排斥力</span>
                  <input
                    type="range"
                    min={-500}
                    max={-50}
                    step={10}
                    value={forceSettings.repel}
                    onChange={(e) => onForceSettingsChange({ ...forceSettings, repel: +e.target.value })}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="w-10 text-right text-gray-400">{forceSettings.repel}</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-16 shrink-0">连接距离</span>
                  <input
                    type="range"
                    min={30}
                    max={200}
                    step={5}
                    value={forceSettings.linkDistance}
                    onChange={(e) => onForceSettingsChange({ ...forceSettings, linkDistance: +e.target.value })}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="w-10 text-right text-gray-400">{forceSettings.linkDistance}px</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-16 shrink-0">节点大小</span>
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={forceSettings.nodeSize}
                    onChange={(e) => onForceSettingsChange({ ...forceSettings, nodeSize: +e.target.value })}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="w-10 text-right text-gray-400">{forceSettings.nodeSize.toFixed(1)}x</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-16 shrink-0">连接粗细</span>
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={forceSettings.linkWidth}
                    onChange={(e) => onForceSettingsChange({ ...forceSettings, linkWidth: +e.target.value })}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="w-10 text-right text-gray-400">{forceSettings.linkWidth.toFixed(1)}x</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
