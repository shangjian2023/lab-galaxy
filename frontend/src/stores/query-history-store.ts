import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, QueryResult } from "@/lib/api";

export interface QueryHistoryItem {
  id: string;
  question: string;
  result: QueryResult;
  timestamp: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function filterExpired(items: QueryHistoryItem[]) {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  return items.filter((item) => item.timestamp >= cutoff);
}

interface QueryHistoryState {
  items: QueryHistoryItem[];
  messages: ChatMessage[];
  addItem: (question: string, result: QueryResult) => void;
  clearItems: () => void;
  removeItem: (id: string) => void;
  getHistoryMessages: () => ChatMessage[];
}

export const useQueryHistoryStore = create<QueryHistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      messages: [],
      addItem: (question, result) =>
        set((state) => ({
          items: [
            { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, question, result, timestamp: Date.now() },
            ...filterExpired(state.items),
          ].slice(0, 50),
        })),
      clearItems: () => set({ items: [], messages: [] }),
      removeItem: (id) => set((state) => ({ items: filterExpired(state.items).filter((item) => item.id !== id) })),
      getHistoryMessages: () => {
        const { items } = get();
        const active = filterExpired(items);
        // Build messages from oldest to newest, last 10 turns
        const msgs: ChatMessage[] = [];
        for (const item of active.slice(0, 10).reverse()) {
          msgs.push({ role: "user", content: item.question });
          msgs.push({ role: "assistant", content: item.result.answer });
        }
        return msgs;
      },
    }),
    {
      name: "query-history",
      merge: (persistedState, currentState) => {
        const raw = (persistedState as { items?: QueryHistoryItem[] } | undefined)?.items ?? [];
        const active = filterExpired(raw);
        return {
          ...currentState,
          items: active,
          messages: (() => {
            const msgs: ChatMessage[] = [];
            for (const item of active.slice(0, 10).reverse()) {
              msgs.push({ role: "user", content: item.question });
              msgs.push({ role: "assistant", content: item.result.answer });
            }
            return msgs;
          })(),
        };
      },
    },
  ),
);
