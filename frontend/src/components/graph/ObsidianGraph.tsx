"use client";

/**
 * GraphCanvas —— 力导图谱画布。
 *
 * 职责边界：力导计算全部在 worker（WASM 优先 / TS 回退，见 lib/graph）；
 * 本组件只做消息编排、交互与绘制，主线程无力导。
 *
 * - 渲染按需：仅在 positions 更新、交互、悬浮/聚焦缓动未收敛时 rAF，
 *   空闲零帧；DPR 上限 2；document.hidden 时暂停 rAF（worker 因缓冲
 *   不被归还而自然停摆）。
 * - 交互：平移/滚轮缩放/双指捏合；普通拖拽释放保留惯性，双击或侧栏
 *   显式固定/解锁；点击选中；悬浮邻域渐显（透明度缓动）。
 * - 检索：空间网格命中；标签 LOD；邻接表缓存的邻域高亮。
 * - 持久化：布局冷却后把位置与固定节点写入 IndexedDB
 *   （用户 + scope 隔离，见 position-cache）。
 * - 可访问性：canvas 有 aria-label 与 role；键盘节点列表在页面侧栏
 *   （本组件暴露 selectNode/focusNode 供其调用）。
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileText, Network, Pin, Scan } from "lucide-react";
import type { KnowledgeEdge, KnowledgeGroup, KnowledgeNode } from "@/lib/research-types";
import { GraphEngineClient, type ClientState } from "@/lib/graph/engine-client";
import type { EngineSettings, TickMessage } from "@/lib/graph/protocol";
import {
  buildAdjacency,
  easeTowards,
  fitBounds,
  HIT_TOLERANCE_PX,
  labelOpacity,
  panBy,
  screenToWorld,
  SpatialHitGrid,
  zoomAround,
  type ViewTransform,
} from "@/lib/graph/graph-math";
import { neighborhoodDistances } from "@/lib/graph/graph-math";
import { graphSignature, loadLayout, saveLayout, type CacheScope } from "@/lib/graph/position-cache";
import type { GraphDisplaySettings, GraphExploration } from "@/lib/graph/graph-settings";
import { drawNodeShape, GRAPH_COLORS, NODE_BASE_RADIUS, visualOf } from "./obsidian-shapes";
import { ObsidianNodePreview } from "./ObsidianNodePreview";

export interface ObsidianGraphHandle {
  reheat: (alpha?: number) => void;
  focusNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  /** 返回切换后的固定状态 */
  togglePin: (id: string) => boolean;
  fitView: () => void;
  fitGlobal: () => void;
  zoomBy: (factor: number) => void;
}

export interface ObsidianGraphProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  settings: EngineSettings;
  selectedId: string | null;
  highlightIds: string[];
  displaySettings: GraphDisplaySettings;
  exploration: GraphExploration | null;
  onExplore: (id: string) => void;
  /** nonce 变化时把 nodeId 平移到视图中心（深链/搜索定位） */
  focusRequest: { nodeId: string; nonce: number } | null;
  cacheScope: CacheScope | null;
  onSelect: (node: KnowledgeNode | null) => void;
  onPinsChange?: (pinned: string[]) => void;
  onEngineReady?: (state: ClientState) => void;
  ariaLabel?: string;
  className?: string;
}

const TYPE_ORDER: KnowledgeGroup[] = ["experiment", "resource", "knowledge"];

function typeIndex(type: KnowledgeGroup): number {
  return Math.max(0, TYPE_ORDER.indexOf(type));
}

