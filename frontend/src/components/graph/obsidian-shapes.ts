import type { KnowledgeGroup } from "@/lib/research-types";
import { groupMeta } from "@/lib/demo-data";

export interface TypeVisual {
  color: string;
  label: string;
  scale: number;
}

/** Static canvas tokens avoid reading CSS variables on every animation frame. */
export const GRAPH_COLORS = {
  canvas: "#090f12",
  panel: "#111a1f",
  sage: "#738a92",
  ink: "#a9b9bd",
  strong: "#d9e8e5",
  mist: "#52666e",
} as const;

export const TYPE_VISUALS: Record<KnowledgeGroup, TypeVisual> = {
  experiment: { color: groupMeta.experiment.color, label: "实验", scale: 1.28 },
  resource: { color: groupMeta.resource.color, label: "资源", scale: 0.96 },
  knowledge: { color: groupMeta.knowledge.color, label: "知识", scale: 1.02 },
};

export function visualOf(type: KnowledgeGroup): TypeVisual {
  return TYPE_VISUALS[type] ?? TYPE_VISUALS.knowledge;
}

export const NODE_BASE_RADIUS = 6;

export function drawNodeShape(
  ctx: CanvasRenderingContext2D,
  type: KnowledgeGroup,
  x: number,
  y: number,
  r: number,
  opts: { fill: string; stroke: string; lineWidth: number; alpha?: number; detail?: string },
): void {
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (type === "resource") {
    ctx.moveTo(x, y - r * 1.12);
    ctx.lineTo(x + r * 1.12, y);
    ctx.lineTo(x, y + r * 1.12);
    ctx.lineTo(x - r * 1.12, y);
    ctx.closePath();
  } else if (type === "knowledge") {
    const side = r * 0.92;
    ctx.rect(x - side, y - side, side * 2, side * 2);
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = opts.fill;
  ctx.fill();
  ctx.strokeStyle = opts.stroke;
  ctx.lineWidth = opts.lineWidth;
  ctx.stroke();

  if (type === "experiment") {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.54, 0, Math.PI * 2);
    ctx.strokeStyle = opts.detail ?? GRAPH_COLORS.canvas;
    ctx.lineWidth = Math.max(0.8, opts.lineWidth * 0.7);
    ctx.stroke();
  } else if (type === "knowledge") {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = opts.detail ?? GRAPH_COLORS.canvas;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
