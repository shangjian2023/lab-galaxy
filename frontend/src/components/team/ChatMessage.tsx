"use client";

import Link from "next/link";
import type { ChatMessageItem } from "@/lib/api";

interface Props {
  msg: ChatMessageItem;
  isOwn: boolean;
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;

function MentionHighlight({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <Link
        key={match.index}
        href={`/graph?highlight=${match[2]}`}
        className="rounded bg-white/40 px-1 py-0.5 font-medium underline decoration-1 underline-offset-2 hover:bg-white/60"
        title={`查看: ${match[1]}`}
      >
        @{match[1]}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : content}</>;
}

export default function ChatMessage({ msg, isOwn }: Props) {
  if (msg.message_type === "system") {
    return (
      <div className="flex justify-center py-1.5">
        <span className="text-[11px] text-black">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-xs font-bold text-white shadow-md">
        {(msg.nickname || "?")[0]}
      </div>

      {/* Bubble + info */}
      <div className={`max-w-[65%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {!isOwn && (
          <span className="mb-1 text-[11px] text-gray-700/70">{msg.nickname}</span>
        )}

        {/* Frosted glass bubble */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isOwn ? "text-white" : "text-gray-700"
          }`}
          style={{
            background: isOwn
              ? "linear-gradient(135deg, rgba(249,115,22,0.88) 0%, rgba(245,158,11,0.88) 100%)"
              : "rgba(255,255,255,0.55)",
            backdropFilter: "blur(16px)",
            boxShadow: isOwn
              ? "0 4px 12px rgba(249,115,22,0.25), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
            border: isOwn ? "none" : "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {isOwn ? (
            <MentionHighlight content={msg.content} />
          ) : (
            <MentionHighlight content={msg.content} />
          )}
        </div>

        {/* Timestamp */}
        <span
          className="mt-1 text-[10px]"
          style={{ color: isOwn ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.4)" }}
        >
          {new Date(msg.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