export const ObsidianGraph = forwardRef<ObsidianGraphHandle, ObsidianGraphProps>(function ObsidianGraph(
  {
    nodes,
    edges,
    settings,
    selectedId,
    highlightIds,
    displaySettings,
    exploration,
    onExplore,
    focusRequest,
    cacheScope,
    onSelect,
    onPinsChange,
    onEngineReady,
    ariaLabel,
    className,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<GraphEngineClient | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
  const dimsRef = useRef({ w: 800, h: 520 });
  const indexRef = useRef({ ids: [] as string[], idToIndex: new Map<string, number>() });
  const adjacencyRef = useRef<Uint32Array[]>([]);
  const hitGridRef = useRef(new SpatialHitGrid(64));
  const hitPositionsRef = useRef<{ x: Float32Array; y: Float32Array } | null>(null);
  const hitDirtyRef = useRef(true);
  const pinnedRef = useRef<Set<string>>(new Set());
  const hoverRef = useRef<{ id: string | null; alpha: number; neighbors: Set<number> }>({
    id: null,
    alpha: 0,
    neighbors: new Set(),
  });
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
  const focusAnimRef = useRef<{ from: ViewTransform; to: ViewTransform; start: number } | null>(null);
  const dirtyRef = useRef(true);
  const needsContinuousRef = useRef(false);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const kickRef = useRef<(() => void) | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const signatureRef = useRef<string | null>(null);
  const dataRef = useRef<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }>({ nodes: [], edges: [] });
  const selectedRef = useRef<string | null>(null);
  const highlightRef = useRef<Set<string>>(new Set());
  const reducedMotionRef = useRef(false);
  const engineDoneRef = useRef(false);
  const autoViewRef = useRef(true);
  const lastFitTickRef = useRef(0);
  const pendingLocalFitRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{ id: string; pinned: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const interactionTimerRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const previewInsideRef = useRef(false);
  const settingsRef = useRef(displaySettings);
  const explorationRef = useRef(exploration);
  const neighborhoodRef = useRef<Map<number, number> | null>(null);

  settingsRef.current = displaySettings;
  explorationRef.current = exploration;
  selectedRef.current = selectedId;
  dataRef.current = { nodes, edges };
  highlightRef.current = useMemo(() => new Set(highlightIds), [highlightIds]);
  const degreeById = useMemo(() => {
    const degrees = new Map<string, number>(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }
    return degrees;
  }, [nodes, edges]);

  const kick = useCallback(() => {
    dirtyRef.current = true;
    kickRef.current?.();
  }, []);

  const syncAmbient = useCallback(() => {
    const enabled = settingsRef.current.ambient && !reducedMotionRef.current && !document.hidden &&
      !interactingRef.current && !hoverRef.current.id && !previewInsideRef.current;
    clientRef.current?.ambient(enabled ? 0.006 : 0);
  }, []);

  // ── Worker 生命周期（一次） ────────────────────────────────────
  useEffect(() => {
    const client = new GraphEngineClient();
    clientRef.current = client;
    client.start(
      (msg: TickMessage) => {
        positionsRef.current = msg.positions;
        engineDoneRef.current = msg.done;
        needsContinuousRef.current = !msg.done;
        hitDirtyRef.current = true;
        if (
          autoViewRef.current &&
          (msg.tick === 1 || (msg.alpha <= 0.2 && msg.alpha > 0.035 && msg.tick - lastFitTickRef.current >= 60))
        ) {
          lastFitTickRef.current = msg.tick;
          requestFit(false);
        }
        dirtyRef.current = true;
        if (pendingLocalFitRef.current && positionsRef.current) {
          pendingLocalFitRef.current = false;
          autoViewRef.current = false;
          kick();
        }
        if (msg.done) schedulePersist();
      },
      (state) => {
        onEngineReady?.(state);
      },
    );
    client.ambient(0);
    return () => {
      client.dispose();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestFit = useCallback((animate = true, local = true) => {
    const positions = positionsRef.current;
    const ids = indexRef.current.ids;
    if (!positions || ids.length === 0 || positions.length < ids.length * 2) return;
    const neighborhood = local ? neighborhoodRef.current : null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < ids.length; i++) {
      if (neighborhood && !neighborhood.has(i)) continue;
      minX = Math.min(minX, positions[i * 2]);
      maxX = Math.max(maxX, positions[i * 2]);
      minY = Math.min(minY, positions[i * 2 + 1]);
      maxY = Math.max(maxY, positions[i * 2 + 1]);
    }
    const { w, h } = dimsRef.current;
    if (w <= 0 || h <= 0) return;
    const to = neighborhood?.size === 1 && positions
      ? (() => {
        const index = neighborhood.keys().next().value!;
        const k = 1.2;
        return { x: w / 2 - positions[index * 2] * k, y: h / 2 - positions[index * 2 + 1] * k, k };
      })()
      : fitBounds({ minX, minY, maxX, maxY }, w, h, neighborhood ? 110 : 60);
    if (reducedMotionRef.current || !animate) {
      transformRef.current = to;
      hitDirtyRef.current = true;
      kick();
    } else {
      focusAnimRef.current = { from: transformRef.current, to, start: performance.now() };
      kick();
    }
  }, [kick]);

  // ── 布局冷却持久化（防抖，用户 + scope 隔离） ───────────────────
  const schedulePersist = useCallback(() => {
    if (!cacheScope || !signatureRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const positions = positionsRef.current;
      const signature = signatureRef.current;
      if (!positions || !signature || !cacheScope) return;
      const record: Record<string, [number, number]> = {};
      const { ids } = indexRef.current;
      for (let i = 0; i < ids.length && i * 2 + 1 < positions.length; i++) {
        record[ids[i]] = [positions[i * 2], positions[i * 2 + 1]];
      }
      void saveLayout(cacheScope, signature, record, [...pinnedRef.current]);
    }, 900);
  }, [cacheScope]);

  // ── 数据变更：重建引擎输入（带缓存位置与固定节点恢复） ───────────
  useEffect(() => {
    indexRef.current = {
      ids: nodes.map((n) => n.id),
      idToIndex: new Map(nodes.map((n, i) => [n.id, i])),
    };
    signatureRef.current =
      nodes.length > 0
        ? graphSignature(
            nodes.map((n) => n.id),
            edges.map((e) => `${e.source}::${e.target}`),
          )
        : null;
    hitDirtyRef.current = true;
    autoViewRef.current = true;
    lastFitTickRef.current = 0;
    setContextMenu(null);
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    setHoverTooltip(null);
    hoverRef.current.id = null;

    const client = clientRef.current;
    if (!client) return;
    if (nodes.length === 0) {
      positionsRef.current = null;
      client.resetBuffers();
      dirtyRef.current = true;
      return;
    }
    let cancelled = false;
    const signature = signatureRef.current!;

    const launch = (cached: Record<string, [number, number]>, pinned: string[]) => {
      if (cancelled || !clientRef.current) return;
      pinnedRef.current = new Set(pinned.filter((id) => indexRef.current.idToIndex.has(id)));
      onPinsChange?.([...pinnedRef.current]);
      const { w, h } = dimsRef.current;
      clientRef.current.init(
        nodes.map((n) => {
          const c = cached[n.id];
          return {
            id: n.id,
            x: c ? c[0] : Number.NaN,
            y: c ? c[1] : Number.NaN,
            type: typeIndex(n.group),
          };
        }),
        edges.map((e) => ({ source: e.source, target: e.target })),
        w / 2,
        h / 2,
        settings,
        1,
        [...pinnedRef.current].flatMap((id) => {
          const index = indexRef.current.idToIndex.get(id);
          return index === undefined ? [] : [index];
        }),
      );
      dirtyRef.current = true;
      kick();
    };

    if (cacheScope) {
      void loadLayout(cacheScope, signature).then((record) => {
        launch(record?.positions ?? {}, record?.pinned ?? []);
      });
    } else {
      launch({}, []);
    }
    return () => {
      cancelled = true;
    };
    // settings 不进依赖：参数变化走 restart 消息，避免重建布局
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, cacheScope, kick]);

  useEffect(() => {
    if (!exploration) {
      neighborhoodRef.current = null;
      kick();
      return;
    }
    const root = indexRef.current.idToIndex.get(exploration.rootId);
    neighborhoodRef.current = root === undefined
      ? null
      : neighborhoodDistances(adjacencyRef.current, root, exploration.depth);
    pendingLocalFitRef.current = true;
    kick();
  }, [exploration, nodes, edges, kick]);

  useEffect(() => {
    kick();
  }, [selectedId, highlightIds, displaySettings, kick]);

  useEffect(() => {
    syncAmbient();
    document.addEventListener("visibilitychange", syncAmbient);
    return () => document.removeEventListener("visibilitychange", syncAmbient);
  }, [displaySettings.ambient, syncAmbient]);

  // ── 物理参数：直接 React state → restart 消息（不轮询 localStorage） ──
  useEffect(() => {
    if (!clientRef.current?.ready) return;
    clientRef.current.restart(settings, 0.3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.repel,
    settings.centerStrength,
    settings.linkDistance,
    settings.linkStrength,
    settings.clusterForce,
  ]);

  // ── 邻接表 ────────────────────────────────────────────────────
  useEffect(() => {
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const flat = new Uint32Array(edges.length * 2);
    let m = 0;
    for (const e of edges) {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (a === undefined || b === undefined || a === b) continue;
      flat[m * 2] = a;
      flat[m * 2 + 1] = b;
      m++;
    }
    adjacencyRef.current = buildAdjacency(nodes.length, flat.subarray(0, m * 2));
  }, [nodes, edges]);

  // ── 尺寸 / DPR / 动效偏好 ─────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        const previous = dimsRef.current;
        dimsRef.current = { w: rect.width, h: rect.height };
        clientRef.current?.center(rect.width / 2, rect.height / 2);
        hitDirtyRef.current = true;
        const viewportChanged = Math.abs(rect.width - previous.w) > 80 || Math.abs(rect.height - previous.h) > 120;
        if (autoViewRef.current || viewportChanged) {
          // 桌面 ↔ 移动端、分屏和全屏会显著改变可用区域。即使此前手动
          // 缩放/聚焦过，也要重新适配，不能沿用旧视口变换把节点裁到屏外。
          if (viewportChanged) autoViewRef.current = true;
          lastFitTickRef.current = 0;
          focusAnimRef.current = null;
          requestFit(false);
        } else {
          const transform = transformRef.current;
          focusAnimRef.current = null;
          transformRef.current = {
            ...transform,
            x: transform.x + (rect.width - previous.w) / 2,
            y: transform.y + (rect.height - previous.h) / 2,
          };
          kickRef.current?.();
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [requestFit]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reducedMotionRef.current = mq.matches;
      syncAmbient();
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [syncAmbient]);

  // ── 命中网格：绘制与指针命中共用；命中前按最新位置同步重建 ────
  const rebuildHitGrid = useCallback(() => {
    const positions = positionsRef.current;
    const ids = indexRef.current.ids;
    if (!positions || ids.length === 0 || positions.length < ids.length * 2) return;
    const n = ids.length;
    const gx = new Float32Array(n);
    const gy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      gx[i] = positions[i * 2];
      gy[i] = positions[i * 2 + 1];
    }
    // 格宽随缩放自适应，保证 3x3 邻域覆盖命中半径
    hitGridRef.current = new SpatialHitGrid(Math.max(64, (HIT_TOLERANCE_PX * 1.6) / transformRef.current.k));
    hitGridRef.current.build(gx, gy, n);
    hitPositionsRef.current = { x: gx, y: gy };
    hitDirtyRef.current = false;
  }, []);

  // ── 绘制 ──────────────────────────────────────────────────────
  const clearHover = useCallback(() => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    hoverRef.current.id = null;
    setHoverTooltip(null);
    kick();
    syncAmbient();
  }, [kick, syncAmbient]);

  useEffect(() => () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const menu = contextMenuRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menu?.querySelector<HTMLButtonElement>("button")?.focus();
    const onMenuKeys = (event: KeyboardEvent) => {
      const items = menu ? [...menu.querySelectorAll<HTMLElement>("[role=menuitem]")] : [];
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(current + delta + items.length) % items.length]?.focus();
      }
      if (event.key === "Tab") setContextMenu(null);
    };
    document.addEventListener("keydown", onMenuKeys);
    return () => {
      document.removeEventListener("keydown", onMenuKeys);
      if (previous?.isConnected) previous.focus();
    };
  }, [contextMenu]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h } = dimsRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      hitDirtyRef.current = true;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 画布与界面使用同一雾灰绿底色，缩放时不露白边。
    ctx.fillStyle = GRAPH_COLORS.canvas;
    ctx.fillRect(0, 0, w, h);

    const positions = positionsRef.current;
    const data = dataRef.current;
    if (!positions || data.nodes.length === 0) {
      ctx.fillStyle = GRAPH_COLORS.ink;
      ctx.font = "13px 'Noto Sans SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("暂无图谱数据", w / 2, h / 2);
      return;
    }

    const t = transformRef.current;
    const hoverTip = hoverTooltipRef.current;
    const hoverIdForTip = hoverRef.current.id;
    if (hoverTip && hoverIdForTip) {
      const index = indexRef.current.idToIndex.get(hoverIdForTip);
      const nodeX = index === undefined ? -1000 : positions[index * 2] * t.k + t.x;
      const nodeY = index === undefined ? -1000 : positions[index * 2 + 1] * t.k + t.y;
      const width = hoverTip.offsetWidth || 320;
      const height = hoverTip.offsetHeight || 300;
      const gap = 28;
      const rightX = nodeX + gap;
      const leftX = nodeX - width - gap;
      const x = rightX + width <= w - 14 ? rightX : leftX >= 14 ? leftX : Math.max(14, Math.min(w - width - 14, rightX));
      const aboveY = nodeY - height - gap;
      const belowY = nodeY + gap;
      const y = aboveY >= 14
        ? aboveY
        : belowY + height <= h - 14
          ? belowY
          : Math.max(14, Math.min(h - height - 14, aboveY));
      hoverTip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    const { ids, idToIndex } = indexRef.current;

    // 节点与边在世界坐标中绘制；视口变换必须真正应用到 Canvas，
    // 否则适配、平移和缩放只更新命中坐标，视觉仍停留在原位置。
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const margin = 50 / t.k;
    const vx0 = -t.x / t.k - margin;
    const vy0 = -t.y / t.k - margin;
    const vx1 = (w - t.x) / t.k + margin;
    const vy1 = (h - t.y) / t.k + margin;

    const px = (i: number): number => positions[i * 2];
    const py = (i: number): number => positions[i * 2 + 1];

    const hoverId = hoverRef.current.id;
    const hoverAlpha = hoverRef.current.alpha;
    const hovering = hoverAlpha > 0.02 && hoverId !== null;
    const hoveredIndex = hovering ? idToIndex.get(hoverId) : undefined;
    const neighborSet = new Set<number>();
    if (hoveredIndex !== undefined) {
      neighborSet.add(hoveredIndex);
      for (const nb of adjacencyRef.current[hoveredIndex] ?? []) neighborSet.add(nb);
    }

    const selected = selectedRef.current;
    const highlights = highlightRef.current;
    const hasHighlight = highlights.size > 0;

    // ── 边 ──
    const display = settingsRef.current;
    const neighborhood = neighborhoodRef.current;
    ctx.lineWidth = Math.max(0.55, (0.85 / Math.max(0.6, t.k) + 0.25) * display.linkThickness);
    for (const e of data.edges) {
      const a = idToIndex.get(e.source);
      const b = idToIndex.get(e.target);
      if (a === undefined || b === undefined) continue;
      const ax = px(a);
      const ay = py(a);
      const bx = px(b);
      const by = py(b);
      if ((ax < vx0 && bx < vx0) || (ax > vx1 && bx > vx1) || (ay < vy0 && by < vy0) || (ay > vy1 && by > vy1)) {
        continue;
      }
      const inHover = neighborSet.has(a) && neighborSet.has(b);
      const inSelection = selected !== null && (e.source === selected || e.target === selected);
      const inHighlight =
        hasHighlight && ((highlights.has(e.source) && highlights.has(e.target)) || inSelection);
      let alpha = 0.38;
      const inNeighborhood = !neighborhood || (neighborhood.has(a) && neighborhood.has(b));
      if (neighborhood && !inNeighborhood) alpha = 0.045;
      let color: string = GRAPH_COLORS.sage;
      if (hovering && !inHover) alpha = 0.08;
      if (hasHighlight && !inHighlight && !inHover && !inSelection) alpha = Math.min(alpha, 0.1);
      if (inHover && hovering) {
        alpha = 0.9;
        color = GRAPH_COLORS.ink;
      }
      if (inSelection || inHighlight) {
        alpha = 0.95;
        color = GRAPH_COLORS.strong;
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      if (display.showArrows && inNeighborhood && (!hovering || inHover)) {
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy);
        if (length > 40 / t.k) {
          const ux = dx / length;
          const uy = dy / length;
          const arrowX = ax + dx * 0.66;
          const arrowY = ay + dy * 0.66;
          const size = 4.5 / t.k;
          ctx.beginPath();
          ctx.moveTo(arrowX, arrowY);
          ctx.lineTo(arrowX - ux * size - uy * size * 0.55, arrowY - uy * size + ux * size * 0.55);
          ctx.moveTo(arrowX, arrowY);
          ctx.lineTo(arrowX - ux * size + uy * size * 0.55, arrowY - uy * size - ux * size * 0.55);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // ── 节点 ──
    const lo = labelOpacity(t.k, display.textFadeThreshold, display.textFadeThreshold + 0.4);
    const baseR = NODE_BASE_RADIUS * display.nodeSize * Math.max(0.85, Math.min(1.5, t.k * 0.85 + 0.4));
    const maxDegree = Math.max(1, ...data.nodes.map((node) => degreeById.get(node.id) ?? 0));
    let hoverIndexForTop = -1;

    const drawOne = (i: number): void => {
      const x = px(i);
      const y = py(i);
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) return;
      const node = data.nodes[i];
      if (!node) return;
      const visual = visualOf(node.group);
      const degree = degreeById.get(node.id) ?? 0;
      const r = baseR * visual.scale * (1 + Math.sqrt(degree / maxDegree) * 0.6);
      const isHover = hoverId === node.id;
      const isNeighbor = neighborSet.has(i) && hovering;
      const isSelected = selected === node.id;
      const dimByHover = hovering && !isHover && !isNeighbor;
      const dimByHighlight = hasHighlight && !highlights.has(node.id) && !isSelected;
      let alpha = neighborhood && !neighborhood.has(i) ? 0.16 : 1;
      if (dimByHover) alpha = 1 - hoverAlpha * 0.72;
      if (dimByHighlight) alpha *= 0.22;

      drawNodeShape(ctx, node.group, x, y, r, {
        fill: visual.color,
        stroke: isSelected ? GRAPH_COLORS.strong : visual.color,
        lineWidth: isSelected ? 2 : isHover || isNeighbor ? 1.5 : 0.7,
        alpha,
        detail: GRAPH_COLORS.canvas,
      });

      if (pinnedRef.current.has(node.id)) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x + r * 0.85, y - r * 0.85, 2.3, 0, Math.PI * 2);
        ctx.fillStyle = GRAPH_COLORS.ink;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (isHover || isNeighbor) {
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, r + 4 + (isHover ? 3 : 0), 0, Math.PI * 2);
        ctx.strokeStyle = visual.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const forceLabel = isHover || isSelected || highlights.has(node.id) || explorationRef.current?.rootId === node.id;
      const isImportant = forceLabel || (lo > 0.5 && degree / maxDegree >= 0.45) || isNeighbor;
      if (forceLabel || (lo > 0.02 && (!neighborhood || neighborhood.has(i)) && isImportant)) {
        const labelAlpha = forceLabel ? Math.max(0.85, alpha) : lo * 0.96;
        if (labelAlpha > 0.02) {
          ctx.globalAlpha = labelAlpha * (dimByHover ? 1 - hoverAlpha * 0.6 : 1);
          ctx.fillStyle = GRAPH_COLORS.ink;
          ctx.font = `${isSelected || isHover ? 550 : 400} 12px 'Noto Sans SC', 'Microsoft YaHei', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name;
          // 文字保持屏幕像素大小，不随世界坐标缩放变糊或缩成微字。
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.font = `${isSelected || isHover ? 550 : 400} 12px 'Noto Sans SC', 'Microsoft YaHei', sans-serif`;
          const labelWidth = ctx.measureText(label).width;
          const screenX = x * t.k + t.x;
          const screenY = y * t.k + t.y;
          const labelX = Math.max(10 + labelWidth / 2, Math.min(w - 10 - labelWidth / 2, screenX));
          const labelY = Math.min(h - 36, screenY + r * t.k + 10);
          ctx.fillText(label, labelX, labelY);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    };

    for (let i = 0; i < ids.length; i++) {
      if (hoverId !== null && ids[i] === hoverId) {
        hoverIndexForTop = i; // 悬浮节点置顶最后画
        continue;
      }
      drawOne(i);
    }
    if (hoverIndexForTop >= 0) drawOne(hoverIndexForTop);
    ctx.restore();

    // ── 命中网格重建（懒：脏了才重建） ──
    if (hitDirtyRef.current) rebuildHitGrid();
  }, [rebuildHitGrid, degreeById]);

  // ── rAF 循环：仅在需要时渲染 ───────────────────────────────────
  useEffect(() => {
    const loop = (now: number) => {
      rafRef.current = 0;
      const dt = Math.min(64, Math.max(1, now - lastFrameRef.current));
      lastFrameRef.current = now;

      const anim = focusAnimRef.current;
      if (anim) {
        const p = reducedMotionRef.current ? 1 : Math.min(1, (now - anim.start) / 450);
        const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
        transformRef.current = {
          x: anim.from.x + (anim.to.x - anim.from.x) * e,
          y: anim.from.y + (anim.to.y - anim.from.y) * e,
          k: anim.from.k + (anim.to.k - anim.from.k) * e,
        };
        if (p >= 1) focusAnimRef.current = null;
        hitDirtyRef.current = true;
        dirtyRef.current = true;
      }

      const hover = hoverRef.current;
      const targetAlpha = hover.id !== null ? 1 : 0;
      const hoverSettled = Math.abs(hover.alpha - targetAlpha) < 0.004;
      if (!hoverSettled) {
        hover.alpha = easeTowards(hover.alpha, targetAlpha, 10, dt, 0.004);
        dirtyRef.current = true;
      }

        if (dirtyRef.current || needsContinuousRef.current) {
        dirtyRef.current = false;
        if (pendingLocalFitRef.current) {
          pendingLocalFitRef.current = false;
          autoViewRef.current = false;
          requestFit();
        }
        draw();
        clientRef.current?.release(); // 渲染后归还上一帧缓冲
        const stillHoverEasing = Math.abs(hoverRef.current.alpha - (hoverRef.current.id ? 1 : 0)) >= 0.004;
        if (needsContinuousRef.current || focusAnimRef.current || stillHoverEasing) {
          rafRef.current = requestAnimationFrame(loop);
        }
      }
    };
    kickRef.current = () => {
      if (rafRef.current === 0) rafRef.current = requestAnimationFrame(loop);
    };
    dirtyRef.current = true;
    kickRef.current();

    const onVisible = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      } else {
        dirtyRef.current = true;
        hitDirtyRef.current = true;
        kickRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      kickRef.current = null;
    };
  }, [draw]);

  // ── 指针交互 ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragNodeIndex: number | null = null;
    let draggingNode = false;
    let dragged = false;
    let panning = false;
    let primaryPointer: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    let pinchDist = 0;
    let pinchMid = { x: 0, y: 0 };
    let suppressClick = false;
    const pointers = new Map<number, { x: number; y: number }>();
    let samples: { x: number; y: number; time: number }[] = [];

    const local = (e: PointerEvent | WheelEvent | MouseEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    const hit = (lx: number, ly: number): number => {
      if (hitDirtyRef.current) rebuildHitGrid();
      const hp = hitPositionsRef.current;
      if (!hp) return -1;
      const t = transformRef.current;
      const [wx, wy] = screenToWorld(t, lx, ly);
      const radius = (HIT_TOLERANCE_PX * 0.8) / t.k;
      return hitGridRef.current.hit(hp.x, hp.y, wx, wy, radius);
    };
    const setHover = (id: string | null) => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
      if (hoverRef.current.id !== id) {
        hoverRef.current.id = id;
        if (!previewInsideRef.current) setHoverTooltip(null);
        kick();
      }
      if (id && settingsRef.current.showPreview && !interactingRef.current) {
        hoverTimerRef.current = window.setTimeout(() => {
          if (hoverRef.current.id === id && !interactingRef.current) {
            setHoverTooltip({ id, pinned: pinnedRef.current.has(id) });
          }
        }, reducedMotionRef.current ? 120 : 380);
      } else if (!previewInsideRef.current) {
        setHoverTooltip(null);
      }
      syncAmbient();
    };
    const releaseVelocity = (x: number, y: number, time: number): [number, number] => {
      if (reducedMotionRef.current) return [0, 0];
      const recent = samples.filter((sample) => time - sample.time <= 100);
      const first = recent[0];
      const last = recent[recent.length - 1];
      if (!first || !last) return [0, 0];
      const elapsed = Math.max(1, time - first.time);
      let vx = ((x - first.x) / elapsed) * 16;
      let vy = ((y - first.y) / elapsed) * 16;
      const speed = Math.hypot(vx, vy);
      if (time - last.time > 60 || speed < 0.5) return [0, 0];
      if (speed > 24) {
        vx *= 24 / speed;
        vy *= 24 / speed;
      }
      const zoom = transformRef.current.k;
      return [vx / zoom, vy / zoom];
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      setContextMenu(null);
      setHover(null);
      clearHover();
      interactingRef.current = true;
      syncAmbient();
      autoViewRef.current = false;
      canvas.setPointerCapture(e.pointerId);
      const [lx, ly] = local(e);
      pointers.set(e.pointerId, { x: lx, y: ly });
      if (pointers.size >= 2) {
        if (draggingNode && dragNodeIndex !== null) {
          const id = indexRef.current.ids[dragNodeIndex];
          clientRef.current?.endDrag(dragNodeIndex, id ? pinnedRef.current.has(id) : false, 0, 0);
        }
        dragNodeIndex = null;
        draggingNode = false;
        panning = false;
        dragged = true;
        const [p1, p2] = [...pointers.values()];
        pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        pinchMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        setHover(null);
        return;
      }
      primaryPointer = e.pointerId;
      downX = lastX = lx;
      downY = lastY = ly;
      samples = [{ x: lx, y: ly, time: e.timeStamp }];
      dragged = false;
      draggingNode = false;
      const idx = hit(lx, ly);
      dragNodeIndex = idx >= 0 ? idx : null;
      panning = idx < 0;
      if (panning) canvas.style.cursor = "grabbing";
      focusAnimRef.current = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const [lx, ly] = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: lx, y: ly });
      if (pointers.size >= 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        if (pinchDist > 0 && dist > 0) {
          let transform = panBy(transformRef.current, mid.x - pinchMid.x, mid.y - pinchMid.y);
          transform = zoomAround(transform, mid.x, mid.y, dist / pinchDist);
          transformRef.current = transform;
          hitDirtyRef.current = true;
          kick();
        }
        pinchDist = dist;
        pinchMid = mid;
        dragged = true;
        return;
      }
      if (primaryPointer !== null && e.pointerId !== primaryPointer) return;
      if (dragNodeIndex !== null) {
        if (!dragged && Math.hypot(lx - downX, ly - downY) <= 3) return;
        dragged = true;
        draggingNode = true;
        setHover(null);
        samples.push({ x: lx, y: ly, time: e.timeStamp });
        samples = samples.filter((sample) => e.timeStamp - sample.time <= 140).slice(-12);
        const [wx, wy] = screenToWorld(transformRef.current, lx, ly);
        clientRef.current?.target(dragNodeIndex, wx, wy);
        canvas.style.cursor = "grabbing";
        return;
      }
      if (panning && e.pointerId === primaryPointer) {
        transformRef.current = panBy(transformRef.current, lx - lastX, ly - lastY);
        lastX = lx;
        lastY = ly;
        if (Math.hypot(lx - downX, ly - downY) > 3) dragged = true;
        hitDirtyRef.current = true;
        kick();
        return;
      }
      const idx = hit(lx, ly);
      setHover(idx >= 0 ? indexRef.current.ids[idx] : null);
    };

    const finishPointer = (e: PointerEvent, cancelled: boolean) => {
      const [lx, ly] = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (dragNodeIndex !== null && draggingNode) {
        const index = dragNodeIndex;
        const id = indexRef.current.ids[index];
        const [wx, wy] = screenToWorld(transformRef.current, lx, ly);
        const [vx, vy] = cancelled ? [0, 0] : releaseVelocity(lx, ly, e.timeStamp);
        clientRef.current?.target(index, wx, wy);
        clientRef.current?.endDrag(index, id ? pinnedRef.current.has(id) : false, vx, vy);
        schedulePersist();
      }
      if (panning && !dragged && !cancelled) onSelect(null);
      if (pointers.size === 1 && primaryPointer === e.pointerId) {
        const [id, point] = [...pointers.entries()][0];
        primaryPointer = id;
        downX = lastX = point.x;
        downY = lastY = point.y;
        dragged = true;
      }
      if (pointers.size === 0) {
        primaryPointer = null;
        dragNodeIndex = null;
        draggingNode = false;
        panning = false;
        canvas.style.cursor = "grab";
      }
      interactingRef.current = false;
      syncAmbient();
      if (e.pointerType === "mouse") {
        const idx = hit(lx, ly);
        setHover(idx >= 0 ? indexRef.current.ids[idx] : null);
      }
      suppressClick = dragged || cancelled;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    };
    const onPointerUp = (e: PointerEvent) => finishPointer(e, false);
    const onPointerCancel = (e: PointerEvent) => finishPointer(e, true);

    const onClick = (e: MouseEvent) => {
      if (suppressClick || dragged) return;
      const rect = canvas.getBoundingClientRect();
      const idx = hit(e.clientX - rect.left, e.clientY - rect.top);
      if (idx >= 0) {
        const node = dataRef.current.nodes[idx];
        if (node) onSelect(node);
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (suppressClick || dragged) return;
      const rect = canvas.getBoundingClientRect();
      const idx = hit(e.clientX - rect.left, e.clientY - rect.top);
      if (idx >= 0) {
        const id = indexRef.current.ids[idx];
        if (!id) return;
        const wasPinned = pinnedRef.current.has(id);
        if (wasPinned) pinnedRef.current.delete(id);
        else pinnedRef.current.add(id);
        clientRef.current?.pin(idx, !wasPinned);
        onPinsChange?.([...pinnedRef.current]);
        if (hoverRef.current.id === id) clearHover();
        schedulePersist();
        kick();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setHover(null);
      setContextMenu(null);
      interactingRef.current = true;
      if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
      interactionTimerRef.current = window.setTimeout(() => {
        interactingRef.current = false;
        syncAmbient();
      }, 350);
      autoViewRef.current = false;
      const [lx, ly] = local(e);
      const factor = Math.exp(-e.deltaY * 0.0016);
      transformRef.current = zoomAround(transformRef.current, lx, ly, factor);
      hitDirtyRef.current = true;
      kick();
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const [lx, ly] = local(e);
      const idx = hit(lx, ly);
      if (idx < 0) {
        setContextMenu(null);
        return;
      }
      const id = indexRef.current.ids[idx];
      const node = id ? dataRef.current.nodes[idx] : null;
      if (!id || !node) return;
      setHover(null);
      onSelect(node);
      setContextMenu({ id, x: Math.min(lx, dimsRef.current.w - 210), y: Math.min(ly, dimsRef.current.h - 240) });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "+" || event.key === "=" || event.key === "-") && event.target === canvas) {
        event.preventDefault();
        transformRef.current = zoomAround(transformRef.current, dimsRef.current.w / 2, dimsRef.current.h / 2, event.key === "-" ? 0.8 : 1.25);
        hitDirtyRef.current = true;
        kick();
        return;
      }
      if (event.key !== "Escape") return;
      setContextMenu(null);
      if (hoverRef.current.id || hoverTooltipRef.current) {
        clearHover();
        event.stopPropagation();
      }
    };

    const onLeave = () => {
      if (pointers.size > 0) return;
      if (hoverRef.current.id) {
        if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = window.setTimeout(() => {
          if (!previewInsideRef.current) clearHover();
        }, 650);
      } else clearHover();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [kick, onSelect, onPinsChange, schedulePersist, syncAmbient, clearHover, rebuildHitGrid]);

  // 首帧由 worker tick 触发视野适配，不轮询布局状态。

  // ── 深链/搜索定位 ─────────────────────────────────────────────
  const focusNodeInternal = useCallback(
    (id: string) => {
      const idx = indexRef.current.idToIndex.get(id);
      const positions = positionsRef.current;
      if (idx === undefined || !positions) return;
      autoViewRef.current = false;
      const { w, h } = dimsRef.current;
      const x = positions[idx * 2];
      const y = positions[idx * 2 + 1];
      const t = transformRef.current;
      const k = Math.max(t.k, 1.1);
      const to: ViewTransform = {
        x: w / 2 - x * k,
        y: h / 2 - y * k,
        k,
      };
      if (reducedMotionRef.current) {
        transformRef.current = to;
        hitDirtyRef.current = true;
        kick();
      } else {
        focusAnimRef.current = { from: transformRef.current, to, start: performance.now() };
        kick();
      }
    },
    [kick],
  );

  useEffect(() => {
    if (!focusRequest) return;
    focusNodeInternal(focusRequest.nodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  // ── 命令式 API（侧栏按钮/页面控制） ────────────────────────────
  useImperativeHandle(
    ref,
    (): ObsidianGraphHandle => ({
      reheat: (alpha = 0.6) => {
        clientRef.current?.heat(alpha);
        kick();
      },
      focusNode: (id: string) => {
        focusNodeInternal(id);
        onSelect(dataRef.current.nodes.find((n) => n.id === id) ?? null);
      },
      selectNode: (id: string | null) => {
        if (id) focusNodeInternal(id);
        onSelect(id ? dataRef.current.nodes.find((n) => n.id === id) ?? null : null);
      },
      togglePin: (id: string) => {
        const idx = indexRef.current.idToIndex.get(id);
        if (idx === undefined) return false;
        const wasPinned = pinnedRef.current.has(id);
        if (wasPinned) pinnedRef.current.delete(id);
        else pinnedRef.current.add(id);
        clientRef.current?.pin(idx, !wasPinned);
        onPinsChange?.([...pinnedRef.current]);
        schedulePersist();
        kick();
        return !wasPinned;
      },
      fitView: requestFit,
      fitGlobal: () => {
        autoViewRef.current = false;
        requestFit(true, false);
      },
      zoomBy: (factor: number) => {
        const { w, h } = dimsRef.current;
        autoViewRef.current = false;
        transformRef.current = zoomAround(transformRef.current, w / 2, h / 2, factor);
        hitDirtyRef.current = true;
        kick();
      },
    }),
    [kick, onSelect, onPinsChange, schedulePersist, focusNodeInternal, requestFit],
  );

  return (
    <div ref={containerRef} className={`graph-canvas-wrap ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel ?? "知识图谱画布：拖拽平移，滚轮缩放，点击节点查看详情，双击节点解除固定"}
        className="graph-canvas"
      />
      {hoverTooltip ? (() => {
        const node = nodes.find((item) => item.id === hoverTooltip.id);
        return node ? (
          <div
            ref={hoverTooltipRef}
            className="graph-hover-card"
            role="dialog"
            aria-label={`${node.name}节点预览`}
            onPointerEnter={() => {
              previewInsideRef.current = true;
              if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
              syncAmbient();
            }}
            onPointerLeave={() => {
              previewInsideRef.current = false;
              clearHover();
            }}
          >
            <ObsidianNodePreview node={node} nodes={nodes} edges={edges} onExplore={onExplore} onNavigate={clearHover} />
            <span className="graph-hover-card__hint">点击节点查看完整详情 · Esc 收起</span>
          </div>
        ) : null;
      })() : null}
      {contextMenu ? (() => {
        const node = nodes.find((item) => item.id === contextMenu.id);
        if (!node) return null;
        return (
          <div
            ref={contextMenuRef}
            className="graph-context-menu"
            role="menu"
            aria-label={`${node.name}节点操作`}
            style={{ left: Math.max(8, contextMenu.x), top: Math.max(8, contextMenu.y) }}
          >
            <strong>{node.name}</strong>
            <button type="button" role="menuitem" onClick={() => { onExplore(node.id); setContextMenu(null); }}>
              <Network size={15} />从这里探索
            </button>
            <button type="button" role="menuitem" onClick={() => {
              const idx = indexRef.current.idToIndex.get(node.id);
              if (idx !== undefined) {
                const pinned = !pinnedRef.current.has(node.id);
                if (pinned) pinnedRef.current.add(node.id); else pinnedRef.current.delete(node.id);
                clientRef.current?.pin(idx, pinned);
                onPinsChange?.([...pinnedRef.current]);
                schedulePersist();
                kick();
              }
              setContextMenu(null);
            }}>
              <Pin size={15} />{pinnedRef.current.has(node.id) ? "解除固定" : "固定节点"}
            </button>
            <button type="button" role="menuitem" onClick={() => { focusNodeInternal(node.id); setContextMenu(null); }}>
              <Scan size={15} />居中查看
            </button>
            {node.documentId ? (
              <a role="menuitem" href={`/documents?doc=${encodeURIComponent(node.documentId)}`}>
                <FileText size={15} />查看关联文档
              </a>
            ) : null}
          </div>
        );
      })() : null}
    </div>
  );
});
