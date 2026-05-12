"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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

  const graphIndex = useMemo(() => {
    const degreeById = new Map<string, number>();
    const adjacentById = new Map<string, Set<string>>();
    for (const n of cyNodes) {
      degreeById.set(n.data.id, 0);
      adjacentById.set(n.data.id, new Set([n.data.id]));
    }
    for (const e of cyEdges) {
      const { source, target } = e.data;
      degreeById.set(source, (degreeById.get(source) ?? 0) + 1);
      degreeById.set(target, (degreeById.get(target) ?? 0) + 1);
      adjacentById.get(source)?.add(target);
      adjacentById.get(target)?.add(source);
    }
    return { degreeById, adjacentById };
  }, [cyNodes, cyEdges]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        setDims((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
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
          forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(50).strength(0.8),
        )
        .force("charge", forceManyBody<SimNode>().strength(-80))
        .force("center", forceCenter(cx, cy).strength(0.3))
        .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4))
        .alpha(1)
        .alphaDecay(0.03);

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
      degree: graphIndex.degreeById.get(n.data.id) ?? 0,
      opacity: 1,
    }));

    const links: SimLink[] = cyEdges.map((e) => ({
      source: e.data.source,
      target: e.data.target,
      confidence: e.data.confidence,
      edgeType: e.data.type,
    }));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const sim = buildSim(nodes, links);

    sim.on("tick", () => {
      const sel = (sel: string) => svg.querySelectorAll(sel);
      sel(".mg-node").forEach((el) => {
        const n = nodeById.get(el.getAttribute("data-id") || "");
        if (n && n.x != null && n.y != null) {
          el.setAttribute("cx", String(n.x));
          el.setAttribute("cy", String(n.y));
        }
      });
      sel(".mg-label").forEach((el) => {
        const n = nodeById.get(el.getAttribute("data-id") || "");
        if (n && n.x != null && n.y != null) {
          el.setAttribute("x", String(n.x));
          el.setAttribute("y", String(n.y + nodeRadius(n) + 14));
        }
      });
      sel(".mg-edge").forEach((el) => {
        const s = nodeById.get(el.getAttribute("data-source") || "");
        const t = nodeById.get(el.getAttribute("data-target") || "");
        if (s?.x != null && s?.y != null && t?.x != null && t?.y != null) {
          el.setAttribute("x1", String(s.x));
          el.setAttribute("y1", String(s.y));
          el.setAttribute("x2", String(t.x));
          el.setAttribute("y2", String(t.y));
        }
      });
    });

    return () => { sim.stop(); };
  }, [cyNodes, cyEdges, graphIndex, buildSim]);

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
          const isConnected = !hoveredNode || graphIndex.adjacentById.get(n.data.id)?.has(hoveredNode.id);

          return (
            <g key={n.data.id}>
              <circle
                className="mg-node"
                data-id={n.data.id}
                cx={dims.w / 2}
                cy={dims.h / 2}
                r={RADIUS + (graphIndex.degreeById.get(n.data.id) ?? 0) * 1.5}
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
