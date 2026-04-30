"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { naturalLanguageQuery, type QueryResult } from "@/lib/api";
import { useQueryHistoryStore, type QueryHistoryItem } from "@/stores/query-history-store";

interface Props {
  onHighlightNodes: (nodeIds: string[]) => void;
  onSourceClick?: (documentId: string) => void;
}

export default function QueryPanel({ onHighlightNodes, onSourceClick }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const { items, addItem, clearItems, removeItem } = useQueryHistoryStore();
  const historyRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    if (overrideQuery) setQuery(overrideQuery);
    setLoading(true);
    const history = useQueryHistoryStore.getState().getHistoryMessages();
    try {
      const res = await naturalLanguageQuery(q, history);
      addItem(q, res);
      setQuery("");
      if (res.highlighted_nodes.length > 0) {
        onHighlightNodes(res.highlighted_nodes);
      }
    } catch {
      addItem(q, {
        answer: "查询失败，请稍后重试。",
        highlighted_nodes: [],
        source_documents: [],
        suggestions: [],
        related_queries: [],
        entities: [],
      });
      setQuery("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = 0;
    }
  }, [items.length]);

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSubmit()}
          placeholder="用自然语言提问，如「帮我找和隐私保护相关的实验」"
          className="flex-1 rounded-lg bg-white/50 px-4 py-2.5 text-sm ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"
        />
        <button
          onClick={() => handleSubmit()}
          disabled={loading || !query.trim()}
          className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          AI 查询
        </button>
      </div>

      {/* History list */}
      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">对话历史 ({items.length})</span>
          <button
            onClick={clearItems}
            className="text-xs text-gray-400 transition-colors hover:text-red-500"
          >
            清空历史
          </button>
        </div>
      )}

      {/* Results */}
      <div ref={historyRef} className="max-h-[50vh] space-y-3 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <HistoryItem
              key={item.id}
              item={item}
              onRetry={(q) => handleSubmit(q)}
              onRemove={removeItem}
              onSourceClick={onSourceClick}
            />
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white/40 p-5 ring-1 ring-white/60"
          >
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              正在思考...
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function HistoryItem({
  item,
  onRetry,
  onRemove,
  onSourceClick,
}: {
  item: QueryHistoryItem;
  onRetry: (q: string) => void;
  onRemove: (id: string) => void;
  onSourceClick?: (documentId: string) => void;
}) {
  const time = new Date(item.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl bg-white/40 p-5 ring-1 ring-white/60"
    >
      {/* Question header */}
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-600">问</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800">{item.question}</p>
          <p className="text-[10px] text-gray-400">{time}</p>
        </div>
        <button
          onClick={() => onRemove(item.id)}
          className="shrink-0 text-gray-300 transition-colors hover:text-red-400"
          title="删除此条"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Answer */}
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">答</span>
        <p className="flex-1 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{item.result.answer}</p>
      </div>

      {/* Source documents */}
      {item.result.source_documents.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">来源文档</p>
          <div className="flex flex-wrap gap-2">
            {item.result.source_documents.map((doc, i) => (
              <button
                key={i}
                onClick={() => onSourceClick?.(doc.id)}
                className="flex items-center gap-1 rounded-lg bg-amber-50/60 px-3 py-1.5 text-xs text-blue-700 ring-1 ring-amber-200/50 transition-all hover:bg-amber-100"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {doc.title}
                <span className="text-blue-400">{(doc.relevance * 100).toFixed(0)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Related entities */}
      {item.result.entities.length > 0 && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-medium text-gray-500">相关实体</p>
          <div className="flex flex-wrap gap-1.5">
            {item.result.entities.map((ent) => (
              <span
                key={ent.id}
                className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[10px] font-medium text-orange-700"
              >
                {ent.type}: {ent.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {item.result.suggestions.length > 0 && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-medium text-gray-500">探索建议</p>
          <div className="flex flex-wrap gap-2">
            {item.result.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onRetry(s)}
                className="rounded-full bg-white/40 px-3 py-1 text-xs text-gray-600 ring-1 ring-white/40 transition-all hover:bg-white/60"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Related queries */}
      {item.result.related_queries.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs font-medium text-gray-500">相关问题</p>
          <div className="space-y-1">
            {item.result.related_queries.map((q) => (
              <button
                key={q}
                onClick={() => onRetry(q)}
                className="block text-xs text-orange-600 hover:underline"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
