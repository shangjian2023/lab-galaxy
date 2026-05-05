"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { searchGraphNodes } from "@/lib/api";
import type { GraphNode } from "@/lib/api";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export default function NodeMentionInput({ value, onChange, placeholder, rows = 8, className }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchGraphNodes(q, undefined, 8);
      setResults(res.nodes);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const insertMention = useCallback((node: GraphNode) => {
    if (mentionStart === null) return;
    const before = value.slice(0, mentionStart);
    // Find end of @mention trigger text (after the @)
    const after = value.slice(textareaRef.current?.selectionEnd ?? value.length);
    const mention = `@[${node.name}](${node.id})`;
    const newValue = before + mention + " " + after;
    onChange(newValue);
    setShowDropdown(false);
    setMentionStart(null);
    setQuery("");
    setResults([]);

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + mention.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }, [mentionStart, value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart ?? 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);

    // Check if we're in a @mention context
    const lastAt = textBeforeCursor.lastIndexOf("@");
    if (lastAt !== -1) {
      // Make sure the @ is at start or preceded by whitespace/newline
      const charBeforeAt = lastAt > 0 ? textBeforeCursor[lastAt - 1] : " ";
      if (/[\s\n]/.test(charBeforeAt) || lastAt === 0) {
        const triggerText = textBeforeCursor.slice(lastAt + 1);
        // Don't trigger if there's already a completed @[name](id) mention
        if (!triggerText.includes("](") && triggerText.length <= 20) {
          setMentionStart(lastAt);
          setQuery(triggerText);
          setShowDropdown(true);
          setSelectedIndex(0);
          // Debounce search
          if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
          searchTimerRef.current = setTimeout(() => doSearch(triggerText), 300);
          return;
        }
      }
    }

    setShowDropdown(false);
    setMentionStart(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "写下你的想法...\n输入 @ 后输入节点名称可关联图谱节点"}
        rows={rows}
        className={className || "w-full rounded-lg bg-white/50 p-3 text-sm ring-1 ring-white/40 transition-all focus:bg-white/70 focus:ring-orange-300/50"}
      />

      {/* Autocomplete dropdown */}
      {showDropdown && (results.length > 0 || searching) && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {searching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">搜索中...</div>
          )}
          {results.map((node, i) => {
            const TYPE_COLORS: Record<string, string> = {
              Experiment: "bg-blue-100 text-blue-700",
              Equipment: "bg-red-100 text-red-700",
              Theory: "bg-purple-100 text-purple-700",
              Consumable: "bg-amber-100 text-amber-700",
              Tool: "bg-green-100 text-green-700",
            };
            return (
              <button
                key={node.id}
                onClick={() => insertMention(node)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === selectedIndex ? "bg-orange-50" : "hover:bg-gray-50"
                }`}
              >
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[node.type] || "bg-gray-100 text-gray-600"}`}>
                  {node.type}
                </span>
                <span className="flex-1 truncate font-medium text-gray-800">{node.name}</span>
                {node.summary && (
                  <span className="truncate text-xs text-gray-400">{node.summary}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
