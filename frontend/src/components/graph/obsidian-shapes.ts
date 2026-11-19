import type { KnowledgeGroup } from "@/lib/research-types";
import { groupMeta } from "@/lib/demo-data";

export interface TypeVisual {
  color: string;
  label: string;
  scale: number;
}

/** Static canvas tokens avoid reading CSS variables on every animation frame. */
export const GRAPH_COLORS = {
  canvas: "#f6f3eb",
  panel: "#fffdf7",
  sage: "#aaa79f",
  ink: "#55544f",
  strong: "#6d4ba8",
  mist: "#c8c3b8",
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
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = opts.fill;
  ctx.fill();
  ctx.strokeStyle = opts.stroke;
  ctx.lineWidth = opts.lineWidth;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
