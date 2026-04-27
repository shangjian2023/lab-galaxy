"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceLink,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { drag } from "d3-drag";
import { select } from "d3-selection";
import type { CytoscapeData, TimelineEntry } from "@/lib/api";

// ── Types ──

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  name: string;
  type: string;
  summary: string;
  color: string;
  document_id: string | null;
  baseSize: number;
  degree: number;
  opacity: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  confidence: number;
  edgeType: string;
}

export interface ForceSettings {
  repel: number;
  linkDistance: number;
  nodeSize: number;
  linkWidth: number;
}

interface Props {
  data: CytoscapeData;
  timelineData?: TimelineEntry[];
  onNodeClick: (node: {
    id: string;
    name: string;
    type: string;
    summary: string;
    color: string;
    document_id: string | null;
  }) => void;
  highlightedNodeId: string | null;
  queryHighlightedNodes?: string[];
  forceSettings: ForceSettings;
  timelineMode: boolean;
  onTimelineDone?: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  Experiment: "#3b82f6",
  Equipment: "#ef4444",
  Theory: "#8b5cf6",
  Consumable: "#f59e0b",
  Tool: "#10b981",
  Concept: "#6b7280",
};

const DEFAULT_SETTINGS: ForceSettings = {
  repel: -200,
  linkDistance: 80,
  nodeSize: 1,
  linkWidth: 1,
};

// ── Component ──

