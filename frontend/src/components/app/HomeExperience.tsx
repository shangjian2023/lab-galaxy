import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, FileText, Network, Plus } from "lucide-react";
import { ResearchAssistant } from "@/components/assistant/ResearchAssistant";
import type { CorpusDocumentRow } from "@/lib/corpus-db";
import { cardArtifactForTitle } from "@/lib/card-artifacts";
import { HomeHeroArt } from "@/components/app/HomeHeroArt";
import { HomeCapabilityChapters } from "@/components/app/HomeCapabilityChapters";
import { HomeFooterReveal } from "@/components/app/HomeFooterReveal";

interface HomeExperienceProps {
  stats: { documents: number; chunks: number; institutions: number; characters: number };
  documents: CorpusDocumentRow[];
  loadError: string;
}

export function HomeExperience({ stats, documents, loadError }: HomeExperienceProps) {
  const ledger = [
    { label: "实验档案", value: stats.documents.toLocaleString("zh-CN"), note: "真实公开报告与有权文档" },
    { label: "原文分块", value: stats.chunks.toLocaleString("zh-CN"), note: "可检索、可回到原文" },
    { label: "来源机构", value: stats.institutions.toLocaleString("zh-CN"), note: "公开研究语料来源" },
    { label: "解析字符", value: stats.characters >= 10000 ? `${(stats.characters / 10000).toFixed(1)} 万` : stats.characters.toLocaleString("zh-CN"), note: "来自持久化解析结果" },
  ];

  return (
    <div className="atlas-home">
      <section className="atlas-home-hero">
        <div className="atlas-home-hero-copy">
          <p className="atlas-kicker"><span />LAB KNOWLEDGE ATLAS · 创新实验知识图谱</p>
          <h1>让知识，<br /><em>彼此照亮。</em></h1>
          <p className="atlas-home-intro">把散落的实验记录整理成一座可阅读、可追问、可生长的知识馆。沿着文档与证据，重新发现每一次实验之间的联系。</p>
          <div className="atlas-hero-actions">
            <Link href="/graph" className="btn btn-primary"><Network size={16} />进入知识星图<ArrowUpRight size={14} /></Link>
            <Link href="/documents" className="atlas-text-action">翻阅实验档案<ArrowRight size={15} /></Link>
          </div>
        </div>
        <HomeHeroArt />
        <aside className="atlas-hero-folio" aria-label="研究馆藏品索引">
          <span className="atlas-folio-number">Nº {String(stats.documents).padStart(3, "0")}</span>
          <div className="atlas-folio-rule" />
          <p>COMPUTER SCIENCE<br />RESEARCH COLLECTION</p>
          <strong>{stats.documents}</strong>
          <span>份真实实验报告</span>
          <small>公开语料与当前账号可见文档<br />每一条回答都应回到证据</small>
        </aside>
        <span className="atlas-hero-side-note" aria-hidden="true">DOCUMENTS INTO KNOWLEDGE · KNOWLEDGE INTO DISCOVERY</span>
      </section>

      {loadError ? <div className="form-message error" role="alert">{loadError}。页面没有用演示文档替代真实档案。</div> : null}

      <section className="atlas-ledger tactile-ledger" aria-label="真实语料统计">
        {ledger.map((item, index) => <article className={`tactile-card tone-${index % 8}`} key={item.label}><span className="atlas-ledger-index">0{index + 1}</span><div><p>{item.label}</p><strong>{item.value}</strong><small>{item.note}</small></div></article>)}
      </section>

      <HomeCapabilityChapters />

      <section className="atlas-home-assistant" aria-label="研究助手">
        <ResearchAssistant compact />
      </section>

      <section className="atlas-recent-archive">
        <div className="atlas-section-heading"><div><p className="atlas-kicker"><span />RECENT ACQUISITIONS</p><h2>新近入馆的实验档案</h2></div><Link href="/documents" className="atlas-text-action">查看完整档案<ArrowRight size={15} /></Link></div>
        {documents.length ? <div className="atlas-recent-grid tactile-grid">{documents.map((document, index) => (
          <Link href={`/documents?doc=${encodeURIComponent(document.id)}`} className={`atlas-recent-document tactile-card tone-${index % 8}`} key={document.id}>
            <div className="atlas-recent-top"><span>{String(index + 1).padStart(2, "0")} / {document.format.toUpperCase()}</span><ArrowUpRight size={15} /></div>
            <span className={`atlas-document-seal artifact-${cardArtifactForTitle(document.title)}`} data-parallax="card-artifact"><FileText size={22} strokeWidth={1.35} /></span>
            <h3>{document.title}</h3>
            <p>{document.institution || "公开研究语料"}</p>
            <footer><span>{document.chunkCount} 个原文分块</span><span>{document.pageCount ? `${document.pageCount} 页` : `${document.sectionCount} 章节`}</span></footer>
          </Link>
        ))}</div> : <div className="atlas-archive-empty"><BookOpen size={28} /><h3>研究档案仍为空</h3><p>完成文档解析后，真实报告会出现在这里。</p><Link href="/documents" className="btn btn-primary"><Plus size={15} />导入第一份文档</Link></div>}
      </section>

      <HomeFooterReveal />
    </div>
  );
}
