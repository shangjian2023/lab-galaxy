"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DocTreeNode } from "@/lib/api";

interface Props {
  tree: DocTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterFavorites: boolean;
  onFilterFavorites: (v: boolean) => void;
}

const STATUS_DOT: Record<string, string> = {
  uploaded: "bg-gray-300",
  parsing: "bg-yellow-400 animate-pulse",
  extracting: "bg-blue-400 animate-pulse",
  completed: "bg-green-400",
  failed: "bg-red-400",
};

export default function DocTree({ tree, selectedId, onSelect, filterFavorites, onFilterFavorites }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[rgba(139,109,80,0.08)] px-3 py-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-black">文档树</h3>
      </div>

      {/* Favorite filter */}
      <div className="border-b border-[rgba(139,109,80,0.08)] px-3 py-2">
        <button
          onClick={() => onFilterFavorites(!filterFavorites)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
            filterFavorites ? "bg-yellow-50 text-yellow-700" : "glass-button text-gray-700"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill={filterFavorites ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          仅收藏
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2 text-sm">
        {Object.keys(tree).length === 0 && (
          <p className="py-6 text-center text-xs text-black">暂无文档</p>
        )}
        {Object.entries(tree).map(([year, types]) => (
          <div key={year} className="mb-1">
            <button
              onClick={() => toggle(`y-${year}`)}
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-xs font-bold text-black hover:bg-[rgba(255,248,240,0.5)]"
            >
              <svg className={`h-3 w-3 transition-transform ${expanded.has(`y-${year}`) ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {year}
            </button>

            <AnimatePresence>
              {expanded.has(`y-${year}`) && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  {Object.entries(types).map(([expType, docs]) => (
                    <div key={`${year}-${expType}`} className="ml-2">
                      <button
                        onClick={() => toggle(`t-${year}-${expType}`)}
                        className="flex w-full items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-700 hover:bg-[rgba(255,248,240,0.5)]"
                      >
                        <svg className={`h-2.5 w-2.5 transition-transform ${expanded.has(`t-${year}-${expType}`) ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {expType}
                      </button>

                      <AnimatePresence>
                        {expanded.has(`t-${year}-${expType}`) && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                            {docs.map((doc) => (
                              <button
                                key={doc.id}
                                onClick={() => onSelect(doc.id)}
                                className={`flex w-full items-center gap-2 rounded px-3 py-1 text-xs transition-colors ${
                                  selectedId === doc.id ? "bg-orange-50 text-orange-700 font-medium" : "text-gray-700 hover:bg-[rgba(255,248,240,0.5)]"
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[doc.status] || "bg-gray-300"}`} />
                                <span className="truncate">{doc.title}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
