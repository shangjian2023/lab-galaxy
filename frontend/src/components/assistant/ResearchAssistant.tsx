"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, Check, ExternalLink, FileSearch, History, LockKeyhole, MessageSquarePlus, Pencil, RefreshCw, RotateCcw, Sparkles, Square, Trash2, User, X } from "lucide-react";
import { useAuth } from "@/components/app/AuthProvider";
import { createConversation, deleteConversation, listConversationMessages, listConversations, renameConversation, streamConversationAsk } from "@/lib/conversation-client";
import type { ConversationMessage, ConversationSummary } from "@/lib/conversation-types";

const suggestions = ["TCP 和 UDP 的实验分别分析了什么？", "Hadoop 单机环境如何部署？", "总结静态路由配置实验的步骤"];

function localMessage(conversationId: string, question: string): ConversationMessage {
  return {
    id: `local-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    conversationId,
    question,
    answer: "",
    sources: [],
    model: null,
    grounded: false,
    status: "pending",
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

export function ResearchAssistant({ compact = false }: { compact?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const historyRequestRef = useRef(0);
  const conversationRef = useRef<HTMLDivElement>(null);

  const setCurrentConversation = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const abortActive = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreaming(false);
  }, []);

  const loadMessages = useCallback(async (conversationId: string, showLoading = true) => {
    const generation = generationRef.current;
    const requestId = ++historyRequestRef.current;
    if (showLoading) setHistoryLoading(true);
    try {
      const result = await listConversationMessages(conversationId);
      if (generation !== generationRef.current || requestId !== historyRequestRef.current || activeIdRef.current !== conversationId) return;
      setMessages(result);
      setError("");
    } catch (reason) {
      if (generation === generationRef.current && requestId === historyRequestRef.current && activeIdRef.current === conversationId) {
        setError(reason instanceof Error ? reason.message : "会话历史读取失败");
      }
    } finally {
      if (generation === generationRef.current && requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async (openLatest = false) => {
    const generation = generationRef.current;
    setListLoading(true);
    try {
      const result = await listConversations();
      if (generation !== generationRef.current) return;
      setConversations(result);
      if (openLatest && result[0]) {
        setCurrentConversation(result[0].id);
        await loadMessages(result[0].id);
      }
    } catch (reason) {
      if (generation === generationRef.current) setError(reason instanceof Error ? reason.message : "会话列表读取失败");
    } finally {
      if (generation === generationRef.current) setListLoading(false);
    }
  }, [loadMessages, setCurrentConversation]);

  useEffect(() => {
    generationRef.current += 1;
    historyRequestRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setCurrentConversation(null);
    setConversations([]);
    setMessages([]);
    setQuestion("");
    setStreaming(false);
    setError("");
    setEditingId(null);
    if (user) void loadConversations(true);
  }, [user?.id, loadConversations, setCurrentConversation]);

  useEffect(() => {
    const element = conversationRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, streaming]);

  const visibleMessages = useMemo(() => compact ? messages.slice(-1) : messages, [messages, compact]);
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;

  const openConversation = (conversationId: string) => {
    if (conversationId === activeIdRef.current) return;
    abortActive();
    historyRequestRef.current += 1;
    setCurrentConversation(conversationId);
    setMessages([]);
    setError("");
    void loadMessages(conversationId);
  };

  const startNew = () => {
    abortActive();
    historyRequestRef.current += 1;
    setCurrentConversation(null);
    setMessages([]);
    setQuestion("");
    setError("");
  };

  const ask = async (value: string) => {
    const cleaned = value.trim();
    if (!cleaned || streaming || !user) return;
    const generation = generationRef.current;
    setError("");
    let conversationId = activeIdRef.current;
    let optimisticId = "";
    try {
      if (!conversationId) {
        const created = await createConversation(cleaned.length > 38 ? `${cleaned.slice(0, 38)}…` : cleaned);
        if (generation !== generationRef.current) return;
        conversationId = created.id;
        setCurrentConversation(created.id);
        setConversations((current) => [created, ...current]);
      }
      const targetId = conversationId;
      const optimistic = localMessage(targetId, cleaned);
      optimisticId = optimistic.id;
      const controller = new AbortController();
      controllerRef.current = controller;
      setStreaming(true);
      setQuestion("");
      setMessages((current) => [...current, optimistic]);
      const isCurrent = () => generation === generationRef.current && activeIdRef.current === targetId && controllerRef.current === controller;
      const updateOptimistic = (update: (message: ConversationMessage) => ConversationMessage) => {
        if (!isCurrent()) return;
        setMessages((current) => current.map((message) => message.id === optimistic.id ? update(message) : message));
      };
      const result = await streamConversationAsk({ question: cleaned, conversationId: targetId, signal: controller.signal }, {
        onSources: (sources) => updateOptimistic((message) => ({ ...message, sources, grounded: sources.length > 0 })),
        onDelta: (text) => updateOptimistic((message) => ({ ...message, answer: `${message.answer ?? ""}${text}` })),
      });
      if (!isCurrent()) return;
      setMessages((current) => current.map((message) => message.id === (result.messageId ?? optimistic.id) || message.id === optimistic.id ? {
        ...message,
        id: result.messageId ?? message.id,
        answer: result.answer,
        sources: result.sources,
        model: result.model,
        grounded: result.grounded,
        status: result.status,
        error: result.error,
        completedAt: new Date().toISOString(),
      } : message));
      await Promise.all([loadMessages(targetId, false), loadConversations(false)]);
    } catch (reason) {
      if (generation !== generationRef.current || activeIdRef.current !== conversationId) return;
      const aborted = reason instanceof Error && reason.name === "AbortError";
      setMessages((current) => current.map((message) => message.id === optimisticId ? {
        ...message,
        status: aborted ? "incomplete" : "failed",
        error: aborted ? "已取消；已生成内容保留为未完成记录。" : reason instanceof Error ? reason.message : "网络请求失败，请稍后重试。",
        completedAt: new Date().toISOString(),
      } : message));
      if (!aborted) setError(reason instanceof Error ? reason.message : "问答请求失败");
      if (aborted && conversationId) {
        const targetId = conversationId;
        window.setTimeout(() => {
          if (generation === generationRef.current && activeIdRef.current === targetId) {
            void loadMessages(targetId, false);
            void loadConversations(false);
          }
        }, 250);
      }
    } finally {
      if (generation === generationRef.current && activeIdRef.current === conversationId) {
        controllerRef.current = null;
        setStreaming(false);
      }
    }
  };

  const submitRename = async (conversationId: string) => {
    const title = editingTitle.trim();
    if (!title) return;
    const generation = generationRef.current;
    try {
      const updated = await renameConversation(conversationId, title);
      if (generation !== generationRef.current) return;
      setConversations((current) => current.map((conversation) => conversation.id === conversationId ? updated : conversation));
      setEditingId(null);
    } catch (reason) {
      if (generation === generationRef.current) setError(reason instanceof Error ? reason.message : "重命名失败");
    }
  };

  const removeConversation = async (conversation: ConversationSummary) => {
    if (!window.confirm(`确定删除会话「${conversation.title}」及全部消息吗？`)) return;
    const generation = generationRef.current;
    if (activeIdRef.current === conversation.id) abortActive();
    try {
      await deleteConversation(conversation.id);
      if (generation !== generationRef.current) return;
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      if (activeIdRef.current === conversation.id) startNew();
    } catch (reason) {
      if (generation === generationRef.current) setError(reason instanceof Error ? reason.message : "删除会话失败");
    }
  };

  const panel = (
    <section className={`assistant-panel ${compact ? "compact" : ""}`} aria-label="研究助手">
      <div className="panel-heading">
        <div>
          <p className="eyebrow"><Sparkles size={13} />RESEARCH COPILOT</p>
          <h2 className="panel-title">{compact ? "研究助手" : activeConversation?.title ?? "新研究会话"}</h2>
        </div>
        <span className="local-badge">SSE 流式 · 原文溯源</span>
      </div>

      {error ? <div className="form-message error assistant-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="关闭错误提示"><X size={13} /></button></div> : null}

      <div className={`assistant-conversation ${compact ? "compact" : ""}`} aria-live="polite" ref={conversationRef}>
        {historyLoading ? <div className="assistant-empty"><RefreshCw size={22} className="animate-spin" /><h3>正在读取会话历史</h3></div> : visibleMessages.length === 0 ? (
          <div className="assistant-empty">
            <span className="assistant-orb"><Bot size={22} /></span>
            <h3>从已解析的实验报告提问</h3>
            <p>先检索你有权访问的原文分块，再由 Qwen 流式生成证据回答；没有命中时不调用模型。</p>
            <div className="suggestion-list">
              {suggestions.slice(0, compact ? 2 : 3).map((suggestion) => (
                <button key={suggestion} onClick={() => void ask(suggestion)} disabled={streaming || !user}>{suggestion}<ArrowUp size={13} /></button>
              ))}
            </div>
          </div>
        ) : visibleMessages.map((item) => (
          <div className="answer-group" key={item.id}>
            <div className="user-question"><User size={14} /><span>{item.question}</span>{item.status !== "completed" ? <small className={`message-status ${item.status}`}>{item.status === "pending" ? "回答中" : item.status === "incomplete" ? "未完成" : "失败"}</small> : null}</div>
            <div className="assistant-answer">
              <span className="answer-icon">{item.status === "pending" ? <RefreshCw size={14} className="animate-spin" /> : <Bot size={15} />}</span>
              <div>
                {item.answer ? <div className={`assistant-markdown ${item.status === "failed" && !item.answer ? "document-error" : ""}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer}</ReactMarkdown></div> : item.status === "pending" ? <p className="assistant-pending">正在检索原文并等待流式回答…</p> : null}
                {item.error ? <p className="document-error assistant-message-error">{item.error}</p> : null}
                {item.sources.length > 0 ? (
                  <div className="answer-sources">
                    <span><FileSearch size={12} />原文证据</span>
                    <div className="source-evidence-list">{item.sources.map((source, index) => source.available === false ? <div className="source-evidence source-unavailable" key={`${source.chunkId}-${index}`}><LockKeyhole size={11} /><span>来源 [{index + 1}] 的原文访问权限已收回</span></div> : <details className="source-evidence" key={`${source.chunkId}-${index}`}><summary><span>[{index + 1}] {source.title ?? "来源文档"}{source.pageStart ? ` · 第 ${source.pageStart} 页` : ""}</span><Link href={`/documents?doc=${encodeURIComponent(source.documentId)}`} aria-label={`在文档中心查看 ${source.title ?? "来源文档"}`}><ExternalLink size={11} /></Link></summary><p>{source.text}</p><small>{source.matchedTerms.length ? `命中：${source.matchedTerms.join("、")}` : "相关原文分块"}</small></details>)}</div>
                  </div>
                ) : null}
                {item.model ? <small className="answer-model">{item.model} · 仅依据上方原文生成</small> : item.status === "completed" && !item.grounded ? <small className="answer-model">未命中证据 · 未调用模型</small> : null}
                {(item.status === "failed" || item.status === "incomplete") && !streaming ? <button className="assistant-retry" onClick={() => void ask(item.question)}><RotateCcw size={12} />重新提问（保留此记录）</button> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!user && !authLoading ? <div className="assistant-login-notice"><LockKeyhole size={18} /><p><strong>登录后开始证据问答</strong><span>公开原文仍可阅读；登录可防止未授权模型调用，并按你的知识范围检索。</span></p><Link href="/account" className="btn btn-secondary">登录 / 注册</Link></div> : null}

      <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={user ? "询问网络、系统、数据库或云计算实验…" : "请先登录后提问"} aria-label="向研究助手提问" maxLength={500} disabled={streaming || !user} />
        {streaming ? <button type="button" onClick={abortActive} className="assistant-stop" aria-label="停止回答"><Square size={13} /></button> : <button type="submit" disabled={!question.trim() || !user} aria-label="发送问题"><ArrowUp size={17} /></button>}
      </form>
      <p className="assistant-disclaimer">问题与命中的有权原文会发送至服务端配置的 Qwen；会话按账号保存。请核对证据，谨慎提交私密内容。</p>
    </section>
  );

  if (compact) return panel;

  return (
    <div className="assistant-workspace">
      <aside className="panel conversation-history" aria-label="历史会话">
        <div className="conversation-history-heading"><span><History size={14} />历史会话</span><button onClick={startNew} disabled={!user || streaming} aria-label="新建会话"><MessageSquarePlus size={15} /></button></div>
        <button className="conversation-new" onClick={startNew} disabled={!user || streaming}><MessageSquarePlus size={13} />新建研究会话</button>
        <div className="conversation-list">
          {listLoading && !conversations.length ? <p className="conversation-list-empty">正在读取…</p> : conversations.length ? conversations.map((conversation) => <div className={`conversation-list-item ${conversation.id === activeId ? "active" : ""}`} key={conversation.id}>
            {editingId === conversation.id ? <form onSubmit={(event) => { event.preventDefault(); void submitRename(conversation.id); }}><input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} maxLength={120} autoFocus aria-label="会话新标题" /><button type="submit" aria-label="保存标题"><Check size={12} /></button><button type="button" onClick={() => setEditingId(null)} aria-label="取消重命名"><X size={12} /></button></form> : <>
              <button className="conversation-select" onClick={() => openConversation(conversation.id)}><strong>{conversation.title}</strong><span>{conversation.messageCount} 条消息</span></button>
              <div className="conversation-actions"><button onClick={() => { setEditingId(conversation.id); setEditingTitle(conversation.title); }} aria-label={`重命名 ${conversation.title}`}><Pencil size={11} /></button><button onClick={() => void removeConversation(conversation)} aria-label={`删除 ${conversation.title}`}><Trash2 size={11} /></button></div>
            </>}
          </div>) : <p className="conversation-list-empty">{user ? "还没有历史会话" : "登录后查看会话"}</p>}
        </div>
        <p className="conversation-privacy"><LockKeyhole size={11} />仅当前账号可读取</p>
      </aside>
      {panel}
    </div>
  );
}
