import Link from "next/link";
import { Network, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ResearchAssistant } from "@/components/assistant/ResearchAssistant";
import { getCorpusStats, listCorpusDocuments, type CorpusDocumentRow } from "@/lib/corpus-db";
import { getCurrentViewer } from "@/lib/server-auth";

export const metadata = { title: "研究助手" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  let stats = { documents: 0, chunks: 0, institutions: 0, characters: 0 };
  let recentDocuments: CorpusDocumentRow[] = [];
  let loadError = "";
  const viewer = await getCurrentViewer();
  try {
    stats = getCorpusStats(viewer);
    recentDocuments = listCorpusDocuments("", "parsed", 3, viewer);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "语料库暂不可用";
  }
  return (
    <>
      <PageHeader eyebrow="RESEARCH COPILOT / 研究助手" title="提问，也要知其来源。" description="围绕真实实验报告进行全文检索，由 Qwen 依据命中原文回答。每一条证据都能回到公开文档与页码。" actions={<Link href="/graph" className="btn btn-secondary"><Network size={15} />查看知识来源</Link>} />
      <div className="assistant-page-grid">
        <ResearchAssistant />
        <aside className="panel context-card">
          <div className="panel-heading"><div><p className="eyebrow"><ShieldCheck size={13} />GROUNDED CONTEXT</p><h2 className="panel-title">当前检索范围</h2><p className="panel-subtitle">{loadError ? "语料库暂不可用" : "本地真实实验报告语料"}</p></div></div>
          <div className="inspector-stat-grid mt-5"><div className="inspector-stat"><strong>{stats.chunks}</strong><span>可检索分块</span></div><div className="inspector-stat"><strong>{stats.documents}</strong><span>研究文档</span></div></div>
          <div className="context-list"><h3 className="mb-2 text-[9px] font-medium text-[var(--ink-muted)]">最近来源</h3>{recentDocuments.map((document) => <div className="context-item" key={document.id}><strong>{document.title}</strong><p>{document.institution || "公开来源"} · {document.chunkCount} 个分块</p><span>{document.pageCount ? `${document.pageCount} 页` : document.format.toUpperCase()}</span></div>)}{loadError ? <div className="inline-notice">{loadError}</div> : null}</div>
          <div className="inline-notice mt-5">当前采用本地全文检索与 Qwen 证据回答，尚未完成向量召回。问答仅对已审核账号开放；检索会按公开、本人私有及所在团队范围过滤，公开原文会随问题发送至模型服务。</div>
        </aside>
      </div>
    </>
  );
}