export default function GalaxyView({
  data,
  timelineData,
  onNodeClick,
  highlightedNodeId,
  queryHighlightedNodes = [],
  forceSettings,
  timelineMode,
  onTimelineDone,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode, SimLink>> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const hoveredRef = useRef<SimNode | null>(null);
  const rafRef = useRef<number>(0);
  const zoomBehaviorRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // Refs for values that change often — avoids re-creating the render loop
  const highlightedRef = useRef(highlightedNodeId);
  highlightedRef.current = highlightedNodeId;
  const queryHLRef = useRef(queryHighlightedNodes);
  queryHLRef.current = queryHighlightedNodes;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const fsRef = useRef({ ...DEFAULT_SETTINGS, ...forceSettings });
  fsRef.current = { ...DEFAULT_SETTINGS, ...forceSettings };

  const fs = fsRef.current;

  // ── Resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Build simulation ──
  const buildSim = useCallback(
    (nodes: SimNode[], links: SimLink[]) => {
      if (simRef.current) simRef.current.stop();

      // Scatter initial positions around center
      for (const n of nodes) {
        if (n.x == null) {
          n.x = dims.w / 2 + (Math.random() - 0.5) * dims.w * 0.6;
          n.y = dims.h / 2 + (Math.random() - 0.5) * dims.h * 0.6;
        }
      }

      const sim = forceSimulation<SimNode, SimLink>(nodes)
        .force(
          "link",
          forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .distance(fsRef.current.linkDistance)
        )
        .force("charge", forceManyBody<SimNode>().strength(fsRef.current.repel))
        .force("center", forceCenter(dims.w / 2, dims.h / 2).strength(0.05))
        .force("collide", forceCollide<SimNode>().radius((d) => radius(d) + 4))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

      simRef.current = sim;
      nodesRef.current = nodes;
      linksRef.current = links;
    },
    [dims.w, dims.h]
  );

  // ── Compute degree ──
  function computeDegree(nodes: SimNode[], links: SimLink[]) {
    const deg: Record<string, number> = {};
    for (const n of nodes) deg[n.id] = 0;
    for (const l of links) {
      const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
      const t = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
      if (deg[s] !== undefined) deg[s]++;
      if (deg[t] !== undefined) deg[t]++;
    }
    for (const n of nodes) n.degree = deg[n.id] || 0;
  }

  function radius(n: SimNode) {
    return Math.max(4, (6 + n.degree * 2.5) * fsRef.current.nodeSize);
  }

  // ── Load data into simulation ──
  useEffect(() => {
    if (!data.nodes.length) {
      nodesRef.current = [];
      linksRef.current = [];
      hoveredRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = "default";
      }
      simRef.current?.stop();
      simRef.current = null;
      return;
    }

    const nodes: SimNode[] = data.nodes.map((n) => ({
      id: n.data.id,
      label: n.data.label,
      name: n.data.name,
      type: n.data.type,
      summary: n.data.summary,
      color: n.data.color || TYPE_COLORS[n.data.type] || "#6b7280",
      document_id: n.data.document_id,
      baseSize: n.data.size || 20,
      degree: 0,
      opacity: 1,
    }));

    const links: SimLink[] = data.edges.map((e) => ({
      source: e.data.source,
      target: e.data.target,
      confidence: e.data.confidence,
      edgeType: e.data.type,
    }));

    computeDegree(nodes, links);
    buildSim(nodes, links);
  }, [data, buildSim]);

  // ── Update force params on settings change ──
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const linkF = sim.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>>;
    const chargeF = sim.force("charge") as ReturnType<typeof forceManyBody<SimNode>>;
    if (linkF) linkF.distance(fs.linkDistance);
    if (chargeF) chargeF.strength(fs.repel);
    sim.alpha(0.3).restart();
  }, [fs.repel, fs.linkDistance]);

  // ── Pan to highlighted node ──
  useEffect(() => {
    if (!highlightedNodeId || !zoomBehaviorRef.current || !canvasRef.current) return;
    const node = nodesRef.current.find((n) => n.id === highlightedNodeId);
    if (!node || node.x == null) return;
    const canvas = canvasRef.current;
    const t = transformRef.current;
    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const scale = t.k;
    // Smooth pan via zoom transform
    const targetTransform = zoomIdentity.translate(cx - node.x! * scale, cy - node.y! * scale).scale(scale);
    zoomBehaviorRef.current.transform(select(canvas), targetTransform);
  }, [highlightedNodeId, dims]);

  // ── Setup canvas, zoom, drag, render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // DPR
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Zoom behavior
    const zb = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
      });
    select(canvas).call(zb);
    zoomBehaviorRef.current = zb;

    // Drag behavior
    select(canvas).call(
      drag<HTMLCanvasElement, unknown>()
        .subject((event) => {
          const [mx, my] = transformPoint(event.x, event.y);
          return findNode(mx, my);
        })
        .on("start", (event) => {
          const n = event.subject as SimNode;
          if (!n || !n.id) return;
          n.fx = n.x;
          n.fy = n.y;
          simRef.current?.alphaTarget(0.3).restart();
        })
        .on("drag", (event) => {
          const n = event.subject as SimNode;
          if (!n || !n.id) return;
          const [mx, my] = transformPoint(event.x, event.y);
          n.fx = mx;
          n.fy = my;
        })
        .on("end", (event) => {
          const n = event.subject as SimNode;
          if (!n || !n.id) return;
          n.fx = null;
          n.fy = null;
          simRef.current?.alphaTarget(0);
        })
    );

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const [mx, my] = transformPoint(e.clientX - rect.left, e.clientY - rect.top);
      const node = findNode(mx, my);
      if (node) {
        onNodeClickRef.current({
          id: node.id,
          name: node.name,
          type: node.type,
          summary: node.summary,
          color: node.color,
          document_id: node.document_id,
        });
      }
    };

    canvas.addEventListener("click", handleClick);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const [mx, my] = transformPoint(e.clientX - rect.left, e.clientY - rect.top);
      hoveredRef.current = findNode(mx, my);
      canvas.style.cursor = hoveredRef.current ? "pointer" : "default";
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    // Helper: transform screen coords → sim coords
    function transformPoint(sx: number, sy: number): [number, number] {
      const t = transformRef.current;
      return [(sx - t.x) / t.k, (sy - t.y) / t.k];
    }

    // Helper: find node under point
    function findNode(x: number, y: number): SimNode | null {
      for (let i = nodesRef.current.length - 1; i >= 0; i--) {
        const n = nodesRef.current[i];
        if (n.x == null) continue;
        const r = radius(n) + 3;
        const dx = (n.x ?? 0) - x;
        const dy = (n.y ?? 0) - y;
        if (dx * dx + dy * dy < r * r) return n;
      }
      return null;
    }

    // ── Render loop ──
    function render() {
      const t = transformRef.current;
      const currentFS = fsRef.current;
      const currentHL = highlightedRef.current;
      const currentQHL = queryHLRef.current;

      ctx.clearRect(0, 0, dims.w, dims.h);

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const querySet = new Set(currentQHL);
      const hasHighlight = !!currentHL || querySet.size > 0;
      const highlightSet = new Set<string>();
      if (currentHL) highlightSet.add(currentHL);
      for (const id of currentQHL) highlightSet.add(id);

      // Dimmed set: if highlighting, dim nodes not in set
      const dimmed = hasHighlight ? new Set<string>() : null;
      if (hasHighlight) {
        const connected = new Set<string>();
        for (const id of highlightSet) connected.add(id);
        // Add 1-hop neighbors
        for (const l of linksRef.current) {
          const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
          const tg = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
          if (highlightSet.has(s)) connected.add(tg);
          if (highlightSet.has(tg)) connected.add(s);
        }
        for (const n of nodesRef.current) {
          if (!connected.has(n.id)) dimmed!.add(n.id);
        }
      }

      // ── Draw edges ──
      for (const l of linksRef.current) {
        const s = l.source as SimNode;
        const tg = l.target as SimNode;
        if (s.x == null || s.y == null || tg.x == null || tg.y == null) continue;

        const sx = s.x, sy = s.y, tx = tg.x, ty2 = tg.y;
        const isHighlighted =
          highlightSet.has(s.id) && highlightSet.has(tg.id);
        const isDimmedEdge = dimmed?.has(s.id) && dimmed?.has(tg.id);

        const alpha = isDimmedEdge ? 0.06 : isHighlighted ? 0.9 : 0.25;
        const w = (1 + l.confidence * 3) * currentFS.linkWidth;

        ctx.beginPath();
        ctx.moveTo(sx, sy);

        // Simple curve
        const mx = (sx + tx) / 2;
        const my = (sy + ty2) / 2 - 8;
        ctx.quadraticCurveTo(mx, my, tx, ty2);

        ctx.strokeStyle = isHighlighted
          ? `rgba(249,115,22,${alpha})`
          : `rgba(156,163,175,${alpha})`;
        ctx.lineWidth = isHighlighted ? w + 1.5 : w;
        ctx.stroke();

        // Arrow for highlighted edges
        if (isHighlighted) {
          const angle = Math.atan2(ty2 - my, tx - mx);
          const arrLen = 8;
          const ax = tx - Math.cos(angle) * radius(tg);
          const ay = ty2 - Math.sin(angle) * radius(tg);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - arrLen * Math.cos(angle - 0.4), ay - arrLen * Math.sin(angle - 0.4));
          ctx.lineTo(ax - arrLen * Math.cos(angle + 0.4), ay - arrLen * Math.sin(angle + 0.4));
          ctx.closePath();
          ctx.fillStyle = `rgba(249,115,22,${alpha})`;
          ctx.fill();
        }
      }

      // ── Draw nodes ──
      for (const n of nodesRef.current) {
        if (n.x == null || n.y == null) continue;
        const px = n.x, py = n.y;
        const r = radius(n);
        const isDimmed = dimmed?.has(n.id);
        const isDirectlyHighlighted = highlightSet.has(n.id);
        const isHighlighted = isDirectlyHighlighted;
        const isQueryHL = querySet.has(n.id);
        const isHovered = hoveredRef.current?.id === n.id;
        const globalAlpha = isDimmed ? 0.15 : n.opacity;

        // Glow for Experiment nodes
        if (n.type === "Experiment" && !isDimmed) {
          const grad = ctx.createRadialGradient(px, py, r, px, py, r * 2.5);
          grad.addColorStop(0, `${n.color}33`);
          grad.addColorStop(1, `${n.color}00`);
          ctx.beginPath();
          ctx.arc(px, py, r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.globalAlpha = globalAlpha;
          ctx.fill();
        }

        // Main circle
        ctx.globalAlpha = globalAlpha;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        // Border
        ctx.lineWidth = isHovered ? 3 : isHighlighted ? 3 : isQueryHL ? 3 : 1.5;
        ctx.strokeStyle = isHighlighted
          ? "#f97316"
          : isQueryHL
          ? "#f59e0b"
          : isHovered
          ? "#fff"
          : "rgba(255,255,255,0.6)";
        ctx.stroke();

        // Highlight ring (pulsing)
        if (isHighlighted || isQueryHL) {
          const pulse = 1 + Math.sin(Date.now() / 300) * 0.15;
          ctx.beginPath();
          ctx.arc(px, py, r * pulse + 4, 0, Math.PI * 2);
          ctx.strokeStyle = isHighlighted ? "rgba(249,115,22,0.5)" : "rgba(245,158,11,0.5)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      }

      // ── Draw labels ──
      const zoomLevel = t.k;
      const showLabels = zoomLevel > 0.8;

      if (showLabels) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const fontSize = Math.max(9, Math.min(12, 11 / zoomLevel * 1.2));
        ctx.font = `500 ${fontSize}px system-ui, sans-serif`;

        for (const n of nodesRef.current) {
          if (n.x == null || n.y == null) continue;
          const lx = n.x, ly = n.y;
          const isDimmedN = dimmed?.has(n.id);
          const isHoveredN = hoveredRef.current?.id === n.id;
          const isImportant = n.type === "Experiment" || n.degree > 2;

          // Always show for hovered/selected/important, otherwise only at higher zoom
          const shouldShow = isHoveredN || currentHL === n.id || querySet.has(n.id) || (isImportant && zoomLevel > 0.9) || zoomLevel > 1.5;
          if (!shouldShow && !isDimmedN) continue;
          if (isDimmedN && !shouldShow) continue;

          const r = radius(n);
          const labelAlpha = isDimmedN ? 0.15 : isHoveredN || currentHL === n.id ? 1 : Math.min(1, (zoomLevel - 0.8) * 2);
          ctx.globalAlpha = labelAlpha;

          // Text outline for readability
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 3;
          ctx.strokeText(n.name || n.label, lx, ly + r + 4);
          ctx.fillStyle = isDimmedN ? "#9ca3af" : "#1f2937";
          ctx.fillText(n.name || n.label, lx, ly + r + 4);
          ctx.globalAlpha = 1;
        }
      }

      // ── Tooltip for hovered node ──
      const hov = hoveredRef.current;
      if (hov && hov.x != null && hov.y != null) {
        const r = radius(hov);
        const htx = hov.x;
        const hty = hov.y - r - 10;
        const text = `${hov.name} (${hov.type})`;
        ctx.font = "12px system-ui, sans-serif";
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        const pad = 8, pady = 4;
        ctx.beginPath();
        ctx.roundRect(htx - tw / 2 - pad, hty - 14 - pady, tw + pad * 2, 20 + pady * 2, 6);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, htx, hty - 4);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      hoveredRef.current = null;
      canvas.style.cursor = "default";
      simRef.current?.stop();
      select(canvas).on(".zoom", null);
      select(canvas).on(".drag", null);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [dims]);

  // ── Timeline animation mode ──
  useEffect(() => {
    if (!timelineMode || !timelineData || timelineData.length === 0) return;

    // Reset: clear sim, then add nodes one by one
    const sorted = [...timelineData].sort((a, b) => (a.year || 0) - (b.year || 0));
    const allNodes: SimNode[] = [];
    const allLinks: SimLink[] = [];

    // Build lookup from current data
    const nodeMap = new Map<string, CytoscapeData["nodes"][0]["data"]>();
    for (const n of data.nodes) nodeMap.set(n.data.id, n.data);

    const edgeMap = new Map<string, CytoscapeData["edges"][1][]>();
    for (const e of data.edges) {
      const arr = edgeMap.get(e.data.source) || [];
      arr.push(e);
      edgeMap.set(e.data.source, arr);
      const arr2 = edgeMap.get(e.data.target) || [];
      arr2.push(e);
      edgeMap.set(e.data.target, arr2);
    }

    buildSim([], []);

    let idx = 0;
    const interval = setInterval(() => {
      if (idx >= sorted.length) {
        clearInterval(interval);
        onTimelineDone?.();
        return;
      }

      const entry = sorted[idx];
      const nd = nodeMap.get(entry.node.id);
      if (nd) {
        const newNode: SimNode = {
          id: nd.id,
          label: nd.label,
          name: nd.name,
          type: nd.type,
          summary: nd.summary,
          color: nd.color || TYPE_COLORS[nd.type] || "#6b7280",
          document_id: nd.document_id,
          baseSize: nd.size || 20,
          degree: 0,
          opacity: 0,
        };

        // Fade in
        setTimeout(() => { newNode.opacity = 1; }, 50);

        allNodes.push(newNode);

        // Add edges connecting to already-added nodes
        const edges = edgeMap.get(nd.id) || [];
        for (const e of edges) {
          const otherId = e.data.source === nd.id ? e.data.target : e.data.source;
          if (allNodes.some((n) => n.id === otherId)) {
            allLinks.push({
              source: e.data.source,
              target: e.data.target,
              confidence: e.data.confidence,
              edgeType: e.data.type,
            });
          }
        }

        computeDegree(allNodes, allLinks);
        buildSim([...allNodes], [...allLinks]);

        // Place new node near center with some randomness
        newNode.x = dims.w / 2 + (Math.random() - 0.5) * 100;
        newNode.y = dims.h / 2 + (Math.random() - 0.5) * 100;
      }

      idx++;
    }, 200);

    return () => clearInterval(interval);
  }, [timelineMode, timelineData, data, dims, buildSim, onTimelineDone]);

  return (
    <div ref={containerRef} className="relative h-full w-full rounded-xl border bg-gray-900 overflow-hidden">
      <canvas ref={canvasRef} className="h-full w-full" />
      {nodesRef.current.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          上传文档后将自动生成知识图谱
        </div>
      )}
    </div>
  );
}
