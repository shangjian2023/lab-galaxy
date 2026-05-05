"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { getTreeData } from "@/lib/api";
import type { TreeData, TreeNode } from "@/lib/api";

const NODE_COLORS: Record<string, string> = {
  Experiment: "#3b82f6",
  Equipment: "#ef4444",
  Theory: "#8b5cf6",
  Consumable: "#f59e0b",
  Tool: "#10b981",
  Concept: "#6b7280",
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const H_GAP = 80;
const V_GAP = 20;

interface Props {
  data: TreeData;
}

export default function TreeGrowthView({ data }: Props) {
  const [expanded, setExpanded] = useState<Record<string, TreeNode[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleExpand = useCallback(async (node: TreeNode) => {
    if (expanded[node.id]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
      return;
    }

    if (node.children.length === 0) {
      // Fetch children from API
      setLoadingIds((prev) => new Set(prev).add(node.id));
      try {
        const res = await getTreeData(node.id);
        setExpanded((prev) => ({ ...prev, [node.id]: res.root.children }));
      } catch {
        // ignore
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
      }
    } else {
      setExpanded((prev) => ({ ...prev, [node.id]: node.children }));
    }
  }, [expanded]);

  // Compute layout
  const layout = useCallback((): { nodes: LayoutNode[]; edges: Edge[] } => {
    const nodes: LayoutNode[] = [];
    const edges: Edge[] = [];

    function measureSubtree(node: TreeNode, expandedMap: Record<string, TreeNode[]>): number {
      const children = expandedMap[node.id] || node.children;
      if (children.length === 0) return NODE_HEIGHT;
      let total = 0;
      for (const child of children) {
        total += measureSubtree(child, expandedMap);
      }
      total += (children.length - 1) * V_GAP;
      return Math.max(NODE_HEIGHT, total);
    }

    function layoutNode(node: TreeNode, x: number, yStart: number, depth: number, expandedMap: Record<string, TreeNode[]>) {
      const subtreeH = measureSubtree(node, expandedMap);
      const y = yStart + subtreeH / 2 - NODE_HEIGHT / 2;

      nodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        summary: node.summary,
        x,
        y,
        hasChildren: node.children.length > 0 || (expandedMap[node.id]?.length ?? 0) > 0,
      });

      const children = expandedMap[node.id] || node.children;
      if (children.length > 0) {
        const childX = x + NODE_WIDTH + H_GAP;
        let childY = yStart;
        for (const child of children) {
          const childSubH = measureSubtree(child, expandedMap);
          layoutNode(child, childX, childY, depth + 1, expandedMap);
          const parentCenterY = y + NODE_HEIGHT / 2;
          const childCenterY = childY + childSubH / 2;
          edges.push({
            id: `${node.id}-${child.id}`,
            x1: x + NODE_WIDTH,
            y1: parentCenterY,
            x2: childX,
            y2: childCenterY,
          });
          childY += childSubH + V_GAP;
        }
      }
    }

    const root = data.root;
    const totalH = measureSubtree(root, expanded);
    layoutNode(root, 40, 40, 0, expanded);

    return { nodes, edges };
  }, [data, expanded]);

  const { nodes: layoutNodes, edges: layoutEdges } = layout();

  // Auto-scroll to fit content
  useEffect(() => {
    if (containerRef.current) {
      const maxX = Math.max(...layoutNodes.map((n) => n.x + NODE_WIDTH + 80), 600);
      const maxY = Math.max(...layoutNodes.map((n) => n.y + NODE_HEIGHT + 80), 400);
      containerRef.current.style.minWidth = `${maxX}px`;
      containerRef.current.style.minHeight = `${maxY}px`;
    }
  }, [layoutNodes]);

  return (
    <div className="overflow-auto p-4">
      <div ref={containerRef} className="relative">
        <svg className="absolute inset-0" width="100%" height="100%">
          {layoutEdges.map((edge) => (
            <path
              key={edge.id}
              d={`M ${edge.x1} ${edge.y1} C ${edge.x1 + H_GAP / 2} ${edge.y1}, ${edge.x2 - H_GAP / 2} ${edge.y2}, ${edge.x2} ${edge.y2}`}
              fill="none"
              stroke="#d1d5db"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        {layoutNodes.map((node) => {
          const color = NODE_COLORS[node.type] || NODE_COLORS.Concept;
          const isLoading = loadingIds.has(node.id);
          return (
            <div
              key={node.id}
              className="absolute cursor-pointer rounded-lg border bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md"
              style={{
                left: node.x,
                top: node.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                borderColor: color,
                borderLeftWidth: 3,
              }}
              onClick={() => node.hasChildren ? toggleExpand(data.root.id === node.id ? data.root : { ...node, children: expanded[node.id] || [] }) : undefined}
              title={node.summary}
            >
              <p className="truncate text-xs font-semibold" style={{ color }}>
                {node.type}
              </p>
              <p className="truncate text-sm font-medium text-gray-800">
                {node.name}
              </p>
              {isLoading && (
                <p className="text-xs text-gray-400">加载中...</p>
              )}
              {node.hasChildren && !isLoading && (
                <p className="text-xs text-gray-400">
                  {expanded[node.id] ? "收起 ▲" : "展开 ▶"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface LayoutNode {
  id: string;
  name: string;
  type: string;
  summary: string;
  x: number;
  y: number;
  hasChildren: boolean;
}

interface Edge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
