"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { ChatMessageItem } from "@/lib/api";
import SmartNodeLink from "../graph/SmartNodeLink";

interface Props {
  msg: ChatMessageItem;
  isOwn: boolean;
}

// Deterministic per-user color palette for avatar backgrounds.
// Each user gets a consistent gradient based on a hash of their user_id,
// so the same person always looks the same across messages.
const AVATAR_PALETTE: { bg: string; text: string; accent: string }[] = [
  { bg: "linear-gradient(135deg, #FF6B6B 0%, #EE5A5A 100%)", text: "#fff", accent: "#EE5A5A" }, // coral
  { bg: "linear-gradient(135deg, #4ECDC4 0%, #36B5AC 100%)", text: "#fff", accent: "#36B5AC" }, // teal
  { bg: "linear-gradient(135deg, #96CEB4 0%, #7AB59A 100%)", text: "#fff", accent: "#7AB59A" }, // sage
  { bg: "linear-gradient(135deg, #A78BFA 0%, #8B6FE0 100%)", text: "#fff", accent: "#8B6FE0" }, // purple
  { bg: "linear-gradient(135deg, #60A5FA 0%, #4F90E0 100%)", text: "#fff", accent: "#4F90E0" }, // blue
  { bg: "linear-gradient(135deg, #FBBF24 0%, #E8A81A 100%)", text: "#fff", accent: "#E8A81A" }, // amber
  { bg: "linear-gradient(135deg, #F472B6 0%, #E05FA0 100%)", text: "#fff", accent: "#E05FA0" }, // pink
  { bg: "linear-gradient(135deg, #34D399 0%, #22BE85 100%)", text: "#fff", accent: "#22BE85" }, // emerald
  { bg: "linear-gradient(135deg, #FB923C 0%, #E87F2E 100%)", text: "#fff", accent: "#E87F2E" }, // orange
  { bg: "linear-gradient(135deg, #94A3B8 0%, #7A8499 100%)", text: "#fff", accent: "#7A8499" }, // slate
];

function getUserColor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
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
      <SmartNodeLink
        key={match.index}
        nodeId={match[2]}
        displayName={match[1]}
        className="rounded bg-[#9A8C73]/15 px-1 py-0.5 font-medium underline decoration-[#9A8C73]/40 underline-offset-2 hover:bg-[#9A8C73]/25"
      >
        @{match[1]}
      </SmartNodeLink>
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
  const userColor = getUserColor(msg.user_id);

  return (
    <div className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar — own = brand color, others = deterministic per-user color */}
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm"
        style={
          isOwn
            ? { background: "linear-gradient(135deg, #9A8C73 0%, #8C7D70 100%)", color: "#fff" }
            : { background: userColor.bg, color: userColor.text }
        }
      >
        {avatarInitial}
      </div>

      {/* Bubble + info */}
      <div className={`max-w-[60%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {!isOwn && (
          <span className="mb-0.5 ml-0.5 text-[11px] font-medium" style={{ color: userColor.accent }}>
            {msg.nickname}
          </span>
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
            border: isOwn ? "none" : `1px solid rgba(216,199,181,0.4)`,
            borderLeft: isOwn ? undefined : `3px solid ${userColor.accent}`,
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
