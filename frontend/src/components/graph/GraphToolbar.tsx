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
export type GraphScope = "public" | "team" | "private";

const SCOPES: { value: GraphScope; label: string; icon: string }[] = [
  { value: "public", label: "公共图谱", icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064" },
  { value: "team", label: "团队图谱", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
  { value: "private", label: "个人知识库", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
];

interface Props {
  viewType: ViewMode;
  onViewChange: (v: ViewMode) => void;
  graphScope?: GraphScope;
  onScopeChange?: (s: GraphScope) => void;
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
  onCleanupOrphans?: () => void;
  onManageTeams?: () => void;
}

export default function GraphToolbar({
  viewType, onViewChange, graphScope = "public", onScopeChange,
  nodeType, onNodeTypeChange,
  keyword, onKeywordChange, onSearch, nodeCount, edgeCount,
  liveCount, fromDate, toDate, onDateChange,
  forceSettings, onForceSettingsChange, onTimelineAnimate, isAnimating,
  onCleanupOrphans, onManageTeams,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);

  const gearCls = showSettings
    ? "bg-orange-100 text-orange-700 shadow-sm ring-1 ring-orange-200/50"
    : "text-gray-400 hover:bg-white/40 hover:text-gray-600";

  const timelineCls = isAnimating
    ? "bg-orange-100 text-orange-700 shadow-sm ring-1 ring-orange-200/50"
    : "bg-white/40 text-gray-500 hover:bg-white/60 hover:text-orange-700 ring-1 ring-white/40";

  return (
    <div className="space-y-3">
      {/* Scope + View switcher + stats + settings */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Scope buttons */}
          <div className="flex gap-0.5 rounded-xl bg-white/40 p-1 shadow-sm ring-1 ring-white/60">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                onClick={() => onScopeChange?.(s.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  graphScope === s.value
                    ? "bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700 shadow-md ring-1 ring-orange-300/40"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                </svg>
                {s.label}
                {s.value === "team" && onManageTeams && (
                  <svg
                    className="h-3 w-3 ml-0.5 opacity-60"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    onClick={(e) => { e.stopPropagation(); onManageTeams(); }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* View switcher */}
          <div className="flex gap-1 rounded-xl bg-white/40 p-1 shadow-sm ring-1 ring-white/60">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                onClick={() => onViewChange(v.value as ViewMode)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  viewType === v.value
                    ? "bg-white text-orange-700 shadow-md ring-1 ring-orange-200/50"
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
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="rounded-full bg-white/50 px-2.5 py-0.5 ring-1 ring-white/40">{nodeCount} 节点</span>
          <span className="rounded-full bg-white/50 px-2.5 py-0.5 ring-1 ring-white/40">{edgeCount} 关系</span>
          {liveCount !== undefined && liveCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-green-600 ring-1 ring-green-200/40">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {liveCount} 更新
            </span>
          )}

          {onCleanupOrphans && (
            <button
              onClick={onCleanupOrphans}
              className="rounded-lg px-2 py-0.5 text-[10px] font-medium text-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
              title="清理无关系的孤立节点"
            >
              清理孤立节点
            </button>
          )}

          {/* Settings gear button */}
          {viewType === "galaxy" && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-lg p-1.5 transition-all ${gearCls}`}
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
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${timelineCls}`}
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
          className="flex flex-wrap items-center gap-2 rounded-xl bg-white/30 px-3 py-2.5 ring-1 ring-white/50"
        >
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => onNodeTypeChange(t.value)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                nodeType === t.value
                  ? "border border-orange-400 bg-orange-50 text-orange-700 shadow-sm"
                  : "bg-white/40 text-gray-500 hover:bg-white/60 ring-1 ring-white/40"
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
                  className="rounded-lg bg-white/50 px-2 py-1 text-[10px] ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
                  placeholder="起始日期"
                />
                <span className="text-[10px] text-gray-400">—</span>
                <input
                  type="date"
                  value={toDate || ""}
                  onChange={(e) => onDateChange(fromDate, e.target.value || undefined)}
                  className="rounded-lg bg-white/50 px-2 py-1 text-[10px] ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
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
              className="w-40 rounded-lg bg-white/50 px-3 py-1.5 text-xs ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
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
            <div className="rounded-xl bg-white/30 p-4 ring-1 ring-white/50">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-16 shrink-0">排斥力</span>
                  <input
                    type="range"
                    min={-2000}
                    max={-10}
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
                    min={20}
                    max={500}
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
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={forceSettings.nodeSize}
                    onChange={(e) => onForceSettingsChange({ ...forceSettings, nodeSize: +e.target.value })}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="w-10 text-right text-gray-400">{forceSettings.nodeSize.toFixed(1)}x</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-16 shrink-0">实验节点</span>
                  <input
                    type="range"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={forceSettings.experimentSize}
                    onChange={(e) => onForceSettingsChange({ ...forceSettings, experimentSize: +e.target.value })}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="w-10 text-right text-gray-400">{forceSettings.experimentSize.toFixed(1)}x</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-16 shrink-0">连接粗细</span>
                  <input
                    type="range"
                    min={0.2}
                    max={5}
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
