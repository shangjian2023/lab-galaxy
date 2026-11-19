"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, Network, Search } from "lucide-react";
import { groupMeta } from "@/lib/demo-data";
import type { KnowledgeGraphNode } from "@/lib/knowledge-types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}

export function NodeMentionInput({ value, onChange, disabled, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [nodes, setNodes] = useState<KnowledgeGraphNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchError, setSearchError] = useState(false);
  const reduceMotion = useReducedMotion();
  const open = mentionStart !== null;

  useEffect(() => {
    if (mentionStart === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(false);
      try {
        const response = await fetch(`/api/knowledge/nodes?q=${encodeURIComponent(query)}&limit=6`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("node search failed");
        const payload = await response.json() as { nodes?: KnowledgeGraphNode[] };
        setNodes(payload.nodes ?? []);
        setActiveIndex(0);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setNodes([]);
        setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mentionStart, query]);

  const close = () => {
    setMentionStart(null);
    setNodes([]);
    setQuery("");
    setSearchError(false);
  };

  const insertNode = (node: KnowledgeGraphNode) => {
    if (mentionStart === null) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursorRef.current);
    const mention = `@[${node.name}](${node.id})`;
    const next = `${before}${mention} ${after}`;
    onChange(next);
    close();
    window.requestAnimationFrame(() => {
      const position = before.length + mention.length + 1;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(position, position);
    });
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    const cursor = event.target.selectionStart ?? next.length;
    cursorRef.current = cursor;
    onChange(next);
    const beforeCursor = next.slice(0, cursor);
    const at = beforeCursor.lastIndexOf("@");
    if (at >= 0) {
      const previous = at > 0 ? beforeCursor[at - 1] : "";
      const trigger = beforeCursor.slice(at + 1);
      if ((at === 0 || /[^a-zA-Z0-9]/.test(previous)) && !trigger.includes("](") && trigger.length <= 40) {
        setMentionStart(at);
        setQuery(trigger);
        return;
      }
    }
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (nodes.length && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, nodes.length - 1));
    } else if (nodes.length && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (nodes.length && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      insertNode(nodes[activeIndex]);
    }
  };

  return (
    <div className="node-mention-input">
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(event) => { cursorRef.current = event.currentTarget.selectionStart ?? value.length; }}
        placeholder={placeholder}
        aria-label="向研究助手提问"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? "node-mention-options" : undefined}
        maxLength={500}
        disabled={disabled}
        role="combobox"
      />
      <AnimatePresence>
        {open ? <motion.div
          id="node-mention-options"
          className="node-mention-menu"
          role="listbox"
          aria-label="可引用的知识节点"
          initial={reduceMotion ? false : { opacity: 0, y: 7, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="node-mention-heading"><span><Network size={13} />引用知识节点</span><small>@ {query || "输入名称搜索"}</small></div>
          {loading ? <div className="node-mention-empty"><LoaderCircle size={14} className="animate-spin" />正在检索已发布节点</div> : null}
          {!loading && searchError ? <div className="node-mention-empty">节点检索暂时不可用，请稍后重试</div> : null}
          {!loading && !searchError && !nodes.length ? <div className="node-mention-empty"><Search size={13} />没有找到当前账号可引用的节点</div> : null}
          {!loading ? nodes.map((node, index) => <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`node-mention-option ${index === activeIndex ? "active" : ""}`}
            key={node.id}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => insertNode(node)}
          >
            <i style={{ background: groupMeta[node.group].color }} />
            <span><strong>@{node.name}</strong><small>{node.type} · {node.sourceScope === "mine" ? "我的图谱" : "预置语料"}</small></span>
          </button>) : null}
          <p>↑↓ 选择 · Enter 引用 · Esc 关闭</p>
        </motion.div> : null}
      </AnimatePresence>
    </div>
  );
}
