"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { MatrixEntry } from "@/lib/api";

interface Props {
  data: MatrixEntry[];
  highlightedNodeId: string | null;
}

const TYPES = ["Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"];

function getColor(type: string): string {
  const map: Record<string, string> = {
    Experiment: "#3b82f6",
    Equipment: "#ef4444",
    Theory: "#8b5cf6",
    Consumable: "#f59e0b",
    Tool: "#10b981",
    Concept: "#6b7280",
  };
  return map[type] || "#6b7280";
}

function heatColor(count: number, max: number): string {
  if (max === 0) return "#f3f4f6";
  const t = count / max;
  if (t === 0) return "#f3f4f6";
  if (t < 0.25) return "#fed7aa";
  if (t < 0.5) return "#fdba74";
  if (t < 0.75) return "#fb923c";
  return "#f97316";
}

export default function MatrixView({ data, highlightedNodeId }: Props) {
  const { matrix, rowTypes, colTypes, maxCount } = useMemo(() => {
    const rows = new Set<string>();
    const cols = new Set<string>();
    let max = 0;

    const m: Record<string, Record<string, MatrixEntry[]>> = {};

    for (const entry of data) {
      rows.add(entry.row_type);
      cols.add(entry.col_type);
      if (!m[entry.row_type]) m[entry.row_type] = {};
      if (!m[entry.row_type][entry.col_type]) m[entry.row_type][entry.col_type] = [];
      m[entry.row_type][entry.col_type].push(entry);
      if (entry.count > max) max = entry.count;
    }

    const rowArr = TYPES.filter((t) => rows.has(t));
    const colArr = TYPES.filter((t) => cols.has(t));

    return { matrix: m, rowTypes: rowArr, colTypes: colArr, maxCount: max };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        暂无矩阵数据
      </div>
    );
  }

  const cellSize = Math.min(80, Math.max(50, 500 / Math.max(colTypes.length, 1)));

  // When a node is highlighted, emphasize its type's row/col
  const highlightRow = highlightedNodeId ? null : null; // Matrix is type-level, not node-level

  return (
    <div className="h-full overflow-auto rounded-xl border bg-white p-6">
      <div className="inline-block">
        {/* Column headers */}
        <div className="flex">
          <div style={{ width: 100 }} className="flex-shrink-0" />
          {colTypes.map((col) => (
            <div
              key={col}
              style={{ width: cellSize, minWidth: cellSize }}
              className="flex items-end justify-center pb-2 text-[10px] font-medium text-gray-500"
            >
              <span
                className="mb-1 inline-block rounded px-1.5 py-0.5 text-white"
                style={{ backgroundColor: getColor(col) }}
              >
                {col}
              </span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {rowTypes.map((row, ri) => (
          <div key={row} className="flex items-center">
            <div className="flex-shrink-0 pr-3 text-right" style={{ width: 100 }}>
              <span
                className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: getColor(row) }}
              >
                {row}
              </span>
            </div>
            {colTypes.map((col) => {
              const entries = matrix[row]?.[col] ?? [];
              const total = entries.reduce((s, e) => s + e.count, 0);

              return (
                <motion.div
                  key={`${row}-${col}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center rounded border border-gray-100"
                  style={{
                    width: cellSize,
                    minWidth: cellSize,
                    height: cellSize,
                    backgroundColor: heatColor(total, maxCount),
                  }}
                  title={entries.map((e) => `${e.relation}: ${e.count}`).join("\n")}
                >
                  {total > 0 && (
                    <span className="text-sm font-bold text-gray-700">{total}</span>
                  )}
                </motion.div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <span>关系数量:</span>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <div key={t} className="flex items-center gap-1">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: heatColor(t * maxCount, maxCount) }} />
              <span>{t === 0 ? "0" : t === 1 ? String(maxCount) : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
