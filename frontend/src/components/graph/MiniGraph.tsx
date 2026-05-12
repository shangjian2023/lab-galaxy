"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceLink,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { CytoscapeNode, CytoscapeEdge } from "@/lib/api";

interface SimNode extends SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  summary: string;
  color: string;
  degree: number;
  opacity: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  confidence: number;
  edgeType: string;
}

interface Props {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
  width?: number;
  height?: number;
}

const RADIUS = 8;

function nodeRadius(n: SimNode) {
  return RADIUS + n.degree * 1.5;
}

export default function MiniGraph({ nodes: cyNodes, edges: cyEdges, width = 400, height = 320 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: width, h: height });
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [hoveredPos, setHoveredPos] = useState({ x: 0, y: 0 });

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) setDims({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const buildSim = useCallback(
    (nodes: SimNode[], links: SimLink[]) => {
      const cx = dims.w / 2;
      const cy = dims.h / 2;
      const r = Math.min(dims.w, dims.h) * 0.3;
      for (let i = 0; i < nodes.length; i++) {
        const angle = (2 * Math.PI * i) / nodes.length;
        nodes[i].x = cx + r * Math.cos(angle);
        nodes[i].y = cy + r * Math.sin(angle);
      }

      const sim = forceSimulation<SimNode, SimLink>(nodes)
        .force(
          "link",
          forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(60).strength(0.6),
        )
        .force("charge", forceManyBody<SimNode>().strength(-150))
        .force("center", forceCenter(cx, cy).strength(0.05))
        .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4))
        .alpha(1)
        .alphaDecay(0.02);

      return sim;
    },
    [dims.w, dims.h],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    if (!cyNodes.length) return;

    const nodes: SimNode[] = cyNodes.map((n) => ({
      id: n.data.id,
      name: n.data.name,
      type: n.data.type,
      summary: n.data.summary,
      color: n.data.color || "#6b7280",
      degree: 0,
      opacity: 1,
    }));

    const links: SimLink[] = cyEdges.map((e) => ({
      source: e.data.source,
      target: e.data.target,
      confidence: e.data.confidence,
      edgeType: e.data.type,
    }));

    // Compute degree
    const deg: Record<string, number> = {};
    for (const n of nodes) deg[n.id] = 0;
    for (const l of links) {
      const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
      const t = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
      if (deg[s] !== undefined) deg[s]++;
      if (deg[t] !== undefined) deg[t]++;
    }
    for (const n of nodes) n.degree = deg[n.id] || 0;

    const sim = buildSim(nodes, links);

    // Build connected set for hovered node
    const connectedMap = new Map<string, Set<string>>();
    for (const n of nodes) connectedMap.set(n.id, new Set([n.id]));
    for (const l of links) {
      const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
      const t = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
      if (connectedMap.has(s)) connectedMap.get(s)!.add(t);
      if (connectedMap.has(t)) connectedMap.get(t)!.add(s);
    }

    sim.on("tick", () => {
      const sel = (sel: string) => svg.querySelectorAll(sel);
      // Update node positions
      sel(".mg-node").forEach((el) => {
        const n = nodes.find((n) => n.id === el.getAttribute("data-id"));
        if (n && n.x != null && n.y != null) {
          el.setAttribute("cx", String(n.x));
          el.setAttribute("cy", String(n.y));
        }
      });
      sel(".mg-label").forEach((el) => {
        const n = nodes.find((n) => n.id === el.getAttribute("data-id"));
        if (n && n.x != null && n.y != null) {
          el.setAttribute("x", String(n.x));
          el.setAttribute("y", String(n.y + nodeRadius(n) + 14));
        }
      });
      // Update edges
      sel(".mg-edge").forEach((el) => {
        const sId = el.getAttribute("data-source");
        const tId = el.getAttribute("data-target");
        const s = nodes.find((n) => n.id === sId);
        const t = nodes.find((n) => n.id === tId);
        if (s?.x != null && s?.y != null && t?.x != null && t?.y != null) {
          el.setAttribute("x1", String(s.x));
          el.setAttribute("y1", String(s.y));
          el.setAttribute("x2", String(t.x));
          el.setAttribute("y2", String(t.y));
        }
      });
    });

    return () => { sim.stop(); };
  }, [cyNodes, cyEdges, buildSim]);

  if (!cyNodes.length) {
    return (
      <div ref={containerRef} className="flex h-80 w-full items-center justify-center rounded-xl bg-black/5 text-sm text-gray-500">
        暂无图谱数据
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-80 w-full overflow-hidden rounded-xl bg-black/5">
      <svg ref={svgRef} width={dims.w} height={dims.h} className="absolute inset-0">
        {/* Edges */}
        {cyEdges.map((e) => (
          <line
            key={e.data.id ?? `${e.data.source}-${e.data.target}-${e.data.type}`}
            className="mg-edge"
            data-source={e.data.source}
            data-target={e.data.target}
            stroke="rgba(156,163,175,0.4)"
            strokeWidth={1 + e.data.confidence * 2}
          />
        ))}
        {/* Nodes */}
        {cyNodes.map((n) => {
          const isHovered = hoveredNode?.id === n.data.id;
          const relatedIds = new Set<string>();
          relatedIds.add(n.data.id);
          for (const e of cyEdges) {
            const s = typeof e.data.source === "string" ? e.data.source : "";
            const t = typeof e.data.target === "string" ? e.data.target : "";
            if (s === n.data.id) relatedIds.add(t);
            if (t === n.data.id) relatedIds.add(s);
          }
          const isConnected = !hoveredNode || relatedIds.has(hoveredNode.id);

          return (
            <g key={n.data.id}>
              <circle
                className="mg-node"
                data-id={n.data.id}
                cx={dims.w / 2}
                cy={dims.h / 2}
                r={RADIUS + (cyEdges.filter((e) => e.data.source === n.data.id || e.data.target === n.data.id).length) * 1.5}
                fill={n.data.color || "#6b7280"}
                opacity={isConnected ? 1 : 0.15}
                stroke={isHovered ? "#fff" : "rgba(255,255,255,0.6)"}
                strokeWidth={isHovered ? 3 : 1.5}
                onMouseEnter={(e) => {
                  setHoveredNode({
                    id: n.data.id,
                    name: n.data.name,
                    type: n.data.type,
                    summary: n.data.summary,
                    color: n.data.color || "#6b7280",
                    degree: 0,
                    opacity: 1,
                  });
                  setHoveredPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredNode(null)}
              />
              <text
                className="mg-label"
                data-id={n.data.id}
                x={dims.w / 2}
                y={dims.h / 2 + RADIUS + 14}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(0,0,0,0.7)"
                style={{ pointerEvents: "none" }}
              >
                {n.data.name}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Tooltip */}
      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-black/80 px-3 py-2 text-xs text-white"
          style={{
            left: hoveredPos.x - 80,
            top: hoveredPos.y - 60,
            width: 160,
          }}
        >
          <div className="font-medium">{hoveredNode.name}</div>
          <div className="text-gray-400">{hoveredNode.type}</div>
          {hoveredNode.summary && (
            <div className="mt-1 text-gray-300 line-clamp-2">{hoveredNode.summary}</div>
          )}
        </div>
      )}
    </div>
  );
}
