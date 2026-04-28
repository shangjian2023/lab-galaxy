"use client";

import { motion } from "framer-motion";
import type { InsightEvent } from "./InsightOverlay";

interface Props {
  insight: InsightEvent;
  onView: (insight: InsightEvent) => void;
  onDismiss: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  shared_equipment: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  shared_consumable: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  shared_theory: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  similar_path: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  knowledge_chain: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
};

export default function InsightCard({ insight, onView, onDismiss }: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="glass-warm rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d={TYPE_ICONS[insight.type] || TYPE_ICONS.shared_equipment} />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-orange-900">{insight.title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-orange-700">{insight.description}</p>

          {/* Experiments */}
          {insight.experiments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {insight.experiments.slice(0, 4).map((exp) => (
                <span key={exp.id} className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                  {exp.name || exp.id.slice(0, 6)}
                </span>
              ))}
              {insight.experiments.length > 4 && (
                <span className="text-[10px] text-orange-500">+{insight.experiments.length - 4}</span>
              )}
            </div>
          )}

          {/* Significance bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-orange-200">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${insight.significance * 100}%` }} />
            </div>
            <span className="text-[10px] text-orange-500">{(insight.significance * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 flex-col gap-1">
          <button
            onClick={() => onView(insight)}
            className="btn-primary rounded-lg px-3 py-1 text-[10px] font-medium"
          >
            查看
          </button>
          <button
            onClick={() => onDismiss(insight.type)}
            className="rounded-lg px-3 py-1 text-[10px] text-orange-400 hover:bg-orange-100"
          >
            忽略
          </button>
        </div>
      </div>
    </motion.div>
  );
}
