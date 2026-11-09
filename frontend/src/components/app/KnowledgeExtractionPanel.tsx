"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrainCircuit, Check, ChevronDown, ChevronUp, FileSearch, Network, RefreshCw, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/app/AuthProvider";
import { createKnowledgeTask, listKnowledgeTasks, publishKnowledgeTask, retryKnowledgeTask } from "@/lib/knowledge-client";
import type { KnowledgeTask } from "@/lib/knowledge-types";

const taskStatus = { draft: "待发布草稿", published: "已发布", failed: "抽取失败" } as const;

export function KnowledgeExtractionPanel({ documentId, documentTitle }: { documentId: string; documentTitle: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<KnowledgeTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [maxChunks, setMaxChunks] = useState(4);
  const [confirmCost, setConfirmCost] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generationRef = useRef(0);

  const reload = useCallback(async () => {
    if (!user) return;
    const generation = generationRef.current;
    setLoading(true);
    try {
      const all = await listKnowledgeTasks();
      if (generation !== generationRef.current) return;
      const matching = all.filter((task) => task.documentId === documentId);
      setTasks(matching);
      setSelectedTaskId((current) => matching.some((task) => task.id === current) ? current : matching[0]?.id ?? null);
      setError("");
    } catch (reason) {
      if (generation === generationRef.current) setError(reason instanceof Error ? reason.message : "知识任务读取失败");
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [documentId, user]);

  useEffect(() => {
    generationRef.current += 1;
    setTasks([]);
    setSelectedTaskId(null);
    setConfirmCost(false);
    setBusy("");
    setError("");
    setNotice("");
    if (open) void reload();
  }, [documentId, user?.id, open, reload]);

  const run = async (key: string, operation: () => Promise<KnowledgeTask>, success: string) => {
    const generation = generationRef.current;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const task = await operation();
      if (generation !== generationRef.current) return;
      setSelectedTaskId(task.id);
      setNotice(success);
      setConfirmCost(false);
      await reload();
    } catch (reason) {
      if (generation !== generationRef.current) return;
      setError(reason instanceof Error ? reason.message : "知识任务操作失败");
      await reload().catch(() => undefined);
    } finally {
      if (generation === generationRef.current) setBusy("");
    }
  };

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  return (
    <section className={`knowledge-extraction ${open ? "open" : ""}`}>
      <button className="knowledge-extraction-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span><BrainCircuit size={15} /><span><strong>知识抽取与发布</strong><small>按需模型调用 · 原文证据 · 人工发布</small></span></span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open ? <div className="knowledge-extraction-body">
        {!user ? <p className="knowledge-muted">登录后可从「{documentTitle}」创建私有抽取草稿。</p> : <>
          <div className="knowledge-cost-control">
            <label>本次读取分块<select value={maxChunks} onChange={(event) => setMaxChunks(Number(event.target.value))} disabled={busy === "create"}>{[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option value={value} key={value}>{value} 个{value === 4 ? "（默认）" : ""}</option>)}</select></label>
            <label className="knowledge-cost-check"><input type="checkbox" checked={confirmCost} onChange={(event) => setConfirmCost(event.target.checked)} /><span>我确认本次调用在线模型，最多处理 {maxChunks} 个文本块，可能产生 API 费用。</span></label>
            <button className="btn btn-primary" disabled={!confirmCost || busy === "create"} onClick={() => void run("create", () => createKnowledgeTask(documentId, maxChunks), "模型结果已保存为草稿，请核对证据后发布。")}>{busy === "create" ? <><RefreshCw size={13} className="animate-spin" />正在抽取…</> : <><Send size={13} />开始一次抽取</>}</button>
          </div>
          {error ? <div className="form-message error" role="alert">{error}</div> : null}
          {notice ? <div className="form-message success" role="status"><Check size={13} />{notice}</div> : null}
          {loading ? <p className="knowledge-muted">正在读取知识任务…</p> : tasks.length ? <div className="knowledge-task-browser">
            <div className="knowledge-task-tabs" aria-label="知识抽取任务">{tasks.map((task) => <button className={task.id === selectedTaskId ? "active" : ""} onClick={() => setSelectedTaskId(task.id)} key={task.id}><span>#{task.attempt}</span>{taskStatus[task.status]}</button>)}</div>
            {selectedTask ? <article className="knowledge-task-detail">
              <div className="knowledge-task-meta"><span className={`status-label ${selectedTask.status === "published" ? "completed" : selectedTask.status === "failed" ? "failed" : "review"}`}>{taskStatus[selectedTask.status]}</span><small>{selectedTask.model} · {selectedTask.maxChunks} 块 · 第 {selectedTask.attempt} 次</small></div>
              {selectedTask.errorMessage ? <p className="document-error">{selectedTask.errorMessage}</p> : null}
              {selectedTask.status === "failed" ? <><label className="knowledge-cost-check"><input type="checkbox" checked={confirmCost} onChange={(event) => setConfirmCost(event.target.checked)} /><span>确认重试会再次调用在线模型并可能产生费用。</span></label><button className="btn btn-secondary" disabled={!confirmCost || busy === "retry"} onClick={() => void run("retry", () => retryKnowledgeTask(selectedTask.id), "重试完成，新结果已保存为草稿。")}><RotateCcw size={13} />{busy === "retry" ? "正在重试…" : "重试失败任务"}</button></> : null}
              {selectedTask.entities.length || selectedTask.relations.length ? <div className="knowledge-candidates">
                <div><strong>{selectedTask.entities.length} 个实体</strong><span>{selectedTask.relations.length} 条关系</span></div>
                <ul>{selectedTask.entities.slice(0, 8).map((entity) => <li key={entity.id}><i className={`legend-mark ${entity.group}`} /><span><strong>{entity.name}</strong><small>{entity.type} · 置信度 {Math.round(entity.confidence * 100)}%</small></span></li>)}</ul>
                {selectedTask.relations.length ? <p className="knowledge-relations">{selectedTask.relations.slice(0, 5).map((relation) => `${relation.sourceName} —${relation.relation}→ ${relation.targetName}`).join("；")}</p> : null}
              </div> : null}
              {selectedTask.evidence.length ? <details className="knowledge-evidence"><summary><FileSearch size={13} />查看 {selectedTask.evidence.length} 条原文证据</summary><div>{selectedTask.evidence.slice(0, 6).map((evidence) => <section key={evidence.id}><span>{evidence.itemType === "entity" ? "实体" : "关系"}证据 · {evidence.pageStart ? `第 ${evidence.pageStart}${evidence.pageEnd && evidence.pageEnd !== evidence.pageStart ? `–${evidence.pageEnd}` : ""} 页` : "文本块"}</span><p>{evidence.text}</p></section>)}</div></details> : null}
              {selectedTask.status === "draft" ? <button className="btn btn-primary knowledge-publish" disabled={busy === "publish"} onClick={() => void run("publish", () => publishKnowledgeTask(selectedTask.id), "草稿已发布，真实知识星图现已更新。")}><ShieldCheck size={13} />{busy === "publish" ? "正在发布…" : "核对无误，发布到星图"}</button> : null}
              {selectedTask.status === "published" ? <Link href={`/graph?node=${encodeURIComponent(selectedTask.entities[0]?.id ?? "")}`} className="btn btn-secondary knowledge-publish"><Network size={13} />在真实星图中查看</Link> : null}
            </article> : null}
          </div> : <p className="knowledge-muted">这份文档还没有你的抽取任务。模型不会在后台自动运行。</p>}
        </>}
      </div> : null}
    </section>
  );
}
