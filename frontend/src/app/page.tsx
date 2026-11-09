"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  FileText,
  FlaskConical,
  Network,
  Plus,
  Share2,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ResearchAssistant } from "@/components/assistant/ResearchAssistant";
import { HaloGraph } from "@/components/graph/HaloGraph";
import { demoDocuments, demoGraph } from "@/lib/demo-data";
import type { KnowledgeNode } from "@/lib/research-types";

const statusText = { completed: "解析完成", processing: "正在解析", review: "等待审核", ready: "等待上传", failed: "解析失败" } as const;

export default function HomePage() {
  const [selected, setSelected] = useState<KnowledgeNode | null>(demoGraph.nodes[0]);
  const stats = [
    { label: "知识实体", value: demoGraph.nodes.length, detail: "3 类研究知识", icon: Network, color: "#79d9c0", glow: "rgba(121,217,192,.09)" },
    { label: "关系连接", value: demoGraph.edges.length, detail: "形成可追溯路径", icon: Share2, color: "#75a9e9", glow: "rgba(57,135,229,.09)" },
    { label: "实验文档", value: demoDocuments.length, detail: "2 份今天更新", icon: FileText, color: "#e58a62", glow: "rgba(217,89,38,.08)" },
    { label: "核心实验", value: demoGraph.nodes.filter((node) => node.group === "experiment").length, detail: "共享 1 组方法", icon: FlaskConical, color: "#82bfa6", glow: "rgba(25,158,112,.09)" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="RESEARCH OVERVIEW / 研究概览"
        title="让知识，彼此照亮。"
        description="把分散的实验记录转化为可探索、可追溯、可生长的知识网络。早上好，研究员。"
        actions={
          <>
            <Link href="/graph" className="btn btn-secondary"><Network size={15} />探索星图</Link>
            <Link href="/documents" className="btn btn-primary"><Plus size={16} />导入文档</Link>
          </>
        }
      />

      <section className="stat-grid" aria-label="研究数据统计">
        {stats.map((stat) => (
          <article className="panel stat-card" key={stat.label} style={{ "--stat-color": stat.color, "--stat-glow": stat.glow } as React.CSSProperties}>
            <div className="stat-top"><span>{stat.label}</span><span className="stat-icon"><stat.icon size={15} /></span></div>
            <div className="stat-value">{stat.value.toString().padStart(2, "0")}</div>
            <div className="stat-detail">{stat.detail}</div>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel graph-panel" aria-labelledby="knowledge-halo-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow"><Activity size={13} />LIVE KNOWLEDGE FIELD</p>
              <h2 className="panel-title" id="knowledge-halo-title">知识星环</h2>
              <p className="panel-subtitle">每一个光点都是实体，每一次流动都沿着真实关系。</p>
            </div>
            <Link href="/graph" className="text-link">进入完整星图<ArrowUpRight size={13} /></Link>
          </div>
          <HaloGraph data={demoGraph} compact selectedId={selected?.id} onSelect={setSelected} />
          <div className="graph-selection">
            <span className="selection-icon"><Sparkles size={15} /></span>
            <div className="selection-copy">
              <strong>{selected?.name ?? "选择一个知识实体"}</strong>
              <p>{selected?.summary ?? "点击星环中的节点，查看实体说明与关联。"}</p>
            </div>
            {selected ? <Link href={`/graph?node=${selected.id}`} className="selection-type">{selected.type}<ChevronRight size={12} className="ml-1 inline" /></Link> : null}
          </div>
        </section>
        <ResearchAssistant compact />
      </div>

      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">RECENT DOCUMENTS</p><h2 className="panel-title">最近研究文档</h2></div>
            <Link href="/documents" className="text-link">全部文档<ArrowRight size={12} /></Link>
          </div>
          <div className="document-list">
            {demoDocuments.slice(0, 3).map((document) => (
              <Link href="/documents" className="document-row" key={document.id}>
                <span className="file-icon"><FileText size={16} /></span>
                <span className="document-copy"><strong>{document.title}</strong><span>{document.updatedAt} · {document.size}</span></span>
                <span className={`status-label ${document.status}`}>{statusText[document.status]}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">KNOWLEDGE PULSE</p><h2 className="panel-title">知识动态</h2></div></div>
          <ul className="insight-list">
            <li><strong>发现新的跨实验关联</strong>「XRD 表征」连接了光催化与钙钛矿两组实验。<time>今天 14:36</time></li>
            <li><strong>实验结论已更新</strong>产氢速率对比结果已关联至肖特基结理论。<time>今天 14:32</time></li>
            <li><strong>文档进入解析流程</strong>XRD 表征数据汇总正在提取实验参数。<time>昨天 18:40</time></li>
          </ul>
        </section>
      </div>
    </>
  );
}
