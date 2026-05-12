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
  floatHash: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  confidence: number;
  edgeType: string;
}

export interface ForceSettings {
  centerStrength: number;
  repel: number;
  linkStrength: number;
  linkDistance: number;
  experimentCluster: number;
  nodeSize: number;
  experimentSize: number;
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
  centerStrength: 0.08,
  repel: -300,
  linkStrength: 0.8,
  linkDistance: 90,
  experimentCluster: 0.15,
  nodeSize: 1,
  experimentSize: 1,
  linkWidth: 1,
};

// ── Floating offset (gentle Obsidian-like bobbing) ──
// Pre-compute hash per node on load to avoid string hashing every frame

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// Cached per-node float params (set once when node is created)
const FLOAT_CACHE = new Map<string, { h: number }>();

function getFloatHash(nodeId: string): number {
  let cached = FLOAT_CACHE.get(nodeId);
  if (!cached) {
    cached = { h: hashStr(nodeId) };
    FLOAT_CACHE.set(nodeId, cached);
  }
  return cached.h;
}

function floatOffsetCached(hash: number, t: number): [number, number] {
  return [
    Math.sin(t * 0.4 + hash * 0.1) * 1.8,
    Math.cos(t * 0.3 + hash * 0.13) * 1.8,
  ];
}

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
  const initialCenterDoneRef = useRef(false);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const dirtyRef = useRef(true); // true = needs full render, false = skip or low-fps
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrameTimeRef = useRef(0);

  const highlightedRef = useRef(highlightedNodeId);
  highlightedRef.current = highlightedNodeId;
  const queryHLRef = useRef(queryHighlightedNodes);
  queryHLRef.current = queryHighlightedNodes;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const fsRef = useRef({ ...DEFAULT_SETTINGS, ...forceSettings });
  fsRef.current = { ...DEFAULT_SETTINGS, ...forceSettings };

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
    (nodes: SimNode[], links: SimLink[], startAlpha = 1) => {
      if (simRef.current) simRef.current.stop();

      // Radial layout: distribute nodes evenly in a circle so they start spread out
      const cx = dims.w / 2;
      const cy = dims.h / 2;
      const r = Math.min(dims.w, dims.h) * 0.35;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.x == null) {
          const angle = (2 * Math.PI * i) / nodes.length;
          n.x = cx + r * Math.cos(angle);
          n.y = cy + r * Math.sin(angle);
        }
      }

      const sim = forceSimulation<SimNode, SimLink>(nodes)
        .force(
          "link",
          forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .distance(fsRef.current.linkDistance)
            .strength(fsRef.current.linkStrength)
        )
        .force("charge", forceManyBody<SimNode>().strength(fsRef.current.repel))
        .force("center", forceCenter(cx, cy).strength(fsRef.current.centerStrength))
        .force("collide", forceCollide<SimNode>().radius((d) => radius(d) + 6))
        .force("experimentCluster", (alpha) => {
          const exps = nodes.filter(n => n.type === "Experiment" && n.x != null && n.y != null);
          if (exps.length < 2) return;
          const ecx = exps.reduce((s, n) => s + n.x!, 0) / exps.length;
          const ecy = exps.reduce((s, n) => s + n.y!, 0) / exps.length;
          for (const n of exps) {
            n.vx = (n.vx || 0) + (ecx - n.x!) * alpha * fsRef.current.experimentCluster;
            n.vy = (n.vy || 0) + (ecy - n.y!) * alpha * fsRef.current.experimentCluster;
          }
        })
        .alpha(startAlpha)
        .alphaDecay(0.01)
        .velocityDecay(0.25);

      simRef.current = sim;
      nodesRef.current = nodes;
      linksRef.current = links;

      // Trigger render on simulation tick
      sim.on("tick", () => {
        dirtyRef.current = true;
      });
    },
    [dims.w, dims.h]
  );

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
    // Clamp degree to prevent runaway sizing, use logarithmic scale
    const d = Math.min(n.degree, 8);
    const logSize = 6 + Math.log2(d + 1) * 4;
    const sizeMultiplier = n.type === "Experiment" ? fsRef.current.experimentSize : fsRef.current.nodeSize;
    return Math.max(5, Math.min(logSize * sizeMultiplier, 28));
  }

  // ── Load data into simulation (preserving positions) ──
  useEffect(() => {
    if (!data.nodes.length) {
      nodesRef.current = [];
      linksRef.current = [];
      hoveredRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = "default";
      simRef.current?.stop();
      simRef.current = null;
      return;
    }

    const existingMap = new Map<string, SimNode>();
    for (const n of nodesRef.current) existingMap.set(n.id, n);

    const nodes: SimNode[] = data.nodes.map((n) => {
      const existing = existingMap.get(n.data.id);
      if (existing) {
        existing.label = n.data.label;
        existing.name = n.data.name;
        existing.type = n.data.type;
        existing.summary = n.data.summary;
        existing.color = n.data.color || TYPE_COLORS[n.data.type] || "#6b7280";
        existing.document_id = n.data.document_id;
        existing.baseSize = n.data.size || 20;
        existing.opacity = 1;
        return existing;
      }
      return {
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
        floatHash: getFloatHash(n.data.id),
        x: undefined,
        y: undefined,
      };
    });

    const links: SimLink[] = data.edges.map((e) => ({
      source: e.data.source,
      target: e.data.target,
      confidence: e.data.confidence,
      edgeType: e.data.type,
    }));

    computeDegree(nodes, links);
    buildSim(nodes, links, existingMap.size > 0 ? 0.05 : 1);
  }, [data, buildSim]);

  // ── Update force params on settings change ──
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const linkF = sim.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>>;
    const chargeF = sim.force("charge") as ReturnType<typeof forceManyBody<SimNode>>;
    const centerF = sim.force("center") as ReturnType<typeof forceCenter>;
    if (linkF) {
      linkF.distance(fsRef.current.linkDistance);
      linkF.strength(fsRef.current.linkStrength);
    }
    if (chargeF) chargeF.strength(fsRef.current.repel);
    if (centerF) centerF.strength(fsRef.current.centerStrength);
    sim.alpha(0.3).restart();
  }, [forceSettings.centerStrength, forceSettings.repel, forceSettings.linkStrength, forceSettings.linkDistance, forceSettings.experimentCluster]);

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
    const targetTransform = zoomIdentity.translate(cx - node.x! * scale, cy - node.y! * scale).scale(scale);
    zoomBehaviorRef.current.transform(select(canvas), targetTransform);
  }, [highlightedNodeId, dims]);

  // ── Initial center once simulation settles ──
  useEffect(() => {
    if (initialCenterDoneRef.current) return;
    if (!data.nodes.length) return;

    const timer = setTimeout(() => {
      const sim = simRef.current;
      if (!sim || !zoomBehaviorRef.current || !canvasRef.current) return;

      // Compute center of mass from current node positions
      const nodes = nodesRef.current.filter((n) => n.x != null && n.y != null);
      if (!nodes.length) return;
      const cx = nodes.reduce((s, n) => s + n.x!, 0) / nodes.length;
      const cy = nodes.reduce((s, n) => s + n.y!, 0) / nodes.length;

      const canvas = canvasRef.current;
      const zb = zoomBehaviorRef.current;
      const scale = Math.min(dims.w / 1200, dims.h / 800, 1); // Auto-fit zoom
      const endX = dims.w / 2 - cx * scale;
      const endY = dims.h / 2 - cy * scale;
      const startX = transformRef.current.x;
      const startY = transformRef.current.y;

      // If already close to target, skip animation
      if (Math.abs(startX - endX) < 50 && Math.abs(startY - endY) < 50 && Math.abs(transformRef.current.k - scale) < 0.1) {
        initialCenterDoneRef.current = true;
        return;
      }

      const duration = 600;
      const startTime = Date.now();
      let animRaf = 0;

      function animatePan() {
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = startX + (endX - startX) * ease;
        const y = startY + (endY - startY) * ease;
        const k = transformRef.current.k + (scale - transformRef.current.k) * ease;
        const newTransform = zoomIdentity.translate(x, y).scale(k);
        zb.transform(select(canvas), newTransform);
        transformRef.current = newTransform;
        if (t < 1) {
          animRaf = requestAnimationFrame(animatePan);
        }
      }

      animRaf = requestAnimationFrame(animatePan);
      initialCenterDoneRef.current = true;

      return () => cancelAnimationFrame(animRaf);
    }, 800);

    return () => clearTimeout(timer);
  }, [data.nodes.length, dims]);

  // ── Setup canvas, zoom, drag, render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Helpers ──
    function transformPoint(sx: number, sy: number): [number, number] {
      const t = transformRef.current;
      return [(sx - t.x) / t.k, (sy - t.y) / t.k];
    }

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

    // ── Drag state ──
    let dragNode: SimNode | null = null;
    let didDrag = false;

    // ── Zoom behavior ──
    const zb = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 5])
      .filter((event) => {
        const evt = event as MouseEvent;
        // Always allow scroll zoom
        if (evt.type === "wheel") return true;
        // Prevent pan when clicking on a node (that starts a drag instead)
        const rect = canvas.getBoundingClientRect();
        const [mx, my] = transformPoint(evt.clientX - rect.left, evt.clientY - rect.top);
        return !findNode(mx, my);
      })
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        dirtyRef.current = true;
        markDirty();
      });
    select(canvas).call(zb);
    zoomBehaviorRef.current = zb;

    // ── Manual node drag (native events, coexists with d3-zoom) ──
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      didDrag = false;
      const rect = canvas.getBoundingClientRect();
      const [mx, my] = transformPoint(e.clientX - rect.left, e.clientY - rect.top);
      const node = findNode(mx, my);
      if (node) {
        dragNode = node;
        dragNode.fx = dragNode.x;
        dragNode.fy = dragNode.y;
        simRef.current?.alphaTarget(0.5).restart();
        canvas.style.cursor = "grabbing";
        dirtyRef.current = true;
        markDirty();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const [mx, my] = transformPoint(e.clientX - rect.left, e.clientY - rect.top);
      if (dragNode) {
        didDrag = true;
        dragNode.fx = mx;
        dragNode.fy = my;
        dirtyRef.current = true;
        markDirty();
        return;
      }
      const hovered = findNode(mx, my);
      if (hoveredRef.current?.id !== hovered?.id) {
        hoveredRef.current = hovered;
        dirtyRef.current = true;
      }
      markDirty();
      canvas.style.cursor = hoveredRef.current ? "pointer" : "default";
    };

    const onMouseUp = () => {
      if (dragNode) {
        dragNode.fx = null;
        dragNode.fy = null;
        simRef.current?.alphaTarget(0);
        dragNode = null;
        dirtyRef.current = true;
        markDirty();
      }
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);

    // ── Click (fires after drag-end, suppressed if dragged) ──
    const onClick = (e: MouseEvent) => {
      if (didDrag) return;
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
    canvas.addEventListener("click", onClick);

    // ── Cached highlight sets (rebuilt only when data changes) ──
    let cachedQueryHL: string[] = [];
    let cachedHLId: string | null = null;
    let querySet = new Set<string>();
    let highlightSet = new Set<string>();
    let dimmed: Set<string> | null = null;
    const lastHLRef = { current: "" };

    // ── Adaptive render: rAF when dirty, 15fps setTimeout when idle ──
    const IDLE_INTERVAL_MS = 66; // ~15fps
    let renderScheduled = false;
    let simActive = true; // sim is still running (positions changing)

    function markDirty() {
      if (renderScheduled) return;
      renderScheduled = true;
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      rafRef.current = requestAnimationFrame(doRender);
    }

    function scheduleIdle() {
      if (renderScheduled) return;
      renderScheduled = true;
      idleTimerRef.current = setTimeout(() => {
        renderScheduled = false;
        rafRef.current = requestAnimationFrame(doRender);
      }, IDLE_INTERVAL_MS);
    }

    function doRender() {
      renderScheduled = false;
      const now = performance.now();
      const dt = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // Skip if nothing changed and less than idle interval
      if (!dirtyRef.current && dt < IDLE_INTERVAL_MS) {
        scheduleIdle();
        return;
      }
      dirtyRef.current = false;

      const t = transformRef.current;
      const currentFS = fsRef.current;
      const timeSec = now / 1000;

      // Check if sim is still active (producing layout changes)
      const sim = simRef.current;
      const wasSimActive = simActive;
      simActive = sim ? sim.alpha() > 0.001 : false;

      // Only rebuild highlight sets when refs change
      const curHL = highlightedRef.current;
      const curQHL = queryHLRef.current;
      const cacheKey = `${curHL}|${curQHL.join(",")}`;
      if (cacheKey !== lastHLRef.current) {
        lastHLRef.current = cacheKey;
        cachedQueryHL = curQHL;
        cachedHLId = curHL;
        querySet = new Set(curQHL);
        highlightSet = new Set<string>();
        if (curHL) highlightSet.add(curHL);
        for (const id of curQHL) highlightSet.add(id);
        const hasHighlight = highlightSet.size > 0;
        dimmed = null;
        if (hasHighlight) {
          dimmed = new Set<string>();
          const connected = new Set<string>(highlightSet);
          for (const l of linksRef.current) {
            const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
            const tg = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
            if (highlightSet.has(s)) connected.add(tg);
            if (highlightSet.has(tg)) connected.add(s);
          }
          for (const n of nodesRef.current) {
            if (!connected.has(n.id)) dimmed.add(n.id);
          }
        }
      }

      ctx.clearRect(0, 0, dims.w, dims.h);

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // ── Draw edges ──
      for (const l of linksRef.current) {
        const s = l.source as SimNode;
        const tg = l.target as SimNode;
        if (s.x == null || s.y == null || tg.x == null || tg.y == null) continue;

        const sOff = s === dragNode ? [0, 0] : floatOffsetCached(s.floatHash, timeSec);
        const tOff = tg === dragNode ? [0, 0] : floatOffsetCached(tg.floatHash, timeSec);
        const sx = s.x + sOff[0], sy = s.y + sOff[1];
        const tx = tg.x + tOff[0], ty2 = tg.y + tOff[1];

        const isHighlighted =
          highlightSet.has(s.id) && highlightSet.has(tg.id);
        const isDimmedEdge = dimmed?.has(s.id) && dimmed?.has(tg.id);

        const alpha = isDimmedEdge ? 0.06 : isHighlighted ? 0.9 : 0.25;
        const w = (1 + l.confidence * 3) * currentFS.linkWidth;

        ctx.beginPath();
        ctx.moveTo(sx, sy);

        const mx = (sx + tx) / 2;
        const my = (sy + ty2) / 2 - 8;
        ctx.quadraticCurveTo(mx, my, tx, ty2);

        ctx.strokeStyle = isHighlighted
          ? `rgba(249,115,22,${alpha})`
          : `rgba(156,163,175,${alpha})`;
        ctx.lineWidth = isHighlighted ? w + 1.5 : w;
        ctx.stroke();

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
        const off = n === dragNode ? [0, 0] : floatOffsetCached(n.floatHash, timeSec);
        const px = n.x + off[0], py = n.y + off[1];
        const r = radius(n);
        const isDimmed = dimmed?.has(n.id);
        const isHighlighted = highlightSet.has(n.id);
        const isQueryHL = querySet.has(n.id);
        const isHovered = hoveredRef.current?.id === n.id;
        const globalAlpha = isDimmed ? 0.15 : n.opacity;

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

        ctx.globalAlpha = globalAlpha;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        ctx.lineWidth = isHovered ? 3 : isHighlighted ? 3 : isQueryHL ? 3 : 1.5;
        ctx.strokeStyle = isHighlighted
          ? "#f97316"
          : isQueryHL
          ? "#f59e0b"
          : isHovered
          ? "#fff"
          : "rgba(255,255,255,0.6)";
        ctx.stroke();

        if (isHighlighted || isQueryHL) {
          const pulse = 1 + Math.sin(now / 300) * 0.15;
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
      const showLabels = zoomLevel > 0.45;

      if (showLabels) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const fontSize = Math.max(9, Math.min(13, 12 / zoomLevel * 1.1));
        ctx.font = `500 ${fontSize}px system-ui, sans-serif`;

        for (const n of nodesRef.current) {
          if (n.x == null || n.y == null) continue;
          const off = n === dragNode ? [0, 0] : floatOffsetCached(n.floatHash, timeSec);
          const lx = n.x + off[0], ly = n.y + off[1];
          const isDimmedN = dimmed?.has(n.id);
          const isHoveredN = hoveredRef.current?.id === n.id;
          const isImportant = n.type === "Experiment" || n.degree > 2;

          const shouldShow = isHoveredN || highlightedRef.current === n.id || querySet.has(n.id) || isImportant || zoomLevel > 0.7;
          if (!shouldShow && !isDimmedN) continue;
          if (isDimmedN && !shouldShow) continue;

          const r = radius(n);
          const labelAlpha = isDimmedN ? 0.15 : isHoveredN || highlightedRef.current === n.id ? 1 : Math.min(1, (zoomLevel - 0.45) * 3);
          ctx.globalAlpha = labelAlpha;

          ctx.fillStyle = isDimmedN ? "rgba(156,163,175,0.6)" : "rgba(255,255,255,0.9)";
          ctx.fillText(n.name || n.label, lx, ly + r + 4);
          ctx.globalAlpha = 1;
        }
      }

      // ── Tooltip ──
      const hov = hoveredRef.current;
      if (hov && hov.x != null && hov.y != null) {
        const off = hov === dragNode ? [0, 0] : floatOffsetCached(hov.floatHash, timeSec);
        const r = radius(hov);
        const htx = hov.x + off[0];
        const hty = hov.y + off[1] - r - 10;
        const text = `${hov.name} (${hov.type})`;
        ctx.font = "12px system-ui, sans-serif";
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        const pad = 8, pady = 4;
        const rx = htx - tw / 2 - pad, ry = hty - 14 - pady, rw = tw + pad * 2, rh = 20 + pady * 2, rr = 6;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(rx, ry, rw, rh, rr);
        } else {
          ctx.moveTo(rx + rr, ry);
          ctx.lineTo(rx + rw - rr, ry);
          ctx.arcTo(rx + rw, ry, rx + rw, ry + rr, rr);
          ctx.lineTo(rx + rw, ry + rh - rr);
          ctx.arcTo(rx + rw, ry + rh, rx + rw - rr, ry + rh, rr);
          ctx.lineTo(rx + rr, ry + rh);
          ctx.arcTo(rx, ry + rh, rx, ry + rh - rr, rr);
          ctx.lineTo(rx, ry + rr);
          ctx.arcTo(rx, ry, rx + rr, ry, rr);
          ctx.closePath();
        }
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, htx, hty - 4);
      }

      ctx.restore();

      // Schedule next render: rAF if sim/mouse active, setTimeout if idle
      const shouldHighFps = simActive || wasSimActive || dragNode || hov || highlightSet.size > 0;
      if (shouldHighFps) {
        markDirty();
      } else {
        scheduleIdle();
      }
    }

    // Kick off the render loop
    markDirty();

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      hoveredRef.current = null;
      canvas.style.cursor = "default";
      simRef.current?.stop();
      select(canvas).on(".zoom", null);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("click", onClick);
    };
  }, [dims]);

  // ── Timeline animation mode (Experiment nodes first) ──
  useEffect(() => {
    if (!timelineMode || !timelineData || timelineData.length === 0) return;

    const TYPE_ORDER: Record<string, number> = {
      Experiment: 0,
      Theory: 1,
      Equipment: 2,
      Consumable: 3,
      Tool: 4,
      Concept: 5,
    };

    const sorted = [...timelineData].sort((a, b) => {
      const oa = TYPE_ORDER[a.node.type] ?? 9;
      const ob = TYPE_ORDER[b.node.type] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a.year || 0) - (b.year || 0);
    });

    const allNodes: SimNode[] = [];
    const allLinks: SimLink[] = [];
    const allNodeIds = new Set<string>();

    const nodeMap = new Map<string, CytoscapeData["nodes"][number]["data"]>();
    for (const n of data.nodes) nodeMap.set(n.data.id, n.data);

    const edgeMap = new Map<string, CytoscapeData["edges"][number][]>();
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
          floatHash: getFloatHash(nd.id),
        };

        setTimeout(() => { newNode.opacity = 1; }, 50);

        allNodes.push(newNode);
        allNodeIds.add(nd.id);

        const edges = edgeMap.get(nd.id) || [];
        for (const e of edges) {
          const otherId = e.data.source === nd.id ? e.data.target : e.data.source;
          if (allNodeIds.has(otherId)) {
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

        newNode.x = dims.w / 2 + (Math.random() - 0.5) * 100;
        newNode.y = dims.h / 2 + (Math.random() - 0.5) * 100;
      }

      idx++;
    }, 200);

    return () => clearInterval(interval);
  }, [timelineMode, timelineData, data, dims, buildSim, onTimelineDone]);

  return (
    <div ref={containerRef} className="relative h-full w-full rounded-xl border bg-black overflow-hidden">
      <canvas ref={canvasRef} className="h-full w-full" />
      {nodesRef.current.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-700">
          上传文档后将自动生成知识图谱
        </div>
      )}
    </div>
  );
}
