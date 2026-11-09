"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { groupMeta } from "@/lib/demo-data";
import type { KnowledgeGraphData, KnowledgeNode } from "@/lib/research-types";

interface HaloGraphProps {
  data: KnowledgeGraphData;
  selectedId?: string | null;
  onSelect?: (node: KnowledgeNode | null) => void;
  compact?: boolean;
  className?: string;
}

interface Point { x: number; y: number }
interface TooltipState { node: KnowledgeNode; x: number; y: number }

const SURFACE = "#0b1114";
const INK = "#e8efef";
const MUTED = "#91a0a4";

export function HaloGraph({ data, selectedId = null, onSelect, compact = false, className = "" }: HaloGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Map<string, Point>>(new Map());
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ kind: "node" | "pan" | null; id?: string; startX: number; startY: number; panX: number; panY: number; moved: boolean }>({ kind: null, startX: 0, startY: 0, panX: 0, panY: 0, moved: false });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [zoomLabel, setZoomLabel] = useState(100);
  const nodeMap = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const effectivePaused = paused || reducedMotion;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const layout = new Map<string, Point>();
    const groups = {
      experiment: data.nodes.filter((node) => node.group === "experiment"),
      knowledge: data.nodes.filter((node) => node.group === "knowledge"),
      resource: data.nodes.filter((node) => node.group === "resource"),
    };
    groups.experiment.forEach((node, index) => {
      const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(groups.experiment.length, 1));
      const radius = groups.experiment.length === 1 ? 0 : 0.16;
      layout.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    groups.knowledge.forEach((node, index) => {
      const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(groups.knowledge.length, 1)) + 0.16;
      layout.set(node.id, { x: Math.cos(angle) * 0.51, y: Math.sin(angle) * 0.51 });
    });
    groups.resource.forEach((node, index) => {
      const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(groups.resource.length, 1)) + 0.52;
      layout.set(node.id, { x: Math.cos(angle) * 0.88, y: Math.sin(angle) * 0.88 });
    });
    layoutRef.current = layout;
  }, [data.nodes]);

  const projection = () => {
    const { width, height } = sizeRef.current;
    const { zoom, panX, panY } = viewRef.current;
    return {
      cx: width / 2 + panX,
      cy: height / 2 + panY,
      scale: Math.min(width, height) * 0.42 * zoom,
    };
  };

  const pointFor = (point: Point) => {
    const { cx, cy, scale } = projection();
    return { x: cx + point.x * scale, y: cy + point.y * scale };
  };

  const hitTest = (x: number, y: number) => {
    let closest: { node: KnowledgeNode; distance: number } | null = null;
    for (const node of data.nodes) {
      const point = layoutRef.current.get(node.id);
      if (!point) continue;
      const screen = pointFor(point);
      const distance = Math.hypot(screen.x - x, screen.y - y);
      if (distance <= 24 && (!closest || distance < closest.distance)) closest = { node, distance };
    }
    return closest?.node ?? null;
  };

  const updateZoom = (next: number) => {
    viewRef.current.zoom = Math.max(0.55, Math.min(2.4, next));
    setZoomLabel(Math.round(viewRef.current.zoom * 100));
  };

  const resetView = () => {
    viewRef.current = { zoom: 1, panX: 0, panY: 0 };
    setZoomLabel(100);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const draw = (time: number) => {
      const { width, height, dpr } = sizeRef.current;
      if (width <= 0 || height <= 0) {
        frame = requestAnimationFrame(draw);
        return;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const { cx, cy, scale } = projection();
      const motionTime = effectivePaused ? 0 : time;
      const selectedNeighbors = new Set<string>();
      if (selectedId) {
        selectedNeighbors.add(selectedId);
        data.edges.forEach((edge) => {
          if (edge.source === selectedId) selectedNeighbors.add(edge.target);
          if (edge.target === selectedId) selectedNeighbors.add(edge.source);
        });
      }

      const halo = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(scale, 1));
      halo.addColorStop(0, "rgba(57,135,229,0.065)");
      halo.addColorStop(0.48, "rgba(25,158,112,0.025)");
      halo.addColorStop(1, "rgba(11,17,20,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);

      context.lineWidth = 1;
      [0.28, 0.52, 0.88, 1.02].forEach((radius, index) => {
        context.beginPath();
        context.arc(cx, cy, scale * radius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(151,180,187,${index === 3 ? 0.07 : 0.11})`;
        context.stroke();
      });

      const rotation = motionTime * 0.000018;
      const total = Math.max(data.nodes.length, 1);
      data.nodes.forEach((node, index) => {
        const arc = Math.PI * 2 / total;
        context.beginPath();
        context.arc(cx, cy, scale * 1.02, rotation + index * arc + 0.025, rotation + (index + 1) * arc - 0.025);
        context.strokeStyle = groupMeta[node.group].color;
        context.globalAlpha = selectedId && !selectedNeighbors.has(node.id) ? 0.12 : 0.48;
        context.lineWidth = 2;
        context.stroke();
      });
      context.globalAlpha = 1;

      for (let index = 0; index < 64; index += 1) {
        const angle = index * Math.PI * 2 / 64 - rotation * 0.65;
        const inner = scale * (index % 8 === 0 ? 1.055 : 1.07);
        const outer = scale * 1.09;
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        context.strokeStyle = index % 8 === 0 ? "rgba(151,180,187,0.26)" : "rgba(151,180,187,0.10)";
        context.lineWidth = 1;
        context.stroke();
      }

      data.edges.forEach((edge, index) => {
        const sourceLayout = layoutRef.current.get(edge.source);
        const targetLayout = layoutRef.current.get(edge.target);
        const sourceNode = nodeMap.get(edge.source);
        if (!sourceLayout || !targetLayout || !sourceNode) return;
        const source = pointFor(sourceLayout);
        const target = pointFor(targetLayout);
        const active = selectedId && (edge.source === selectedId || edge.target === selectedId);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.strokeStyle = active ? groupMeta[sourceNode.group].color : "#6e8389";
        context.globalAlpha = selectedId ? (active ? 0.85 : 0.08) : 0.28;
        context.lineWidth = active ? 1.8 : 1;
        context.stroke();

        if (!effectivePaused && (!selectedId || active)) {
          const progress = (motionTime * 0.00009 + index * 0.173) % 1;
          const x = source.x + (target.x - source.x) * progress;
          const y = source.y + (target.y - source.y) * progress;
          context.beginPath();
          context.arc(x, y, active ? 2.2 : 1.5, 0, Math.PI * 2);
          context.fillStyle = groupMeta[sourceNode.group].color;
          context.globalAlpha = active ? 0.95 : 0.65;
          context.fill();
        }
      });
      context.globalAlpha = 1;

      data.nodes.forEach((node, index) => {
        const layout = layoutRef.current.get(node.id);
        if (!layout) return;
        const point = pointFor(layout);
        const selected = selectedId === node.id;
        const hovered = hoverRef.current === node.id;
        const dimmed = selectedId && !selectedNeighbors.has(node.id);
        const color = groupMeta[node.group].color;
        const radius = node.group === "experiment" ? 8 : 6.5;
        context.save();
        context.globalAlpha = dimmed ? 0.22 : 1;
        if (selected || hovered) {
          context.shadowColor = color;
          context.shadowBlur = 22;
        }
        context.beginPath();
        if (node.group === "resource") {
          context.moveTo(point.x, point.y - radius - 1);
          context.lineTo(point.x + radius + 1, point.y);
          context.lineTo(point.x, point.y + radius + 1);
          context.lineTo(point.x - radius - 1, point.y);
          context.closePath();
        } else if (node.group === "knowledge") {
          context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
        } else {
          context.arc(point.x, point.y, radius + (selected ? 1.5 : 0), 0, Math.PI * 2);
        }
        context.fillStyle = color;
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = SURFACE;
        context.lineWidth = 2;
        context.stroke();
        if (selected) {
          context.beginPath();
          context.arc(point.x, point.y, radius + 7, 0, Math.PI * 2);
          context.strokeStyle = color;
          context.globalAlpha = 0.55;
          context.lineWidth = 1;
          context.stroke();
        }
        context.restore();

        const showLabel = !compact || node.group === "experiment" || selected || hovered;
        if (showLabel) {
          const label = node.name.length > 14 ? `${node.name.slice(0, 13)}…` : node.name;
          context.font = `${selected || hovered ? 600 : 500} ${compact ? 10 : 11}px system-ui, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          const labelY = point.y + (index % 3 === 0 && node.group !== "experiment" ? -20 : 21);
          const metrics = context.measureText(label);
          context.fillStyle = "rgba(11,17,20,0.86)";
          context.fillRect(point.x - metrics.width / 2 - 4, labelY - 8, metrics.width + 8, 16);
          context.fillStyle = dimmed ? "#637277" : selected || hovered ? INK : MUTED;
          context.fillText(label, point.x, labelY);
        }
      });

      const coreRadius = 3 + (effectivePaused ? 0 : Math.sin(motionTime * 0.002) * 0.7);
      context.beginPath();
      context.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      context.fillStyle = "#b7d9e0";
      context.globalAlpha = 0.55;
      context.fill();
      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [data, compact, selectedId, nodeMap, effectivePaused]);

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const node = hitTest(point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind: node ? "node" : "pan", id: node?.id, startX: point.x, startY: point.y, panX: viewRef.current.panX, panY: viewRef.current.panY, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const drag = dragRef.current;
    if (drag.kind) {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.kind === "node" && drag.id) {
        const { cx, cy, scale } = projection();
        layoutRef.current.set(drag.id, { x: (point.x - cx) / scale, y: (point.y - cy) / scale });
      } else if (drag.kind === "pan") {
        viewRef.current.panX = drag.panX + dx;
        viewRef.current.panY = drag.panY + dy;
      }
      setTooltip(null);
      return;
    }
    const node = hitTest(point.x, point.y);
    hoverRef.current = node?.id ?? null;
    event.currentTarget.style.cursor = node ? "pointer" : "grab";
    if (node) {
      setTooltip({ node, x: Math.min(point.x + 16, sizeRef.current.width - 220), y: Math.max(12, point.y - 24) });
    } else setTooltip(null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.kind === "node" && drag.id && !drag.moved) onSelect?.(nodeMap.get(drag.id) ?? null);
    dragRef.current = { kind: null, startX: 0, startY: 0, panX: 0, panY: 0, moved: false };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const current = data.nodes.findIndex((node) => node.id === selectedId);
      const next = data.nodes[(current + direction + data.nodes.length) % data.nodes.length];
      if (next) onSelect?.(next);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      updateZoom(viewRef.current.zoom + 0.15);
    } else if (event.key === "-") {
      event.preventDefault();
      updateZoom(viewRef.current.zoom - 0.15);
    } else if (event.key === "0") {
      event.preventDefault();
      resetView();
    } else if (event.key === " ") {
      event.preventDefault();
      setPaused((value) => !value);
    }
  };

  return (
    <div ref={containerRef} className={`halo-graph ${compact ? "compact" : ""} ${className}`}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`知识图谱，包含 ${data.nodes.length} 个实体和 ${data.edges.length} 条关系。方向键切换节点，加减键缩放，空格暂停动画。`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => { if (!dragRef.current.kind) { hoverRef.current = null; setTooltip(null); } }}
        onWheel={(event) => { event.preventDefault(); updateZoom(viewRef.current.zoom * Math.exp(-event.deltaY * 0.001)); }}
        onKeyDown={handleKeyDown}
      />

      <div className="graph-legend" aria-label="图例">
        {(Object.keys(groupMeta) as Array<keyof typeof groupMeta>).map((group) => (
          <span key={group}><i className={`legend-mark ${group}`} style={{ background: groupMeta[group].color }} />{groupMeta[group].label}</span>
        ))}
      </div>

      <div className="graph-controls" aria-label="图谱视图控制">
        {!compact ? <span className="zoom-label">{zoomLabel}%</span> : null}
        {!compact ? <button onClick={() => updateZoom(viewRef.current.zoom - 0.15)} aria-label="缩小"><Minus size={15} /></button> : null}
        {!compact ? <button onClick={() => updateZoom(viewRef.current.zoom + 0.15)} aria-label="放大"><Plus size={15} /></button> : null}
        <button onClick={() => setPaused((value) => !value)} aria-label={effectivePaused ? "播放动画" : "暂停动画"}>{effectivePaused ? <Play size={15} /> : <Pause size={15} />}</button>
        <button onClick={resetView} aria-label="重置视图">{compact ? <Maximize2 size={15} /> : <RotateCcw size={15} />}</button>
      </div>

      {tooltip ? (
        <div className="graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
          <span className="tooltip-type">{tooltip.node.type} · {tooltip.node.year}</span>
          <strong>{tooltip.node.name}</strong>
          <p>{tooltip.node.summary}</p>
          <span className="tooltip-hint">点击查看关联详情</span>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">{selectedId ? `已选择 ${nodeMap.get(selectedId)?.name ?? "节点"}` : "未选择节点"}</span>
    </div>
  );
}
