export type ConversationMessageStatus = "pending" | "completed" | "incomplete" | "failed";

export interface ConversationSource {
  chunkId: string;
  documentId: string;
  title: string | null;
  sourceUrl: string | null;
  institution: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  text: string | null;
  matchedTerms: string[];
  available: boolean;
  accessDenied?: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  question: string;
  answer: string | null;
  sources: ConversationSource[];
  model: string | null;
  grounded: boolean;
  status: ConversationMessageStatus;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ConversationMessagePage {
  conversationId: string;
  messages: ConversationMessage[];
  limit: number;
}
