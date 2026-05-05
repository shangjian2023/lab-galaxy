"use client";

import type { ChatMessageItem } from "@/lib/api";

interface Props {
  msg: ChatMessageItem;
  isOwn: boolean;
}

export default function ChatMessage({ msg, isOwn }: Props) {
  if (msg.message_type === "system") {
    return (
      <div className="flex justify-center py-1.5">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] text-gray-400">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-xs font-bold text-white">
        {(msg.nickname || "?")[0]}
      </div>

      {/* Bubble */}
      <div className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {!isOwn && (
          <span className="mb-0.5 text-[11px] text-gray-400">{msg.nickname}</span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isOwn
              ? "rounded-tr-md bg-orange-500 text-white"
              : "rounded-tl-md bg-white text-gray-700 shadow-sm ring-1 ring-gray-100"
          }`}
        >
          {msg.content}
        </div>
        <span className="mt-0.5 text-[10px] text-gray-300">
          {new Date(msg.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
