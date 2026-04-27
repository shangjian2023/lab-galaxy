"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { naturalLanguageQuery, type QueryResult } from "@/lib/api";

interface Props {
  onHighlightNodes: (nodeIds: string[]) => void;
  onSourceClick?: (documentId: string) => void;
}

export default function QueryPanel({ onHighlightNodes, onSourceClick }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [open, setOpen] = useState(false);

  const handleSubmit = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await naturalLanguageQuery(query);
      setResult(res);
      setOpen(true);
      if (res.highlighted_nodes.length > 0) {
        onHighlightNodes(res.highlighted_nodes);
      }
    } catch {
      setResult({
        answer: "查询失败，请稍后重试。",
        highlighted_nodes: [],
        source_documents: [],
        suggestions: [],
        related_queries: [],
        entities: [],
      });
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="用自然语言提问，如「帮我找和隐私保护相关的实验」"
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Results */}
      <AnimatePresence>
        {open && result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-bold text-gray-800">AI 回答</h3>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Answer */}
              <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{result.answer}</p>

              {/* Source documents */}
              {result.source_documents.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">来源文档</p>
                  <div className="flex flex-wrap gap-2">
                    {result.source_documents.map((doc, i) => (
                      <button
                        key={i}
                        onClick={() => onSourceClick?.(doc.id)}
                        className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
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

              {/* Highlighted entities */}
              {result.entities.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">相关实体</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.entities.map((ent) => (
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
              {result.suggestions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">探索建议</p>
                  <div className="flex flex-wrap gap-2">
                    {result.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => { setQuery(s); }}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Related queries */}
              {result.related_queries.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">相关问题</p>
                  <div className="space-y-1">
                    {result.related_queries.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => { setQuery(q); }}
                        className="block text-xs text-orange-600 hover:underline"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
