"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { createTeamChatWS, getRecentMessages } from "@/lib/api";
import type { ChatMessageItem } from "@/lib/api";
import ChatMessage from "./ChatMessage";
import ChatMentionInput from "./ChatMentionInput";
import { soundEngine } from "@/lib/audio/SoundEngine";

interface Props {
  teamId: string;
  currentUserId: string;
}

export default function ChatRoom({ teamId, currentUserId }: Props) {
  const { messages, connected, addMessage, setMessages, setConnected, setConnecting, setError, reset } = useChatStore();
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
    soundEngine.play("hover");
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 space-y-5 overflow-y-auto px-5 py-6"
        style={{
          background: "linear-gradient(160deg, #FFF6EE 0%, #FFECD9 30%, #FFE0C2 70%, #FDD8B5 100%)",
        }}
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} isOwn={msg.user_id === currentUserId} />
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 h-16 w-16 rounded-full bg-white/30 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center text-3xl">💬</div>
            <p className="text-sm text-gray-600">暂无消息，发送第一条吧</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 -2px 12px rgba(0,0,0,0.04)",
        }}
      >
        <ChatMentionInput
          value={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          placeholder="输入消息… 输入 @ 提及成员或实验节点"
          disabled={!connected}
        />
      </div>
    </div>
  );
}
