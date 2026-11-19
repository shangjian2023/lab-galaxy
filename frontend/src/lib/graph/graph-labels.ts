import type { KnowledgeGroup } from "@/lib/research-types";

export interface GraphLabelPlacement {
  id: string;
  group: KnowledgeGroup;
  force: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: GraphLabelPlacement, b: GraphLabelPlacement, gap: number) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

export interface GraphLabelLayoutOptions {
  /** 普通标签的视口密度预算；force 标签不计入，也不会被预算裁掉。 */
  maxVisible?: number;
  /** 标签矩形之间的额外屏幕像素间距。 */
  gap?: number;
}

/**
 * 小图保留全部标签；大图按实验/资源/知识轮流选择互不遮挡的标签。
 * 不使用度数或紫色实验优先策略，悬浮/选中标签由 force 无条件保留。
 */
export function planGraphLabels(
  placements: readonly GraphLabelPlacement[],
  options: GraphLabelLayoutOptions = {},
): Set<string> {
  const visible = new Set<string>();
  if (placements.length <= 60) {
    for (const placement of placements) visible.add(placement.id);
    return visible;
  }

  const maxVisible = Math.max(0, Math.floor(options.maxVisible ?? Number.POSITIVE_INFINITY));
  const gap = Math.max(0, options.gap ?? 3);
  const accepted: GraphLabelPlacement[] = [];
  for (const placement of placements.filter((item) => item.force)) {
    visible.add(placement.id);
    accepted.push(placement);
  }
  const groups: KnowledgeGroup[] = ["experiment", "resource", "knowledge"];
  const queues = groups.map((group) => placements.filter((item) => item.group === group && !item.force));
  const remaining = queues.reduce((sum, queue) => sum + queue.length, 0);
  let regularVisible = 0;
  for (let index = 0; index < remaining && regularVisible < maxVisible; index += 1) {
    for (const queue of queues) {
      if (regularVisible >= maxVisible) break;
      const placement = queue[index];
      if (!placement) continue;
      if (accepted.some((other) => overlaps(placement, other, gap))) continue;
      visible.add(placement.id);
      accepted.push(placement);
      regularVisible += 1;
    }
  }
  return visible;
}
