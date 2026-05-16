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
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  confidence: number;
  edgeType: string;
}

export interface ForceSettings {
  repel: number;
  linkDistance: number;
  centerStrength: number;
  nodeSize: number;
  linkWidth: number;
  clusterForce: number;
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
  Experiment: "#7c3aed",
  Equipment: "#dc2626",
  Theory: "#2563eb",
  Consumable: "#d97706",
  Tool: "#059669",
  Concept: "#6b7280",
};

const DEFAULT_SETTINGS: ForceSettings = {
  centerStrength: 0.1,
  repel: -60,
  linkDistance: 80,
  nodeSize: 1,
  linkWidth: 1,
  clusterForce: 0.3,
};

const FS_KEY = "graph-force-settings";

function loadFS(): ForceSettings {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(FS_KEY) : null;
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

// ── Component ──

export default function GalaxyView({
  data,
  timelineData,
  onNodeClick,
  highlightedNodeId,
  queryHighlightedNodes = [],
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
  const dirtyRef = useRef(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrameTimeRef = useRef(0);

  const hoverAlphaRef = useRef(0);
  const HOVER_TRANSITION_SPEED = 0.08;

  const highlightedRef = useRef(highlightedNodeId);
  highlightedRef.current = highlightedNodeId;
  const queryHLRef = useRef(queryHighlightedNodes);
  queryHLRef.current = queryHighlightedNodes;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  // Internal force settings state — synced from localStorage every 200ms
  const [forceSettings, setForceSettings] = useState<ForceSettings>(loadFS);
  const prevFsRef = useRef(JSON.stringify(loadFS()));

  // Poll localStorage for toolbar changes
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const raw = localStorage.getItem(FS_KEY);
        if (raw) {
          const next: ForceSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
          setForceSettings(prev => {
            if (prev.repel === next.repel && prev.linkDistance === next.linkDistance &&
                prev.centerStrength === next.centerStrength && prev.nodeSize === next.nodeSize &&
                prev.linkWidth === next.linkWidth && prev.clusterForce === next.clusterForce) return prev;
            return next;
          });
        }
      } catch {}
    }, 200);
    return () => clearInterval(timer);
  }, []);

  // Keep a ref to the latest forceSettings for the render loop
  const fsRef = useRef(forceSettings);
  fsRef.current = forceSettings;

  // Adjacency
  const adjacentByIdRef = useRef(new Map<string, Set<string>>());
  const neighborLinksByIdRef = useRef(new Map<string, Set<string>>());

  const NODE_RADIUS = 4;

  useEffect(() => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const adj = new Map<string, Set<string>>();
    const nl = new Map<string, Set<string>>();
    for (const n of nodes) {
      adj.set(n.id, new Set([n.id]));
      nl.set(n.id, new Set());
    }
    for (const l of links) {
      const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
      const t = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
      const lk = `${s}--${t}`;
      adj.get(s)?.add(t);
      adj.get(t)?.add(s);
      nl.get(s)?.add(lk);
      nl.get(t)?.add(lk);
    }
    adjacentByIdRef.current = adj;
    neighborLinksByIdRef.current = nl;
  });

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

      const cx = dims.w / 2;
      const cy = dims.h / 2;
      const r = Math.min(dims.w, dims.h) * 0.3;
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
            .distance(forceSettings.linkDistance)
            .strength(0.6)
        )
        .force("charge", forceManyBody<SimNode>().strength(forceSettings.repel))
        .force("center", forceCenter(cx, cy).strength(forceSettings.centerStrength))
        .force("clusterCenter", forceCenter(cx, cy).strength(forceSettings.clusterForce))
        .force("collide", forceCollide<SimNode>().radius(NODE_RADIUS + 3))
        .alpha(startAlpha)
        .alphaDecay(0.02)
        .velocityDecay(0.4);

      simRef.current = sim;
      nodesRef.current = nodes;
      linksRef.current = links;

      let lastPos = new Map<string, { x: number; y: number }>();
      sim.on("tick", () => {
        let moved = false;
        for (const n of nodes) {
          if (n.x == null || n.y == null) continue;
          const p = lastPos.get(n.id);
          if (!p || Math.abs(p.x - n.x) > 0.5 || Math.abs(p.y - n.y) > 0.5) {
            moved = true;
            lastPos.set(n.id, { x: n.x, y: n.y });
          }
        }
        if (moved) dirtyRef.current = true;
      });
    },
    [dims.w, dims.h, forceSettings]
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

  // ── Load data ──
  useEffect(() => {
    if (!data.nodes.length) {
      nodesRef.current = [];
      linksRef.current = [];
      hoveredRef.current = null;
      hoverAlphaRef.current = 0;
      if (canvasRef.current) canvasRef.current.style.cursor = "default";
      simRef.current?.stop();
      simRef.current = null;
      return;
    }

    const existingMap = new Map<string, SimNode>();
    for (const n of nodesRef.current) existingMap.set(n.id, n);

    const latestId = data.nodes[data.nodes.length - 1]?.data.id;

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
      const nn: SimNode = {
        id: n.data.id, label: n.data.label, name: n.data.name, type: n.data.type,
        summary: n.data.summary, color: n.data.color || TYPE_COLORS[n.data.type] || "#6b7280",
        document_id: n.data.document_id, baseSize: n.data.size || 20,
        degree: 0, opacity: 1, x: undefined, y: undefined,
      };
      if (n.data.id === latestId) { nn.x = dims.w / 2; nn.y = dims.h / 2; }
      return nn;
    });

    const links: SimLink[] = data.edges.map((e) => ({
      source: e.data.source, target: e.data.target,
      confidence: e.data.confidence, edgeType: e.data.type,
    }));

    computeDegree(nodes, links);
    buildSim(nodes, links, existingMap.size > 0 ? 0.05 : 1);
    initialCenterDoneRef.current = false;
  }, [data, buildSim, dims.w, dims.h]);

  // ── Apply force settings changes ──
  useEffect(() => {
    const cur = JSON.stringify(forceSettings);
    if (cur === prevFsRef.current) return;
    prevFsRef.current = cur;

    const sim = simRef.current;
    if (!sim) return;
    const linkF = sim.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>>;
    const chargeF = sim.force("charge") as ReturnType<typeof forceManyBody<SimNode>>;
    const centerF = sim.force("center") as ReturnType<typeof forceCenter>;
    const clusterF = sim.force("clusterCenter") as ReturnType<typeof forceCenter>;
    if (linkF) linkF.distance(forceSettings.linkDistance);
    if (chargeF) chargeF.strength(forceSettings.repel);
    if (centerF) centerF.strength(forceSettings.centerStrength);
    if (clusterF) clusterF.strength(forceSettings.clusterForce);
    sim.alpha(0.3).restart();
  }, [forceSettings]);

  // ── Pan to highlighted ──
  useEffect(() => {
    if (!highlightedNodeId || !zoomBehaviorRef.current || !canvasRef.current) return;
    const node = nodesRef.current.find((n) => n.id === highlightedNodeId);
    if (!node || node.x == null) return;
    const t = transformRef.current;
    const targetTransform = zoomIdentity.translate(dims.w / 2 - node.x! * t.k, dims.h / 2 - node.y! * t.k).scale(t.k);
    zoomBehaviorRef.current.transform(select(canvasRef.current), targetTransform);
  }, [highlightedNodeId, dims]);

  // ── Initial center ──
  useEffect(() => {
    if (initialCenterDoneRef.current || !data.nodes.length) return;
    const timer = setTimeout(() => {
      const sim = simRef.current;
      if (!sim || !zoomBehaviorRef.current || !canvasRef.current) return;
      const nodes = nodesRef.current.filter((n) => n.x != null && n.y != null);
      if (!nodes.length) return;
      const latest = nodesRef.current[nodesRef.current.length - 1];
      if (!latest || latest.x == null || latest.y == null) {
        latest.x = nodes.reduce((s, n) => s + n.x!, 0) / nodes.length;
        latest.y = nodes.reduce((s, n) => s + n.y!, 0) / nodes.length;
      }
      const scale = Math.min(dims.w / 700, dims.h / 500, 1.5);
      const endX = dims.w / 2 - latest.x * scale;
      const endY = dims.h / 2 - latest.y * scale;
      const startX = transformRef.current.x;
      const startY = transformRef.current.y;
      if (Math.abs(startX - endX) < 30 && Math.abs(startY - endY) < 30 && Math.abs(transformRef.current.k - scale) < 0.1) {
        initialCenterDoneRef.current = true;
        return;
      }
      const dur = 700;
      const t0 = Date.now();
      let raf = 0;
      function anim() {
        const p = Math.min(1, (Date.now() - t0) / dur);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const x = startX + (endX - startX) * e;
        const y = startY + (endY - startY) * e;
        const k = transformRef.current.k + (scale - transformRef.current.k) * e;
        const nt = zoomIdentity.translate(x, y).scale(k);
        zoomBehaviorRef.current!.transform(select(canvasRef.current!), nt);
        transformRef.current = nt;
        if (p < 1) raf = requestAnimationFrame(anim);
      }
      raf = requestAnimationFrame(anim);
      initialCenterDoneRef.current = true;
      return () => cancelAnimationFrame(raf);
    }, 600);
    return () => clearTimeout(timer);
  }, [data.nodes.length, dims]);

  // ── Canvas render ──
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

    function transformPoint(sx: number, sy: number): [number, number] {
      const t = transformRef.current;
      return [(sx - t.x) / t.k, (sy - t.y) / t.k];
    }

    function findNode(x: number, y: number): SimNode | null {
      for (let i = nodesRef.current.length - 1; i >= 0; i--) {
        const n = nodesRef.current[i];
        if (n.x == null) continue;
        const r = NODE_RADIUS + 5;
        const dx = (n.x ?? 0) - x;
        const dy = (n.y ?? 0) - y;
        if (dx * dx + dy * dy < r * r) return n;
      }
      return null;
    }

    let dragNode: SimNode | null = null;
    let didDrag = false;

    const zb = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 6])
      .filter((event) => {
        const evt = event as MouseEvent;
        if (evt.type === "wheel") return true;
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
        simRef.current?.alphaTarget(0.15).restart();
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
        markDirty();
      }
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
    canvas.addEventListener("mouseleave", () => {
      onMouseUp();
      if (hoveredRef.current) {
        hoveredRef.current = null;
        dirtyRef.current = true;
        markDirty();
      }
    });

    const onClick = (e: MouseEvent) => {
      if (didDrag) return;
      const rect = canvas.getBoundingClientRect();
      const [mx, my] = transformPoint(e.clientX - rect.left, e.clientY - rect.top);
      const node = findNode(mx, my);
      if (node) {
        onNodeClickRef.current({
          id: node.id, name: node.name, type: node.type,
          summary: node.summary, color: node.color, document_id: node.document_id,
        });
      }
    };
    canvas.addEventListener("click", onClick);

    let querySet = new Set<string>();
    let highlightSet = new Set<string>();
    let dimmed: Set<string> | null = null;
    let dimmedEdges: Set<string> | null = null;
    let lastHLRef = "";

    const IDLE_INTERVAL_MS = 100;
    let renderScheduled = false;
    let simActive = true;

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

      if (!dirtyRef.current && dt < IDLE_INTERVAL_MS) {
        scheduleIdle();
        return;
      }
      dirtyRef.current = false;

      const t = transformRef.current;
      const zoomLevel = t.k;

      const sim = simRef.current;
      const wasSimActive = simActive;
      simActive = sim ? sim.alpha() > 0.001 : false;

      const targetHA = hoveredRef.current ? 1 : 0;
      const curHA = hoverAlphaRef.current;
      if (Math.abs(curHA - targetHA) > 0.001) {
        hoverAlphaRef.current += (targetHA - curHA) * HOVER_TRANSITION_SPEED;
        dirtyRef.current = true;
      }
      const hA = hoverAlphaRef.current;

      const curHL = highlightedRef.current;
      const curQHL = queryHLRef.current;
      const hovId = hoveredRef.current?.id;
      const ck = `${curHL}|${curQHL.join(",")}|${hovId ?? ""}|${hA.toFixed(2)}`;
      if (ck !== lastHLRef) {
        lastHLRef = ck;
        querySet = new Set(curQHL);
        highlightSet = new Set<string>();
        if (curHL) highlightSet.add(curHL);
        for (const id of curQHL) highlightSet.add(id);

        dimmed = null;
        dimmedEdges = null;

        if (hA > 0.01 && hovId) {
          const hn = adjacentByIdRef.current.get(hovId) ?? new Set([hovId]);
          const hlk = neighborLinksByIdRef.current.get(hovId) ?? new Set();
          dimmed = new Set<string>();
          dimmedEdges = new Set<string>();
          for (const n of nodesRef.current) {
            if (!hn.has(n.id)) dimmed.add(n.id);
          }
          for (const l of linksRef.current) {
            const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
            const tg = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
            if (!hlk.has(`${s}--${tg}`)) dimmedEdges.add(`${s}--${tg}`);
          }
        } else if (highlightSet.size > 0) {
          dimmed = new Set<string>();
          dimmedEdges = new Set<string>();
          const connected = new Set<string>(highlightSet);
          for (const l of linksRef.current) {
            const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
            const tg = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
            if (highlightSet.has(s)) connected.add(tg);
            if (highlightSet.has(tg)) connected.add(s);
            if (!(highlightSet.has(s) && highlightSet.has(tg))) dimmedEdges.add(`${s}--${tg}`);
          }
          for (const n of nodesRef.current) {
            if (!connected.has(n.id)) dimmed.add(n.id);
          }
        }
      }

      const isHov = hA > 0.01;

      ctx.clearRect(0, 0, dims.w, dims.h);
      ctx.fillStyle = "#0f0f0f";
      ctx.fillRect(0, 0, dims.w, dims.h);

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // ── Edges ──
      for (const l of linksRef.current) {
        const s = l.source as SimNode;
        const tg = l.target as SimNode;
        if (s.x == null || s.y == null || tg.x == null || tg.y == null) continue;

        const lk = `${s.id}--${tg.id}`;
        const isHL = highlightSet.has(s.id) && highlightSet.has(tg.id);
        const isHE = hovId && (s.id === hovId || tg.id === hovId);
        const isD = (isHov && dimmedEdges?.has(lk)) || (!isHov && dimmed?.has(s.id) && dimmed?.has(tg.id));

        const alpha = isD ? 0.03 : isHL ? 0.7 : isHE ? 0.5 : 0.25;
        const w = isHL ? 1.5 : isHE ? 1.2 : Math.max(0.5, 0.8 * fsRef.current.linkWidth);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tg.x, tg.y);
        ctx.strokeStyle = isHL
          ? `rgba(217,182,103,${alpha})`
          : isHE
          ? `rgba(170,175,190,${alpha})`
          : `rgba(140,150,165,${alpha})`;
        ctx.lineWidth = w;
        ctx.stroke();
      }

      // ── Nodes ──
      const nr = fsRef.current.nodeSize * NODE_RADIUS;
      for (const n of nodesRef.current) {
        if (n.x == null || n.y == null) continue;
        const isD = dimmed?.has(n.id);
        const isH = hovId === n.id;
        const isNb = isHov && hovId && adjacentByIdRef.current.get(hovId)?.has(n.id);
        const isHL = highlightSet.has(n.id);
        const isQHL = querySet.has(n.id);

        if (isHov && isD) ctx.globalAlpha = 0.22 + (1 - hA) * 0.15;

        ctx.beginPath();
        ctx.arc(n.x, n.y, nr, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        ctx.lineWidth = isH ? 2.8 : isNb ? 2 : isHL || isQHL ? 2 : 0.8;
        ctx.strokeStyle = isH
          ? "rgba(255,255,255,0.95)"
          : isNb
          ? "rgba(255,255,255,0.7)"
          : isHL
          ? "rgba(250,204,21,0.85)"
          : isQHL
          ? "rgba(251,191,36,0.75)"
          : "rgba(148,163,184,0.3)";
        ctx.stroke();

        if (isH || isNb) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, nr + 4, 0, Math.PI * 2);
          ctx.fillStyle = isH ? `${n.color}40` : `${n.color}20`;
          ctx.fill();
        }

        if (isHL || isQHL) {
          const pulse = 1 + Math.sin(now / 400) * 0.08;
          ctx.beginPath();
          ctx.arc(n.x, n.y, nr * pulse + 5, 0, Math.PI * 2);
          ctx.strokeStyle = isHL ? "rgba(250,204,21,0.3)" : "rgba(251,191,36,0.25)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      }

      // ── Labels ──
      const lo = zoomLevel < 0.5 ? 0 : zoomLevel < 0.8 ? (zoomLevel - 0.5) / 0.3 : zoomLevel > 2.5 ? Math.max(0, 1 - (zoomLevel - 2.5) / 1.5) : 1;

      let hln: SimNode | null = null;

      if (lo > 0.01) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.font = `400 10px ui-sans-serif, system-ui, sans-serif`;

        for (const n of nodesRef.current) {
          if (n.x == null || n.y == null) continue;
          const isDN = dimmed?.has(n.id);
          const isHN = hovId === n.id;
          const isHLN = curHL === n.id;

          if (isHov && isDN && !isHN) {
            ctx.globalAlpha = 0.15 * lo;
            ctx.fillStyle = "rgba(120,128,140,0.5)";
            ctx.fillText(n.name || n.label, n.x, n.y + nr + 4);
            ctx.globalAlpha = 1;
            continue;
          }

          const a = lo * (isHN || isHLN ? 1 : 0.65);
          if (isHN && hA > 0.1) { hln = n; continue; }

          ctx.globalAlpha = a;
          ctx.fillStyle = isHLN ? "rgba(230,235,245,0.95)" : "rgba(180,186,196,0.85)";
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 2;
          ctx.fillText(n.name || n.label, n.x, n.y + nr + 4);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }

      // ── Hovered label on top layer ──
      if (hln && hA > 0.1) {
        const nx = hln.x ?? 0;
        const ny = hln.y ?? 0;
        const sc = 1 + hA * 0.3;
        const fs = 10 * sc;
        const eo = hA * 3;

        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.font = `500 ${fs}px ui-sans-serif, system-ui, sans-serif`;
        ctx.globalAlpha = hA;
        ctx.fillStyle = "rgba(240,243,250,0.98)";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4;
        ctx.fillText(hln.name || hln.label, nx, ny + nr + 4 + eo);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      const shouldHi = simActive || wasSimActive || dragNode || hoveredRef.current || highlightSet.size > 0 || Math.abs(hA - targetHA) > 0.001;
      if (shouldHi) markDirty();
      else scheduleIdle();
    }

    markDirty();

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      hoveredRef.current = null;
      hoverAlphaRef.current = 0;
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

  // ── Timeline ──
  useEffect(() => {
    if (!timelineMode || !timelineData || timelineData.length === 0) return;

    const TO: Record<string, number> = {
      Experiment: 0, Theory: 1, Equipment: 2, Consumable: 3, Tool: 4, Concept: 5,
    };
    const sorted = [...timelineData].sort((a, b) => {
      const oa = TO[a.node.type] ?? 9;
      const ob = TO[b.node.type] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a.year || 0) - (b.year || 0);
    });

    const allNodes: SimNode[] = [];
    const allLinks: SimLink[] = [];
    const allIds = new Set<string>();
    const nm = new Map<string, CytoscapeData["nodes"][number]["data"]>();
    for (const n of data.nodes) nm.set(n.data.id, n.data);
    const em = new Map<string, CytoscapeData["edges"][number][]>();
    for (const e of data.edges) {
      (em.get(e.data.source) || []).push(e); em.set(e.data.source, em.get(e.data.source)!);
      (em.get(e.data.target) || []).push(e); em.set(e.data.target, em.get(e.data.target)!);
    }

    buildSim([], []);

    let idx = 0;
    const iv = setInterval(() => {
      if (idx >= sorted.length) { clearInterval(iv); onTimelineDone?.(); return; }
      const nd = nm.get(sorted[idx].node.id);
      if (nd) {
        const nn: SimNode = {
          id: nd.id, label: nd.label, name: nd.name, type: nd.type,
          summary: nd.summary, color: nd.color || TYPE_COLORS[nd.type] || "#6b7280",
          document_id: nd.document_id, baseSize: nd.size || 20,
          degree: 0, opacity: 0, x: undefined, y: undefined,
        };
        setTimeout(() => { nn.opacity = 1; }, 50);
        allNodes.push(nn); allIds.add(nd.id);
        for (const e of em.get(nd.id) || []) {
          const o = e.data.source === nd.id ? e.data.target : e.data.source;
          if (allIds.has(o)) allLinks.push({ source: e.data.source, target: e.data.target, confidence: e.data.confidence, edgeType: e.data.type });
        }
        computeDegree(allNodes, allLinks);
        buildSim([...allNodes], [...allLinks]);
        nn.x = dims.w / 2 + (Math.random() - 0.5) * 100;
        nn.y = dims.h / 2 + (Math.random() - 0.5) * 100;
      }
      idx++;
    }, 200);
    return () => clearInterval(iv);
  }, [timelineMode, timelineData, data, dims, buildSim, onTimelineDone]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-xl border border-zinc-800/60 bg-[#0f0f0f]">
      <canvas ref={canvasRef} className="h-full w-full" />
      {nodesRef.current.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
          上传文档后将自动生成知识图谱
        </div>
      )}
    </div>
  );
}
