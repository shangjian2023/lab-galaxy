"use client";

import Link from "next/link";
import type { ChatMessageItem } from "@/lib/api";

interface Props {
  msg: ChatMessageItem;
  isOwn: boolean;
}

const MENTION_REGEX = /@\[([^\]]+)\]\(([a-fA-F0-9-]+)\)/g;

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
        href={`/graph?node=${match[2]}`}
        className="rounded bg-[#9A8C73]/15 px-1 py-0.5 font-medium underline decoration-[#9A8C73]/40 underline-offset-2 hover:bg-[#9A8C73]/25"
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
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-[#9A8C73]">{msg.content}</span>
      </div>
    );
  }

  const avatarInitial = (msg.nickname || "?")[0];

  return (
    <div className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ${
        isOwn
          ? "bg-[#9A8C73] text-white"
          : "bg-[#DBC7B5]/60 text-[#492D22]"
      }`}>
        {avatarInitial}
      </div>

      {/* Bubble + info */}
      <div className={`max-w-[60%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {!isOwn && (
          <span className="mb-0.5 ml-0.5 text-[11px] text-[#9A8C73]">{msg.nickname}</span>
        )}

        {/* Bubble */}
        <div
          className={`rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
            isOwn ? "text-white" : "text-[#4a3e34]"
          }`}
          style={{
            background: isOwn
              ? "linear-gradient(135deg, #9A8C73 0%, #8C7D70 100%)"
              : "#FFFFFF",
            boxShadow: isOwn
              ? "0 2px 8px rgba(154,140,115,0.3), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 1px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)",
            border: isOwn ? "none" : "1px solid rgba(216,199,181,0.4)",
          }}
        >
          <MentionHighlight content={msg.content} />
        </div>

        {/* Timestamp */}
        <span
          className={`mt-0.5 text-[10px] ${isOwn ? "mr-0.5" : "ml-0.5"}`}
          style={{ color: "rgba(107,93,80,0.4)" }}
        >
          {new Date(msg.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
