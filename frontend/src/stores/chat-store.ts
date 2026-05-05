import { create } from "zustand";
import type { ChatMessageItem } from "@/lib/api";

interface ChatState {
  messages: ChatMessageItem[];
  connected: boolean;
  connecting: boolean;
  error: string | null;
  teamId: string | null;

  setTeamId: (id: string) => void;
  addMessage: (msg: ChatMessageItem) => void;
  setMessages: (msgs: ChatMessageItem[]) => void;
  prependMessages: (msgs: ChatMessageItem[]) => void;
  setConnected: (v: boolean) => void;
  setConnecting: (v: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  connected: false,
  connecting: false,
  error: null,
  teamId: null,

  setTeamId: (id) => set({ teamId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  prependMessages: (msgs) => set((s) => ({ messages: [...msgs, ...s.messages] })),
  setConnected: (v) => set({ connected: v }),
  setConnecting: (v) => set({ connecting: v }),
  setError: (e) => set({ error: e }),
  reset: () => set({ messages: [], connected: false, connecting: false, error: null, teamId: null }),
}));
