"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { naturalLanguageQuery, type QueryResult } from "@/lib/api";
import { useQueryHistoryStore, type QueryHistoryItem } from "@/stores/query-history-store";
import MarkdownRenderer from "./MarkdownRenderer";

interface Props {
  onHighlightNodes: (nodeIds: string[]) => void;
  onSourceClick?: (documentId: string) => void;
}

type StageKey = "searching" | "expanding" | "synthesizing" | "finishing";

interface StageDef {
  key: StageKey;
  label: string;
  icon: string;
}

const STAGES: StageDef[] = [
  { key: "searching", label: "正在向量检索相关知识…", icon: "search" },
  { key: "expanding", label: "正在扩展知识图谱关联…", icon: "graph" },
  { key: "synthesizing", label: "正在 AI 综合分析…", icon: "brain" },
  { key: "finishing", label: "正在整理回答…", icon: "doc" },
];

const STAGE_DELAYS = [1200, 2800, 5000]; // ms to advance to next stage

function StageIcon({ icon, active, done }: { icon: string; active: boolean; done: boolean }) {
  if (done) {
    return (
      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (!active) {
    return <span className="h-4 w-4 rounded-full border border-gray-300" />;
  }
  switch (icon) {
    case "search":
      return (
        <svg className="h-4 w-4 animate-pulse text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case "graph":
      return (
        <svg className="h-4 w-4 animate-pulse text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="6" r="2" fill="currentColor" />
          <circle cx="6" cy="18" r="2" fill="currentColor" />
          <circle cx="18" cy="18" r="2" fill="currentColor" />
          <path strokeLinecap="round" strokeWidth={1.5} d="M11 8L7.5 16.5M13 8l3 7.5" />
        </svg>
      );
    case "brain":
      return (
        <svg className="h-4 w-4 animate-pulse text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "doc":
      return (
        <svg className="h-4 w-4 animate-pulse text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    default:
      return <span className="h-4 w-4" />;
  }
}

export default function QueryPanel({ onHighlightNodes, onSourceClick }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [quota, setQuota] = useState<{ query: { remaining: number; limit: number; unlimited: boolean }; upload: { remaining: number; limit: number; unlimited: boolean } } | null>(null);
  const { items, addItem, clearItems, removeItem } = useQueryHistoryStore();
  const historyRef = useRef<HTMLDivElement>(null);
  const stageTimerRefs = useRef<NodeJS.Timeout[]>([]);

  // Fetch quota on mount
  useEffect(() => {
    fetchQuota();
  }, []);

  const fetchQuota = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/users/me/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.quota) setQuota(data.quota);
      }
    } catch {
      // ignore - user might not be logged in
    }
  }, []);

  // Scroll to loading animation when query starts
  useEffect(() => {
    if (loading && historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [loading]);

  // Advance stages while loading
  useEffect(() => {
    if (!loading) {
      setCurrentStage(0);
      return;
    }
    setCurrentStage(0);
    const timers = STAGE_DELAYS.map((delay, i) =>
      setTimeout(() => setCurrentStage(i + 1), delay)
    );
    stageTimerRefs.current = timers;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [loading]);

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
      fetchQuota(); // refresh quota after query
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

  const remainingText = quota
    ? quota.query.unlimited
      ? "∞"
      : `${quota.query.remaining}/${quota.query.limit}`
    : null;
  const quotaExhausted = quota ? (!quota.query.unlimited && quota.query.remaining <= 0) : false;

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && !quotaExhausted && handleSubmit()}
            placeholder={quotaExhausted ? "今日查询次数已用完" : "用自然语言提问，如「帮我找和隐私保护相关的实验」"}
            disabled={quotaExhausted}
            className="w-full rounded-lg bg-white/50 px-4 py-2.5 pr-14 text-sm ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {remainingText && (
            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium ${quota?.query.unlimited ? "text-emerald-600" : (quota?.query.remaining ?? 0) <= 3 ? "text-red-500" : "text-gray-700"}`}>
              剩余 {remainingText} 次
            </span>
          )}
        </div>
        <button
          onClick={() => handleSubmit()}
          disabled={loading || !query.trim() || quotaExhausted}
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

      {/* Loading animation — right below input */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-white/40 p-4 ring-1 ring-white/60">
              <div className="space-y-2">
                {STAGES.map((stage, i) => (
                  <div
                    key={stage.key}
                    className={`flex items-center gap-3 transition-all duration-300 ${
                      i > currentStage ? "opacity-30" : ""
                    }`}
                  >
                    <StageIcon
                      icon={stage.icon}
                      active={i === currentStage}
                      done={i < currentStage}
                    />
                    <span
                      className={`text-xs transition-colors ${
                        i === currentStage ? "font-medium text-gray-700" : "text-black"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History list */}
      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">对话历史 ({items.length})</span>
          <button
            onClick={clearItems}
            className="text-xs text-black transition-colors hover:text-red-500"
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
          <p className="text-[10px] text-black">{time}</p>
        </div>
        <button
          onClick={() => onRemove(item.id)}
          className="shrink-0 text-gray-800 transition-colors hover:text-red-400"
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
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-gray-700">
          <MarkdownRenderer content={item.result.answer} />
        </div>
      </div>

      {/* Source documents */}
      {item.result.source_documents.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-700">来源文档</p>
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
          <p className="mb-2 text-xs font-medium text-gray-700">相关实体</p>
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
          <p className="mb-2 text-xs font-medium text-gray-700">探索建议</p>
          <div className="flex flex-wrap gap-2">
            {item.result.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onRetry(s)}
                className="rounded-full bg-white/40 px-3 py-1 text-xs text-black ring-1 ring-white/40 transition-all hover:bg-white/60"
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
          <p className="mb-1 text-xs font-medium text-gray-700">相关问题</p>
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
