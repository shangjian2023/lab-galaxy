"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { searchGraphNodes } from "@/lib/api";
import type { GraphNode } from "@/lib/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
}

type MentionResult = {
  id: string;
  name: string;
  label: string;
  type: "member" | "node";
  color: string;
};

const NODE_TYPE_COLORS: Record<string, string> = {
  Experiment: "bg-blue-100 text-blue-700",
  Equipment: "bg-red-100 text-red-700",
  Theory: "bg-purple-100 text-purple-700",
  Consumable: "bg-amber-100 text-amber-700",
  Tool: "bg-green-100 text-green-700",
  Concept: "bg-gray-100 text-black",
};

export default function ChatMentionInput({ value, onChange, onKeyDown, placeholder, disabled }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const nodesPromise = searchGraphNodes(q, undefined, 5).catch(() => ({ nodes: [] }));
    let nodes: GraphNode[] = [];
    try {
      const res = await nodesPromise;
      nodes = res.nodes || [];
    } catch {
      nodes = [];
    }
    const combined: MentionResult[] = nodes.map((n) => ({
      id: n.id,
      name: n.name,
      label: n.type,
      type: "node" as const,
      color: NODE_TYPE_COLORS[n.type] || "bg-gray-100 text-black",
    }));
    setResults(combined);
  }, []);

  const insertMention = useCallback((item: MentionResult) => {
    if (mentionStart === null) return;
    const input = document.activeElement as HTMLInputElement;
    if (!input) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(input.selectionEnd ?? value.length);
    const mention = `@[${item.name}](${item.id})`;
    const newValue = before + mention + " " + after;
    onChange(newValue);
    setShowDropdown(false);
    setMentionStart(null);
    setQuery("");
    setResults([]);
    setSelectedIndex(0);

    setTimeout(() => {
      input.focus();
      const pos = before.length + mention.length + 1;
      input.setSelectionRange(pos, pos);
    }, 0);
  }, [mentionStart, value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart ?? 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf("@");

    if (lastAt !== -1) {
      const charBeforeAt = lastAt > 0 ? textBeforeCursor[lastAt - 1] : "";
      if (lastAt === 0 || /[^a-zA-Z0-9]/.test(charBeforeAt)) {
        const triggerText = textBeforeCursor.slice(lastAt + 1);
        if (!triggerText.includes("](") && triggerText.length <= 20) {
          setMentionStart(lastAt);
          setQuery(triggerText);
          setShowDropdown(true);
          setSelectedIndex(0);
          if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
          searchTimerRef.current = setTimeout(() => doSearch(triggerText), 300);
          return;
        }
      }
    }

    setShowDropdown(false);
    setMentionStart(null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setMentionStart(null);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder || "输入消息..."}
          disabled={disabled}
          className="flex-1 rounded-2xl border border-gray-200/60 bg-white/50 px-5 py-2.5 text-sm outline-none transition-all focus:border-orange-300/60 focus:bg-white/70 focus:shadow-sm disabled:opacity-50"
        />
        <button
          onClick={() => {
            const content = value.trim();
            if (!content) return;
            onKeyDown({
              key: "Enter",
              shiftKey: false,
              preventDefault: () => {},
            } as React.KeyboardEvent<HTMLInputElement>);
          }}
          disabled={!value.trim() || disabled}
          className="rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-orange-600 hover:to-amber-600 active:scale-95 disabled:opacity-30 disabled:hover:from-orange-500 disabled:hover:to-amber-500"
        >
          发送
        </button>
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && (results.length > 0) && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-52 overflow-y-auto rounded-xl border border-white/40 bg-white/80 shadow-xl backdrop-blur-lg"
          style={{ backdropFilter: "blur(12px)" }}
        >
          {results.map((item, i) => (
            <button
              key={item.id}
              onClick={() => insertMention(item)}
              className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                i === selectedIndex ? "bg-orange-50/80" : "hover:bg-gray-50/50"
              }`}
            >
              <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${item.color}`}>
                {item.label}
              </span>
              <span className="flex-1 truncate font-medium text-gray-800">@{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
