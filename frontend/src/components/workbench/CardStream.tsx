"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { FixedSizeList as List } from "react-window";
import { motion, AnimatePresence } from "framer-motion";
import type { CardItem } from "@/lib/api";
import { NODE_TYPE_COLORS } from "@/lib/constants";

interface Props {
  cards: CardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  loadMore: () => void;
  hasMore: boolean;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  uploaded: { label: "已上传", color: "bg-gray-100 text-gray-700" },
  parsing: { label: "解析中", color: "bg-yellow-100 text-yellow-700" },
  extracting: { label: "抽取中", color: "bg-blue-100 text-blue-700" },
  awaiting_confirmation: { label: "待确认", color: "bg-amber-100 text-amber-700" },
  completed: { label: "已完成", color: "bg-green-100 text-green-700" },
  failed: { label: "失败", color: "bg-red-100 text-red-600" },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function CardStream({ cards, selectedId, onSelect, onToggleFavorite, loadMore, hasMore }: Props) {
  const listRef = useRef<List>(null);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const card = cards[index];
    if (!card) return null;

    const s = STATUS_MAP[card.status] || STATUS_MAP.uploaded;
    const isSelected = selectedId === card.id;

    return (
      <div style={style} className="px-3 pb-3">
        <motion.div
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`cursor-pointer glass-card p-4 transition-shadow hover:shadow-md ${
            isSelected ? "border-orange-400 ring-2 ring-orange-100" : ""
          }`}
          onClick={() => onSelect(card.id)}
        >
          {/* Header */}
          <div className="mb-2 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-bold uppercase text-gray-600">
                {card.file_type}
              </span>
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-gray-800">{card.title}</h4>
                <div className="flex items-center gap-2 text-[10px] text-gray-600">
                  <span>{formatSize(card.file_size)}</span>
                  {card.experiment_year && <span>{card.experiment_year}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(card.id); }}
                className="rounded p-1 hover:bg-gray-100"
              >
                <svg className={`h-4 w-4 ${card.is_favorite ? "text-yellow-500" : "text-gray-500"}`}
                  fill={card.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${s.color}`}>{s.label}</span>
            </div>
          </div>

          {/* AI Summary */}
          {card.ai_summary && (
            <div className="mb-2 glass-warm rounded-lg px-3 py-2">
              <p className="text-xs text-blue-700">
                <span className="font-medium">AI 摘要:</span> {card.ai_summary}
              </p>
            </div>
          )}

          {/* Entity chips */}
          {card.entities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.entities.slice(0, 8).map((e) => (
                <span
                  key={e.id}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: NODE_TYPE_COLORS[e.type] || "#6b7280" }}
                >
                  {e.name}
                </span>
              ))}
              {card.entities.length > 8 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
                  +{card.entities.length - 8}
                </span>
              )}
            </div>
          )}
        </motion.div>
      </div>
    );
  }, [cards, selectedId, onToggleFavorite, onSelect]);

  // Infinite scroll
  const handleItemsRendered = useCallback(({ visibleStopIndex }: { visibleStopIndex: number }) => {
    if (hasMore && visibleStopIndex >= cards.length - 3) {
      loadMore();
    }
  }, [hasMore, cards.length, loadMore]);

  return (
    <List
      ref={listRef}
      height={700}
      itemCount={cards.length}
      itemSize={180}
      width="100%"
      onItemsRendered={handleItemsRendered}
      overscanCount={5}
    >
      {Row}
    </List>
  );
}
