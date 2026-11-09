/**
 * 图谱主线程纯数学/工具函数：视图变换、命中测试网格、LOD、邻接表。
 * 全部无副作用、无 DOM 依赖，便于 Vitest 覆盖。
 */

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export const ZOOM_MIN = 0.08;
export const ZOOM_MAX = 6;

export function clampZoom(k: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

export const IDENTITY: ViewTransform = { x: 0, y: 0, k: 1 };

/** 世界坐标 → 屏幕坐标 */
export function worldToScreen(t: ViewTransform, x: number, y: number): [number, number] {
  return [x * t.k + t.x, y * t.k + t.y];
}

/** 屏幕坐标 → 世界坐标 */
export function screenToWorld(t: ViewTransform, sx: number, sy: number): [number, number] {
  return [(sx - t.x) / t.k, (sy - t.y) / t.k];
}

/** 围绕屏幕点 (sx, sy) 缩放，返回新变换 */
export function zoomAround(t: ViewTransform, sx: number, sy: number, factor: number): ViewTransform {
  const k = clampZoom(t.k * factor);
  const effective = k / t.k;
  return {
    k,
    x: sx - (sx - t.x) * effective,
    y: sy - (sy - t.y) * effective,
  };
}

/** 平移 delta（屏幕像素） */
export function panBy(t: ViewTransform, dx: number, dy: number): ViewTransform {
  return { x: t.x + dx, y: t.y + dy, k: t.k };
}

/** 让世界坐标包围盒居中并适配视口（返回新变换） */
export function fitBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  padding = 60,
): ViewTransform {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (!(w > 0) || !(h > 0) || width <= 0 || height <= 0) {
    return { x: width / 2, y: height / 2, k: 1 };
  }
  const k = clampZoom(Math.min((width - padding * 2) / w, (height - padding * 2) / h, 1.6));
  return {
    k,
    x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
    y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
  };
}

/** 指数趋近缓动单步（帧率无关），返回是否已收敛 */
export function easeTowards(current: number, target: number, rate: number, dtMs: number, epsilon = 0.001): number {
  const t = 1 - Math.exp(-rate * (dtMs / 1000));
  const next = current + (target - current) * t;
  return Math.abs(target - next) < epsilon ? target : next;
}

/**
 * 标签 LOD：缩放低于 low 时隐藏，low→mid 渐入；hover/选中由调用方单独处理。
 */
export function labelOpacity(zoom: number, low = 0.55, mid = 0.9): number {
  if (zoom <= low) return 0;
  if (zoom >= mid) return 1;
  return (zoom - low) / (mid - low);
}

/**
 * 均匀网格命中索引：把节点坐标插入格子，查询时只检查 3x3 邻域。
 * 简单、确定性、无排序；radius 用统一查询半径（视觉半径 + 容差）。
 */
export class SpatialHitGrid {
  private cell: number;
  private minX = 0;
  private minY = 0;
  private dimX = 1;
  private dimY = 1;
  private buckets: Int32Array = new Int32Array(0);
  private next: Int32Array = new Int32Array(0);
  private count = 0;

  constructor(cell = 64) {
    this.cell = Math.max(8, cell);
  }

  build(x: Float32Array | number[], y: Float32Array | number[], n: number): void {
    this.count = n;
    this.next = new Int32Array(n).fill(-1);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
      if (x[i] < minX) minX = x[i];
      if (y[i] < minY) minY = y[i];
      if (x[i] > maxX) maxX = x[i];
      if (y[i] > maxY) maxY = y[i];
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 1;
      maxY = 1;
    }
    this.minX = minX;
    this.minY = minY;
    this.dimX = Math.max(1, Math.min(2048, Math.ceil((maxX - minX) / this.cell) + 1));
    this.dimY = Math.max(1, Math.min(2048, Math.ceil((maxY - minY) / this.cell) + 1));
    this.buckets = new Int32Array(this.dimX * this.dimY).fill(-1);
    for (let i = 0; i < n; i++) {
      const [gx, gy] = this.cellOf(x[i], y[i]);
      const idx = gy * this.dimX + gx;
      this.next[i] = this.buckets[idx];
      this.buckets[idx] = i;
    }
  }

  private cellOf(x: number, y: number): [number, number] {
    const gx = Number.isFinite(x) ? Math.max(0, Math.min(this.dimX - 1, ((x - this.minX) / this.cell) | 0)) : 0;
    const gy = Number.isFinite(y) ? Math.max(0, Math.min(this.dimY - 1, ((y - this.minY) / this.cell) | 0)) : 0;
    return [gx, gy];
  }

  /** 返回距 (wx, wy) 最近且半径内的节点索引；无命中返回 -1 */
  hit(x: Float32Array | number[], y: Float32Array | number[], wx: number, wy: number, radius: number): number {
    const [gx, gy] = this.cellOf(wx, wy);
    let best = -1;
    let bestD2 = radius * radius;
    const x0 = Math.max(0, gx - 1);
    const x1 = Math.min(this.dimX - 1, gx + 1);
    const y0 = Math.max(0, gy - 1);
    const y1 = Math.min(this.dimY - 1, gy + 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let j = this.buckets[cy * this.dimX + cx]; j !== -1; j = this.next[j]) {
          if (j >= this.count) continue;
          const dx = x[j] - wx;
          const dy = y[j] - wy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) {
            bestD2 = d2;
            best = j;
          }
        }
      }
    }
    return best;
  }
}

/** 无向邻接表 */
export function buildAdjacency(nodeCount: number, edges: Uint32Array): Uint32Array[] {
  const adj: Uint32Array[] = new Array(nodeCount);
  const counts = new Uint32Array(nodeCount);
  for (let e = 0; e < edges.length; e += 2) {
    counts[edges[e]]++;
    counts[edges[e + 1]]++;
  }
  for (let i = 0; i < nodeCount; i++) adj[i] = new Uint32Array(counts[i]);
  const fill = new Uint32Array(nodeCount);
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e];
    const b = edges[e + 1];
    adj[a][fill[a]++] = b;
    adj[b][fill[b]++] = a;
  }
  return adj;
}

/** 从根节点逐层扩展的无向邻域；值为距离根节点的跳数。 */
export function neighborhoodDistances(
  adjacency: readonly Uint32Array[],
  rootIndex: number,
  depth: number,
): Map<number, number> {
  const distances = new Map<number, number>();
  if (rootIndex < 0 || rootIndex >= adjacency.length) return distances;
  const maxDepth = Math.max(0, Math.floor(depth));
  distances.set(rootIndex, 0);
  let frontier = [rootIndex];
  for (let level = 1; level <= maxDepth; level++) {
    const next: number[] = [];
    for (const index of frontier) {
      for (const neighbor of adjacency[index] ?? []) {
        if (distances.has(neighbor)) continue;
        distances.set(neighbor, level);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return distances;
}

/** 触控/鼠标目标最小尺寸（WCAG 建议可点区域 ≥ 24px，含容差取 30） */
export const HIT_TOLERANCE_PX = 30;
