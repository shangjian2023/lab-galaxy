"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { TimelineEntry } from "@/lib/api";

interface Props {
  data: TimelineEntry[];
  highlightedNodeId: string | null;
  onNodeClick: (node: { id: string; name: string; type: string; summary: string; color: string }) => void;
}

export default function TimelineView({ data, highlightedNodeId, onNodeClick }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<number | string, TimelineEntry[]>();
    for (const entry of data) {
      const key = entry.year ?? "未知";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "未知") return 1;
      if (b === "未知") return -1;
      return (b as number) - (a as number);
    });
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        暂无时间线数据
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-xl border bg-white p-6">
      <div className="relative ml-4 border-l-2 border-gray-200 pl-8">
        {grouped.map(([year, entries]) => (
          <div key={year} className="relative mb-8">
            <div className="absolute -left-[41px] flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
              {year === "未知" ? "?" : String(year).slice(2)}
            </div>
            <h3 className="mb-3 text-lg font-bold text-gray-800">{year}</h3>
            <div className="flex flex-wrap gap-2">
              {entries.map((entry, i) => {
                const isHighlighted = highlightedNodeId === entry.node.id;
                return (
                  <motion.button
                    key={`${entry.node.id}-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      scale: isHighlighted ? 1.15 : 1,
                    }}
                    transition={{ scale: { duration: 0.3 } }}
                    onClick={() => onNodeClick(entry.node)}
                    className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all hover:shadow-md ${
                      isHighlighted
                        ? "border-purple-400 bg-purple-50 shadow-md ring-2 ring-purple-300"
                        : "border-gray-200"
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: entry.node.color }}
                    />
                    <span className={`font-medium ${isHighlighted ? "text-purple-700" : ""}`}>
                      {entry.node.name || entry.node.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-gray-400">{entry.node.type}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
