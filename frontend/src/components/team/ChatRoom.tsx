"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { createTeamChatWS, getRecentMessages } from "@/lib/api";
import type { ChatMessageItem } from "@/lib/api";
import ChatMessage from "./ChatMessage";
import ChatMentionInput from "./ChatMentionInput";
import EmojiPicker from "./EmojiPicker";
import { soundEngine } from "@/lib/audio/SoundEngine";

interface Props {
  teamId: string;
  currentUserId: string;
}

export default function ChatRoom({ teamId, currentUserId }: Props) {
  const { messages, connected, addMessage, setMessages, setConnected, setConnecting, setError, reset } = useChatStore();
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (!teamId) return;
    getRecentMessages(teamId, 100)
      .then((res) => setMessages(res.items))
      .catch(() => {});
  }, [teamId, setMessages]);

  useEffect(() => {
    if (!teamId) return;

    let ws: WebSocket;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setConnecting(true);
      setError(null);

      ws = createTeamChatWS(teamId);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setConnecting(false);
      };

      ws.onmessage = (ev) => {
        try {
          const msg: ChatMessageItem = JSON.parse(ev.data);
          addMessage(msg);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setConnecting(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => setError("连接失败");
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws?.close();
      reset();
    };
  }, [teamId, setConnected, setConnecting, setError, addMessage, reset]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = () => {
    const content = input.trim();
    if (!content || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ content }));
    soundEngine.play("hover");
    setInput("");
  };

  const handleEmojiSelect = (emoji: string) => {
    setInput((prev) => prev + emoji);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {/* Connection status */}
      {!connected && (
        <div className="flex items-center justify-center gap-1.5 border-b border-[#DBC7B5]/20 px-4 py-1.5 text-[10px] text-[#9A8C73]" style={{ background: "#F4F1EE" }}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-green-400" : "bg-amber-400 animate-pulse"}`} />
          {connected ? "已连接" : "连接中..."}
        </div>
      )}

      {/* Messages area */}
      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        style={{
          background: "linear-gradient(180deg, #F4F1EE 0%, #E8DDD2 100%)",
        }}
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} isOwn={msg.user_id === currentUserId} />
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#DBC7B5]/40">
              <svg className="h-6 w-6 text-[#9A8C73]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-xs text-[#9A8C73]">暂无消息，发送第一条吧</p>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="relative border-t border-[#DBC7B5]/20 px-3 py-3" style={{ background: "#F4F1EE" }}>
        <div className="flex gap-2">
          {/* Emoji button */}
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className="flex h-12 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition-colors hover:bg-[#DBC7B5]/30"
            title="表情"
          >
            😊
          </button>

          {/* Emoji picker */}
          <EmojiPicker
            isOpen={showEmoji}
            onClose={() => setShowEmoji(false)}
            onSelect={handleEmojiSelect}
          />

          <div className="flex flex-1 flex-col gap-2">
            <ChatMentionInput
              value={input}
              onChange={setInput}
              onKeyDown={handleKeyDown}
              placeholder="输入消息… Enter 发送，Shift+Enter 换行"
              disabled={!connected}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!connected || !input.trim()}
            className="h-12 shrink-0 rounded-xl bg-[#9A8C73] px-5 text-sm font-medium text-white transition-all hover:bg-[#8C7D70] active:scale-95 disabled:opacity-40 disabled:hover:bg-[#9A8C73]"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
