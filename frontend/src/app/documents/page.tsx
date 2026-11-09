"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CloudUpload,
  ExternalLink,
  FileText,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/components/app/AuthProvider";
import { KnowledgeExtractionPanel } from "@/components/app/KnowledgeExtractionPanel";
import { getResearchDocumentPreview, listResearchDocuments, type ResearchDocumentPreview } from "@/lib/research-api";
import { deleteIngestionTask, listIngestionTasks, retryIngestionTask, uploadIngestionDocument } from "@/lib/ingestion-client";
import { listTeams, type TeamSummary } from "@/lib/team-api";
import type { DocumentStatus, ResearchDocument } from "@/lib/research-types";
import type { DocumentVisibility } from "@/lib/auth-types";
import type { IngestionTask } from "@/lib/ingestion-types";

const statusText: Record<DocumentStatus, string> = { completed: "解析完成", processing: "正在解析", review: "等待审核", ready: "等待上传", failed: "解析失败" };
const taskStatusText: Record<IngestionTask["status"], string> = { queued: "等待处理", processing: "正在解析", completed: "解析完成", failed: "解析失败", incomplete: "处理中断" };
const visibilityText: Record<DocumentVisibility, string> = { private: "仅自己", team: "团队", public: "公开" };

function isExternalUrl(value?: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export default function DocumentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [tasks, setTasks] = useState<IngestionTask[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DocumentStatus>("all");
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<DocumentVisibility>("private");
  const [teamId, setTeamId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseNote, setLicenseNote] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<ResearchDocumentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const documentsRequest = useRef(0);
  const tasksRequest = useRef(0);
  const accountGeneration = useRef(0);
  const previewRequest = useRef(0);

  const loadDocuments = useCallback(async () => {
    const requestId = ++documentsRequest.current;
    setLoading(true);
    setLoadError("");
    try {
      const rows = await listResearchDocuments();
      if (requestId !== documentsRequest.current) return;
      const requestedId = new URLSearchParams(window.location.search).get("doc");
      setDocuments(rows);
      setSelectedId((current) => rows.some((document) => document.id === requestedId) ? requestedId : rows.some((document) => document.id === current) ? current : rows[0]?.id ?? null);
    } catch (error) {
      if (requestId !== documentsRequest.current) return;
      setLoadError(error instanceof Error ? error.message : "文档库读取失败");
    } finally {
      if (requestId === documentsRequest.current) setLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    const requestId = ++tasksRequest.current;
    if (!user) {
      setTasks([]);
      return;
    }
    try {
      const result = await listIngestionTasks();
      if (requestId === tasksRequest.current) setTasks(result);
    } catch (error) {
      if (requestId === tasksRequest.current) setUploadError(error instanceof Error ? error.message : "上传任务读取失败");
    }
  }, [user]);

  useEffect(() => {
    accountGeneration.current += 1;
    documentsRequest.current += 1;
    tasksRequest.current += 1;
    setDocuments([]);
    setTasks([]);
    setSelectedId(null);
    setPreview(null);
    setSelectedFile(null);
    setBusy("");
    setUploadError("");
    setNotice("");
    setVisibility("private");
    setTeamId("");
    void loadDocuments();
    void loadTasks();
    if (!user) {
      setTeams([]);
      return;
    }
    void listTeams().then((result) => setTeams(result.teams)).catch(() => setTeams([]));
  }, [user?.id, loadDocuments, loadTasks]);

  const hasActiveTasks = tasks.some((task) => task.status === "queued" || task.status === "processing");
  useEffect(() => {
    if (!hasActiveTasks) return;
    const timer = window.setInterval(() => {
      void loadTasks();
      void loadDocuments();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks, loadDocuments, loadTasks]);

  const filtered = documents.filter((document) =>
    (status === "all" || document.status === status) &&
    `${document.title} ${document.institution ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = documents.find((document) => document.id === selectedId) ?? null;

  const chooseFile = (file: File | undefined) => {
    setUploadError("");
    setNotice("");
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "docx") {
      setSelectedFile(null);
      setUploadError("仅支持 PDF 或 DOCX，其他格式不会被加入上传队列。");
      return;
    }
    if (file.size <= 0 || file.size > 30 * 1024 * 1024) {
      setSelectedFile(null);
      setUploadError(file.size <= 0 ? "不能上传空文件。" : "文件超过 30 MiB 上限。");
      return;
    }
    setSelectedFile(file);
  };

  const refreshAfterTask = async () => {
    await Promise.all([loadTasks(), loadDocuments()]);
  };

  const startUpload = async () => {
    if (!selectedFile || !user) return;
    const generation = accountGeneration.current;
    if (visibility === "team" && !teamId) {
      setUploadError("请选择要共享到的团队。");
      return;
    }
    setBusy("upload");
    setUploadError("");
    setNotice("");
    try {
      const task = await uploadIngestionDocument({ file: selectedFile, visibility, teamId: visibility === "team" ? teamId : null, sourceUrl, licenseNote });
      if (generation !== accountGeneration.current) return;
      setNotice(task.status === "completed" ? `「${task.originalFilename}」已完成真实解析并写入文档库。` : `「${task.originalFilename}」的任务状态为${taskStatusText[task.status]}。`);
      setSelectedFile(null);
      setSourceUrl("");
      setLicenseNote("");
      setSelectedId(task.documentId);
    } catch (error) {
      if (generation === accountGeneration.current) setUploadError(`${error instanceof Error ? error.message : "上传失败"}。如已生成失败任务，可在下方查看详情并重试。`);
    } finally {
      if (generation === accountGeneration.current) {
        await refreshAfterTask();
        setBusy("");
      }
    }
  };

  const retryTask = async (task: IngestionTask) => {
    const generation = accountGeneration.current;
    setBusy(`retry-${task.id}`);
    setUploadError("");
    setNotice("");
    try {
      const result = await retryIngestionTask(task.id);
      if (generation !== accountGeneration.current) return;
      setNotice(result.status === "completed" ? `「${task.originalFilename}」重试成功，解析结果已入库。` : `任务当前状态：${taskStatusText[result.status]}`);
      setSelectedId(result.documentId);
    } catch (error) {
      if (generation === accountGeneration.current) setUploadError(error instanceof Error ? error.message : "重试失败");
    } finally {
      if (generation === accountGeneration.current) {
        await refreshAfterTask();
        setBusy("");
      }
    }
  };

  const removeTask = async (task: IngestionTask) => {
    if (!window.confirm(`确定删除「${task.originalFilename}」及其解析文本、知识任务和本地上传文件吗？此操作不可撤销。`)) return;
    const generation = accountGeneration.current;
    setBusy(`delete-${task.id}`);
    setUploadError("");
    try {
      await deleteIngestionTask(task.id);
      if (generation !== accountGeneration.current) return;
      if (selectedId === task.documentId) setSelectedId(null);
      setNotice(`已删除「${task.originalFilename}」及关联数据。`);
      await refreshAfterTask();
    } catch (error) {
      if (generation === accountGeneration.current) setUploadError(error instanceof Error ? error.message : "删除失败");
    } finally {
      if (generation === accountGeneration.current) setBusy("");
    }
  };

  useEffect(() => {
    previewRequest.current += 1;
    setPreview(null);
    setPreviewError("");
  }, [selectedId]);

  const openPreview = async () => {
    if (!selected) return;
    const requestId = ++previewRequest.current;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const result = await getResearchDocumentPreview(selected.id);
      if (requestId === previewRequest.current) setPreview(result);
    } catch (error) {
      if (requestId === previewRequest.current) setPreviewError(error instanceof Error ? error.message : "原文读取失败");
    } finally {
      if (requestId === previewRequest.current) setPreviewLoading(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="DOCUMENT INTELLIGENCE / 文档中心" title="让实验记录，成为知识。" description="上传、解析并追溯研究文档。文件与文本分块真实持久化，私有、团队和公开边界由服务端统一执行。" actions={<button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={!user}><Upload size={15} />选择文档</button>} />
      <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />

      <div className="inline-notice"><Info size={15} className="mt-0.5 shrink-0" /><span>文档列表来自 SQLite 真实语料。上传会同步执行解析；失败不会被标记为成功，重复文件按账号与 SHA-256 幂等处理。</span><button className="row-action ml-auto" onClick={() => void Promise.all([loadDocuments(), loadTasks()])} aria-label="刷新文档库"><RefreshCw size={14} /></button></div>
      {loadError ? <div className="form-message error" role="alert">{loadError}。未使用演示数据替代。</div> : null}
      {notice ? <div className="form-message success" role="status"><Check size={14} />{notice}</div> : null}
      {uploadError ? <div className="form-message error" role="alert">{uploadError}</div> : null}

      <section className="panel ingestion-composer" aria-label="上传新文档">
        <div
          className={`upload-zone ${dragging ? "dragging" : ""} ${selectedFile ? "has-file" : ""}`}
          onDragOver={(event) => { event.preventDefault(); if (user) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); if (user) chooseFile(event.dataTransfer.files?.[0]); }}
        >
          <span className="upload-zone-icon">{selectedFile ? <FileText size={21} /> : <CloudUpload size={21} />}</span>
          <div className="upload-zone-copy">
            <strong>{selectedFile ? selectedFile.name : user ? "拖放 PDF / DOCX 到这里" : authLoading ? "正在检查登录状态…" : "登录后上传研究文档"}</strong>
            <p>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MiB · 等待确认可见范围` : "单文件不超过 30 MiB；服务端校验格式、解析文本并持久保存。"}</p>
          </div>
          {selectedFile ? <button className="icon-button" onClick={() => setSelectedFile(null)} aria-label="取消选择文件"><X size={16} /></button> : <button className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={!user}>浏览本地文件</button>}
        </div>
        <div className="ingestion-settings">
          <label>可见范围<select value={visibility} onChange={(event) => { setVisibility(event.target.value as DocumentVisibility); setUploadError(""); }} disabled={!user || busy === "upload"}><option value="private">私有 · 仅自己可见</option><option value="team">团队 · 当前成员可见</option>{user?.role === "admin" ? <option value="public">公开 · 所有访客可见</option> : null}</select></label>
          {visibility === "team" ? <label>共享团队<select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={busy === "upload"}><option value="">请选择团队</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label> : null}
          <label>来源链接 <span>可选</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" maxLength={2048} disabled={!user || busy === "upload"} /></label>
          <label>许可 / 授权说明 <span>可选</span><input value={licenseNote} onChange={(event) => setLicenseNote(event.target.value)} placeholder="例如：本人课程实验，可用于个人研究" maxLength={500} disabled={!user || busy === "upload"} /></label>
          <div className="ingestion-submit"><p>{visibility === "public" ? "公开上传仅限管理员，提交后所有访客均可检索。" : visibility === "team" ? "成员退出团队后将立即失去此文档的访问权限。" : "私有文档不会向其他账户或管理员默认开放。"}</p><button className="btn btn-primary" onClick={() => void startUpload()} disabled={!selectedFile || !user || busy === "upload"}>{busy === "upload" ? <><RefreshCw size={14} className="animate-spin" />正在上传并解析…</> : <><Upload size={14} />上传并解析</>}</button></div>
        </div>
      </section>

      {user && tasks.length ? <section className="panel ingestion-tasks" aria-label="我的上传任务">
        <div className="panel-heading"><div><p className="eyebrow">PERSISTENT PIPELINE</p><h2 className="panel-title">我的上传任务</h2><p className="panel-subtitle">任务、错误与重试次数均保存在服务端</p></div><span>{tasks.length} 条记录</span></div>
        <div className="ingestion-task-list">{tasks.map((task) => <article className="ingestion-task" key={task.id}>
          <span className={`file-icon ${task.status === "failed" || task.status === "incomplete" ? "failed" : ""}`}><FileText size={15} /></span>
          <div className="ingestion-task-copy"><div><strong>{task.originalFilename}</strong><span className={`status-label ${task.status === "completed" ? "completed" : task.status === "failed" || task.status === "incomplete" ? "failed" : "processing"}`}>{taskStatusText[task.status]}</span></div><p>{visibilityText[task.visibility]} · 第 {task.attempts} 次处理 · {task.format.toUpperCase()}</p>{task.status === "processing" || task.status === "queued" ? <div className="ingestion-progress" aria-label={`解析进度 ${task.progress}%`}><i style={{ width: `${task.progress}%` }} /></div> : null}{task.errorMessage ? <p className="document-error">{task.errorMessage}</p> : null}</div>
          <div className="ingestion-task-actions">{task.status === "completed" ? <button className="row-action" onClick={() => setSelectedId(task.documentId)} aria-label={`查看 ${task.originalFilename}`}><ArrowUpRight size={14} /></button> : null}{task.status === "failed" || task.status === "incomplete" ? <button className="row-action" onClick={() => void retryTask(task)} disabled={busy === `retry-${task.id}`} aria-label={`重试 ${task.originalFilename}`}><RotateCcw size={14} /></button> : null}<button className="row-action danger" onClick={() => void removeTask(task)} disabled={busy === `delete-${task.id}`} aria-label={`删除 ${task.originalFilename}`}><Trash2 size={14} /></button></div>
        </article>)}</div>
      </section> : null}

      <div className="filter-bar">
        <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文档或来源机构" aria-label="搜索文档" /></label>
        <select className="select-field" value={status} onChange={(event) => setStatus(event.target.value as "all" | DocumentStatus)} aria-label="按状态筛选"><option value="all">全部状态</option><option value="completed">解析完成</option><option value="processing">正在解析</option><option value="failed">失败</option></select>
      </div>

      <div className="workspace-grid">
        <section className="panel documents-panel">
          <div className="panel-heading"><div><h2 className="panel-title">可访问研究语料</h2><p className="panel-subtitle">{filtered.length} / {documents.length} 份研究资料</p></div></div>
          {loading ? <div className="empty-state"><RefreshCw size={25} className="animate-spin" /><h3>正在读取文档库</h3></div> : filtered.length ? <div className="data-table-wrapper border-0 rounded-none"><table className="data-table"><thead><tr><th>文档</th><th>状态</th><th>更新时间</th><th>解析产出</th><th>操作</th></tr></thead><tbody>
            {filtered.map((document) => <tr key={document.id}>
              <td className="max-w-[280px]"><button className="flex w-full items-center gap-3 text-left" onClick={() => setSelectedId(document.id)}><span className="file-icon"><FileText size={15} /></span><span className="min-w-0"><span className="primary-cell block truncate">{document.title}</span><span className="mt-1 block text-[8px] text-[var(--ink-muted)]">{document.fileType} · {document.size}{document.institution ? ` · ${document.institution}` : ""}{document.visibility ? ` · ${visibilityText[document.visibility]}` : ""}</span></span></button>{document.error ? <span className="document-error">{document.error}</span> : null}</td>
              <td><span className={`status-label ${document.status}`}>{statusText[document.status]}</span></td>
              <td className="whitespace-nowrap">{document.updatedAt}</td>
              <td>{document.chunkCount ?? 0} 分块 · {document.sectionCount ?? 0} 章节</td>
              <td><span className="row-actions">{isExternalUrl(document.sourceUrl) ? <a className="row-action" href={document.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开原始来源 ${document.title}`}><ExternalLink size={13} /></a> : null}</span></td>
            </tr>)}
          </tbody></table></div> : <div className="empty-state"><FileText size={28} /><h3>没有匹配的文档</h3><p>{loadError ? "语料库暂不可用，请完成导入后刷新。" : "更换关键词或清除状态筛选。"}</p></div>}
        </section>

        <aside className="panel node-inspector">
          <div className="panel-heading"><div><p className="eyebrow">DOCUMENT DETAILS</p><h2 className="panel-title">文档详情</h2></div></div>
          {selected ? <><div className="inspector-hero"><span className="inspector-type">{selected.fileType} · {statusText[selected.status]}</span><h2 className="break-words text-[17px]">{selected.title}</h2><p>{selected.error ?? `${selected.institution || (selected.visibility === "private" ? "个人上传" : "研究语料")} · ${selected.parser || "等待解析器"}。解析状态与文本产出均来自持久数据库。`}</p></div><div className="inspector-stat-grid"><div className="inspector-stat"><strong>{selected.chunkCount ?? 0}</strong><span>文本分块</span></div><div className="inspector-stat"><strong>{selected.sectionCount ?? 0}</strong><span>识别章节</span></div></div><div className="relation-list"><h3>文件信息</h3><div className="relation-item"><span>文件大小</span><small>{selected.size}</small></div>{selected.pageCount ? <div className="relation-item"><span>PDF 页数</span><small>{selected.pageCount}</small></div> : null}{selected.textLength ? <div className="relation-item"><span>提取字符</span><small>{selected.textLength.toLocaleString("zh-CN")}</small></div> : null}<div className="relation-item"><span>可见范围</span><small>{selected.visibility ? visibilityText[selected.visibility] : "公开"}</small></div>{selected.licenseNote ? <div className="relation-item"><span>许可说明</span><small>{selected.licenseNote}</small></div> : null}</div>{selected.status === "completed" ? <button className="btn btn-secondary mt-5 w-full" onClick={() => void openPreview()} disabled={previewLoading}>{previewLoading ? "正在读取原文…" : preview ? "刷新原文预览" : "查看解析原文"}</button> : null}{previewError ? <p className="document-error">{previewError}</p> : null}{preview ? <div className="document-preview" aria-label="解析原文预览">{(preview.sections.length ? preview.sections.slice(0, 3).map((section) => ({ title: section.title, text: section.text, page: null })) : preview.chunks.slice(0, 2).map((chunk) => ({ title: chunk.pageStart ? `第 ${chunk.pageStart} 页` : "文本分块", text: chunk.text, page: chunk.pageStart }))).map((section, index) => <section key={`${section.title}-${index}`}><strong>{section.title}</strong><p>{section.text}</p></section>)}</div> : null}{selected.status === "completed" ? <KnowledgeExtractionPanel documentId={selected.id} documentTitle={selected.title} /> : null}{isExternalUrl(selected.sourceUrl) ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="btn btn-secondary mt-5 w-full">查看原始公开文件<ExternalLink size={13} /></a> : null}</> : <div className="empty-state"><FileText size={25} /><h3>选择一份文档</h3><p>查看真实解析状态、来源和文本产出。</p></div>}
        </aside>
      </div>
    </>
  );
}
