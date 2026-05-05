"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { createTeamChatWS, getRecentMessages } from "@/lib/api";
import type { ChatMessageItem } from "@/lib/api";
import ChatMessage from "./ChatMessage";

interface Props {
  teamId: string;
  currentUserId: string;
}

export default function ChatRoom({ teamId, currentUserId }: Props) {
  const { messages, connected, connecting, addMessage, setMessages, setConnected, setConnecting, setError, reset } = useChatStore();
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  // Load recent history on mount
  useEffect(() => {
    if (!teamId) return;
    getRecentMessages(teamId, 100)
      .then((res) => setMessages(res.items))
      .catch(() => {});
  }, [teamId, setMessages]);

  // WebSocket connection
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
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setConnecting(false);
        // Auto-reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setError("连接失败");
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws?.close();
      reset();
    };
  }, [teamId, setConnected, setConnecting, setError, addMessage, reset]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = () => {
    const content = input.trim();
    if (!content || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ content }));
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-400" : connecting ? "bg-yellow-400" : "bg-red-400"}`} />
        <span className="text-xs text-gray-400">
          {connected ? "已连接" : connecting ? "连接中..." : "未连接"}
        </span>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} isOwn={msg.user_id === currentUserId} />
        ))}
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-300">暂无消息，发送第一条吧</p>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-orange-300 focus:bg-white"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !connected}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
