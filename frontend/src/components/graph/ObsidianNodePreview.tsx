"use client";

import { useMemo } from "react";
import { ArrowRight, FileText, Network } from "lucide-react";
import { groupMeta } from "@/lib/demo-data";
import type { KnowledgeEdge, KnowledgeNode } from "@/lib/research-types";

interface ObsidianNodePreviewProps {
  node: KnowledgeNode;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  onExplore: (id: string) => void;
  showAction?: boolean;
  onNavigate?: () => void;
}

export function ObsidianNodePreview({
  node,
  nodes,
  edges,
  onExplore,
  showAction = true,
  onNavigate,
}: ObsidianNodePreviewProps) {
  const neighbors = useMemo(() => {
    const byId = new Map(nodes.map((item) => [item.id, item]));
    return edges.flatMap((edge) => {
      const id = edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null;
      const neighbor = id ? byId.get(id) : null;
      return neighbor ? [{ node: neighbor, relation: edge.relation }] : [];
    });
  }, [edges, node.id, nodes]);

  return (
    <div className="graph-node-preview">
      <div className="graph-node-preview__eyebrow">
        <span><i style={{ background: groupMeta[node.group].color }} />{node.type} · {groupMeta[node.group].label}</span>
        <span>{neighbors.length} 条关系</span>
      </div>
      <h3>{node.name}</h3>
      <p className="graph-node-preview__summary">{node.summary || "暂无节点摘要"}</p>
      <p className="graph-node-preview__source-note">演示知识 · {node.year} 年</p>

      {neighbors.length > 0 ? (
        <div className="graph-node-preview__neighbors">
          <span className="graph-node-preview__label">直接关联</span>
          <ul>
            {neighbors.slice(0, 4).map(({ node: neighbor, relation }) => (
              <li key={`${neighbor.id}-${relation}`}>
                <button type="button" onClick={() => { onNavigate?.(); onExplore(neighbor.id); }} title={`探索 ${neighbor.name}`}>
                  <span>{relation}</span>
                  <strong>{neighbor.name}</strong>
                  <ArrowRight size={13} />
                </button>
              </li>
            ))}
          </ul>
          {neighbors.length > 4 ? <span className="graph-node-preview__more">另有 {neighbors.length - 4} 条关联，可在节点详情中查看</span> : null}
        </div>
      ) : <p className="graph-node-preview__source-note">当前筛选范围内没有直接关联</p>}

      {node.documentId ? (
        <div className="graph-node-preview__document">
          <a href={`/documents?doc=${encodeURIComponent(node.documentId)}`} onClick={onNavigate}>
            <FileText size={14} />打开关联文档<ArrowRight size={13} />
          </a>
        </div>
      ) : null}

      {showAction ? (
        <button type="button" className="graph-node-preview__explore" onClick={() => { onNavigate?.(); onExplore(node.id); }}>
          <Network size={15} />从这里探索关系<ArrowRight size={14} />
        </button>
      ) : null}
    </div>
  );
}
