/**
 * 纯 TS 布局引擎 —— Rust 核心（crates/graph-layout/src/sim.rs）的同协议移植。
 * 当 WASM 模块不可用时由 worker 使用；对外始终如实标注 engine: "ts-fallback"。
 * 数值行为与 Rust 版本一致（同样的固定步长、网格斥力、渐进固定边张力），
 * 但浮点细节不保证与 wasm 位级一致 —— 引擎标签用于区分。
 */

import {
  ALPHA_DONE,
  type EngineSettings,
  type InitLink,
  type InitNode,
  type LayoutEngine,
} from "./protocol";

const ALPHA_DECAY = 0.0228;
const VELOCITY_DECAY = 0.6;
const MAX_TICKS = 3000;

/** splitmix64 + xoshiro256** 的 32 位近似（Number 精度内确定性） */
class Rng {
  private s0: number;
  private s1: number;

  constructor(seed: number) {
    let z = (seed >>> 0 || 0x9e3779b9) >>> 0;
    const next = (): number => {
      z = (z + 0x6d2b79f5) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
  }

  /** [0,1) */
  next(): number {
    let t = (this.s0 + 0x6d2b79f5) >>> 0;
    this.s0 = this.s1;
    let r = Math.imul(this.s1 ^ (this.s1 >>> 15), 1 | this.s1);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    this.s1 = r >>> 0;
    r = Math.imul(this.s1 ^ (this.s1 >>> 15), 1 | this.s1);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    this.s1 = (r ^ (t >>> 0)) >>> 0;
    return ((this.s1 >>> 8) / 16777216) % 1;
  }

  /** [-extent, extent) */
  symmetric(extent: number): number {
    return (this.next() * 2 - 1) * extent;
  }
}

function sanitize(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

function sanitizeSettings(s: EngineSettings): EngineSettings {
  const repel = Number.isFinite(s.repel) && s.repel !== 0 ? Math.abs(s.repel) : 300;
  return {
    repel: Math.min(4000, Math.max(1, repel)),
    centerStrength: Math.min(1, Math.max(0, sanitize(s.centerStrength, 0.05))),
    linkDistance: Math.min(600, Math.max(20, sanitize(s.linkDistance, 150))),
    linkStrength: Math.min(4, Math.max(0, sanitize(s.linkStrength, 0.5))),
    clusterForce: Math.min(1, Math.max(0, sanitize(s.clusterForce, 0.1))),
  };
}

interface Grid {
  cell: number;
  minX: number;
  minY: number;
  dimX: number;
  dimY: number;
  cells: Int32Array; // 每格链表头（下一节点索引），-1 结尾
  next: Int32Array;
}

const MAX_GRID_DIM = 4096;

function buildGrid(x: Float64Array, y: Float64Array, n: number, cutoff: number): Grid {
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
  const degenerate = !(maxX > minX) || !(maxY > minY);
  const cell = Math.max(1, cutoff);
  const dimX = degenerate
    ? 1
    : Math.min(MAX_GRID_DIM, Math.floor((maxX - minX) / cell) + 1);
  const dimY = degenerate
    ? 1
    : Math.min(MAX_GRID_DIM, Math.floor((maxY - minY) / cell) + 1);
  const grid: Grid = {
    cell,
    minX: degenerate ? 0 : minX,
    minY: degenerate ? 0 : minY,
    dimX,
    dimY,
    cells: new Int32Array(dimX * dimY).fill(-1),
    next: new Int32Array(n).fill(-1),
  };
  for (let i = 0; i < n; i++) {
    const gx = cellOf(grid, x[i], y[i])[0];
    const gy = cellOf(grid, x[i], y[i])[1];
    const idx = gy * dimX + gx;
    grid.next[i] = grid.cells[idx];
    grid.cells[idx] = i;
  }
  return grid;
}

function cellOf(grid: Grid, x: number, y: number): [number, number] {
  const fx = Number.isFinite(x) ? Math.max(0, (x - grid.minX) / grid.cell) : 0;
  const fy = Number.isFinite(y) ? Math.max(0, (y - grid.minY) / grid.cell) : 0;
  return [Math.min(grid.dimX - 1, fx | 0), Math.min(grid.dimY - 1, fy | 0)];
}

export class TsLayoutEngine implements LayoutEngine {
  readonly engine = "ts-fallback" as const;

  private n = 0;
  private x = new Float64Array(0);
  private y = new Float64Array(0);
  private vx = new Float64Array(0);
  private vy = new Float64Array(0);
  private nodeType: Uint8Array = new Uint8Array(0);
  private bucketOfType: Uint8Array = new Uint8Array(0);
  private fixedFlags: Uint8Array = new Uint8Array(0);
  private targetX = new Float64Array(0);
  private targetY = new Float64Array(0);
  private radius = new Float64Array(0);
  private edgesArr: Uint32Array = new Uint32Array(0);
  private anchors: [number, number][] = [];
  private alphaValue = 1;
  private settings: EngineSettings = sanitizeSettings({
    repel: 300,
    centerStrength: 0.05,
    linkDistance: 150,
    linkStrength: 0.5,
    clusterForce: 0.1,
  });
  private cx = 0;
  private cy = 0;
  private tickCount = 0;
  private pinSeq = 0;
  private doneFlag = false;
  private ambientAlpha = 0;
  private maxVelocity = 90;

  get nodeCount(): number {
    return this.n;
  }

  get edgeCount(): number {
    return this.edgesArr.length / 2;
  }

  init(
    nodes: readonly InitNode[],
    links: readonly InitLink[],
    cx: number,
    cy: number,
    alpha: number,
    seed: number,
    settings: EngineSettings,
  ): void {
    const idToIndex = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
      if (!idToIndex.has(nodes[i].id)) idToIndex.set(nodes[i].id, i);
    }
    const pairs: [number, number][] = [];
    const seen = new Set<number>();
    for (const l of links) {
      const a = idToIndex.get(l.source);
      const b = idToIndex.get(l.target);
      if (a === undefined || b === undefined || a === b) continue;
      const key = a < b ? a * 1048576 + b : b * 1048576 + a;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(a < b ? [a, b] : [b, a]);
    }
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);

    const n = nodes.length;
    this.n = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.nodeType = new Uint8Array(n);
    this.bucketOfType = new Uint8Array(n);
    this.fixedFlags = new Uint8Array(n);
    this.targetX = new Float64Array(n);
    this.targetY = new Float64Array(n);
    this.radius = new Float64Array(n);
    this.alphaValue = Math.min(1, Math.max(0, sanitize(alpha, 1)));
    this.cx = sanitize(cx, 0);
    this.cy = sanitize(cy, 0);
    this.tickCount = 0;
    this.pinSeq = 0;
    this.doneFlag = n === 0;
    this.settings = sanitizeSettings(settings);
    this.maxVelocity = Math.max(40, this.settings.linkDistance * 0.6);

    // 类型分桶（按首次出现顺序）+ 确定性螺旋初始位置 + 种子抖动
    const typeToBucket = new Map<number, number>();
    const rng = new Rng(seed);
    const total = Math.max(1, n);
    const maxR = Math.max(
      this.settings.linkDistance * 2,
      this.settings.linkDistance * Math.sqrt(Math.max(1, n)) * 0.5,
    );
    const turns = Math.min(12, Math.max(2, Math.sqrt(n)));
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      this.nodeType[i] = node.type & 0xff;
      if (!typeToBucket.has(this.nodeType[i])) {
        typeToBucket.set(this.nodeType[i], typeToBucket.size);
      }
      this.bucketOfType[i] = typeToBucket.get(this.nodeType[i])!;
      let sx = node.x;
      let sy = node.y;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
        const t = (i + 0.5) / total;
        const angle = t * Math.PI * 2 * turns;
        const r = maxR * Math.sqrt(t);
        sx = this.cx + r * Math.cos(angle);
        sy = this.cy + r * Math.sin(angle);
      }
      this.x[i] = sx + rng.symmetric(1);
      this.y[i] = sy + rng.symmetric(1);
      this.targetX[i] = this.x[i];
      this.targetY[i] = this.y[i];
    }

    const edges = new Uint32Array(pairs.length * 2);
    const degree = new Uint32Array(n);
    pairs.forEach((p, i) => {
      edges[i * 2] = p[0];
      edges[i * 2 + 1] = p[1];
      degree[p[0]]++;
      degree[p[1]]++;
    });
    this.edgesArr = edges;
    for (let i = 0; i < n; i++) {
      this.radius[i] = (this.bucketOfType[i] === 0 ? 10 : 7.5) + Math.sqrt(degree[i]) * 1.6;
    }

    // 簇锚点：均布圆周
    const bucketCount = Math.max(1, typeToBucket.size);
    const anchorR = this.settings.linkDistance * 2.2;
    this.anchors = [];
    for (let b = 0; b < bucketCount; b++) {
      const angle = (Math.PI * 2 * b) / bucketCount - Math.PI / 2;
      this.anchors.push([this.cx + anchorR * Math.cos(angle), this.cy + anchorR * Math.sin(angle)]);
    }
  }

  step(steps: number): number {
    for (let s = 0; s < Math.max(1, steps); s++) {
      if (this.doneFlag) break;
      this.stepOnce();
    }
    return this.alphaValue;
  }

  private stepOnce(): void {
    const n = this.n;
    if (n === 0) {
      this.doneFlag = true;
      return;
    }
    const { repel, centerStrength, linkDistance, linkStrength, clusterForce } = this.settings;
    const alpha = this.alphaValue;

    const cutoff = Math.max(140, linkDistance * 2);
    const grid = buildGrid(this.x, this.y, n, cutoff);

    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    const corX = new Float64Array(n);
    const corY = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      const [cgx, cgy] = cellOf(grid, xi, yi);
      const y0 = Math.max(0, cgy - 1);
      const y1 = Math.min(grid.dimY, cgy + 2);
      const x0 = Math.max(0, cgx - 1);
      const x1 = Math.min(grid.dimX, cgx + 2);
      for (let gy = y0; gy < y1; gy++) {
        for (let gx = x0; gx < x1; gx++) {
          for (let j = grid.cells[gy * grid.dimX + gx]; j !== -1; j = grid.next[j]) {
            if (j <= i) continue;
            const dx = xi - this.x[j];
            const dy = yi - this.y[j];
            const d2 = dx * dx + dy * dy;
            const d = Math.max(0.5, Math.sqrt(d2));
            const f = (repel * alpha) / (d * d);
            const ux = dx / d;
            const uy = dy / d;
            fx[i] += ux * f;
            fy[i] += uy * f;
            fx[j] -= ux * f;
            fy[j] -= uy * f;
            const minD = this.radius[i] + this.radius[j];
            if (d2 < minD * minD && d2 > Number.EPSILON) {
              const overlap = (minD - d) * 0.5;
              corX[i] += ux * overlap;
              corY[i] += uy * overlap;
              corX[j] -= ux * overlap;
              corY[j] -= uy * overlap;
            }
          }
        }
      }
    }

    // 弹簧（渐进固定边张力：触固定节点的边 30 tick 内从 35% 升到 100%）
    const edges = this.edgesArr;
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e];
      const b = edges[e + 1];
      const dx = this.x[b] - this.x[a];
      const dy = this.y[b] - this.y[a];
      const d = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
      const touchesFixed = this.fixedFlags[a] !== 0 || this.fixedFlags[b] !== 0;
      const rampTicks = touchesFixed ? 30 : 120;
      const ramp = 0.35 + 0.65 * Math.min(1, this.tickCount / rampTicks);
      const strength = linkStrength * ramp * (touchesFixed ? 1.5 : 1);
      const disp = (d - linkDistance) * 0.02 * strength * alpha;
      const ux = dx / d;
      const uy = dy / d;
      const aFree = this.fixedFlags[a] === 0;
      const bFree = this.fixedFlags[b] === 0;
      if (aFree && bFree) {
        this.vx[a] += ux * disp;
        this.vy[a] += uy * disp;
        this.vx[b] -= ux * disp;
        this.vy[b] -= uy * disp;
      } else if (aFree) {
        this.vx[a] += ux * disp * 2;
        this.vy[a] += uy * disp * 2;
      } else if (bFree) {
        this.vx[b] -= ux * disp * 2;
        this.vy[b] -= uy * disp * 2;
      }
    }

    // 中心 + 簇
    const bucketCount = this.anchors.length || 1;
    for (let i = 0; i < n; i++) {
      if (this.fixedFlags[i] !== 0) continue;
      this.vx[i] += (this.cx - this.x[i]) * centerStrength * alpha;
      this.vy[i] += (this.cy - this.y[i]) * centerStrength * alpha;
      const anchor = this.anchors[this.bucketOfType[i] % bucketCount];
      this.vx[i] += (anchor[0] - this.x[i]) * clusterForce * alpha;
      this.vy[i] += (anchor[1] - this.y[i]) * clusterForce * alpha;
    }

    // 碰撞校正（位置式）
    for (let i = 0; i < n; i++) {
      if (this.fixedFlags[i] !== 0 || (corX[i] === 0 && corY[i] === 0)) continue;
      this.x[i] += corX[i];
      this.y[i] += corY[i];
    }

    // 积分
    for (let i = 0; i < n; i++) {
      const mode = this.fixedFlags[i];
      if (mode === 2) {
        this.x[i] = this.targetX[i];
        this.y[i] = this.targetY[i];
        this.vx[i] = 0;
        this.vy[i] = 0;
      } else if (mode === 1) {
        this.vx[i] = 0;
        this.vy[i] = 0;
      } else {
        this.vx[i] *= VELOCITY_DECAY;
        this.vy[i] *= VELOCITY_DECAY;
        const v = Math.hypot(this.vx[i], this.vy[i]);
        if (v > this.maxVelocity) {
          const k = this.maxVelocity / v;
          this.vx[i] *= k;
          this.vy[i] *= k;
        }
        this.x[i] += this.vx[i];
        this.y[i] += this.vy[i];
      }
    }

    this.tickCount = Math.min(0xffffffff, this.tickCount + 1);
    this.alphaValue += (this.ambientAlpha - this.alphaValue) * ALPHA_DECAY;
    if (
      this.ambientAlpha < ALPHA_DONE &&
      (this.alphaValue < ALPHA_DONE || this.tickCount >= MAX_TICKS)
    ) {
      this.doneFlag = true;
    }
  }

  alpha(): number {
    return this.alphaValue;
  }

  done(): boolean {
    return this.doneFlag;
  }

  heat(a: number): void {
    this.alphaValue = Math.min(1, Math.max(0, sanitize(a, 0.3)));
    if (this.alphaValue > 0) this.doneFlag = false;
  }

  setAmbient(alpha: number): void {
    this.ambientAlpha = Math.min(0.03, Math.max(0, sanitize(alpha, 0)));
    if (this.n > 0 && (this.ambientAlpha > 0 || this.alphaValue > ALPHA_DONE)) {
      this.doneFlag = false;
    }
  }

  setCenter(cx: number, cy: number): void {
    this.cx = sanitize(cx, this.cx);
    this.cy = sanitize(cy, this.cy);
    this.config(this.settings);
  }

  config(settings: EngineSettings): void {
    this.settings = sanitizeSettings(settings);
    this.maxVelocity = Math.max(40, this.settings.linkDistance * 0.6);
    const bucketCount = Math.max(1, this.anchors.length);
    const anchorR = this.settings.linkDistance * 2.2;
    this.anchors = [];
    for (let b = 0; b < bucketCount; b++) {
      const angle = (Math.PI * 2 * b) / bucketCount - Math.PI / 2;
      this.anchors.push([this.cx + anchorR * Math.cos(angle), this.cy + anchorR * Math.sin(angle)]);
    }
  }

  setTarget(index: number, x: number, y: number, dragging: boolean): void {
    if (index < 0 || index >= this.n) return;
    this.targetX[index] = sanitize(x, this.x[index]);
    this.targetY[index] = sanitize(y, this.y[index]);
    if (dragging) {
      this.fixedFlags[index] = 2;
      this.x[index] = this.targetX[index];
      this.y[index] = this.targetY[index];
    } else if (this.fixedFlags[index] === 2) {
      this.x[index] = this.targetX[index];
      this.y[index] = this.targetY[index];
    }
  }

  setFixed(index: number, fixed: boolean): number {
    if (index < 0 || index >= this.n) return 0;
    this.fixedFlags[index] = fixed ? 1 : 0;
    if (fixed) {
      this.targetX[index] = this.x[index];
      this.targetY[index] = this.y[index];
    } else {
      this.vx[index] = 0;
      this.vy[index] = 0;
    }
    this.pinSeq = (this.pinSeq + 1) >>> 0;
    return this.pinSeq;
  }

  endDrag(index: number, keepPinned: boolean, vx = 0, vy = 0): number {
    if (index < 0 || index >= this.n) return this.pinSeq;
    if (this.fixedFlags[index] === 2) {
      this.x[index] = this.targetX[index];
      this.y[index] = this.targetY[index];
    }
    if (keepPinned) {
      this.fixedFlags[index] = 1;
      this.targetX[index] = this.x[index];
      this.targetY[index] = this.y[index];
      this.vx[index] = 0;
      this.vy[index] = 0;
    } else {
      this.fixedFlags[index] = 0;
      this.vx[index] = Math.max(-this.maxVelocity, Math.min(this.maxVelocity, sanitize(vx, 0)));
      this.vy[index] = Math.max(-this.maxVelocity, Math.min(this.maxVelocity, sanitize(vy, 0)));
      this.alphaValue = Math.max(this.alphaValue, this.ambientAlpha, 0.18);
    }
    this.doneFlag = this.n === 0;
    this.pinSeq = (this.pinSeq + 1) >>> 0;
    return this.pinSeq;
  }

  pinSequence(): number {
    return this.pinSeq;
  }

  tick(): number {
    return this.tickCount;
  }

  positions(): Float32Array {
    const out = new Float32Array(this.n * 2);
    for (let i = 0; i < this.n; i++) {
      out[i * 2] = this.x[i];
      out[i * 2 + 1] = this.y[i];
    }
    return out;
  }

  fixed(): Uint8Array {
    return this.fixedFlags;
  }

  edges(): Uint32Array {
    return this.edgesArr;
  }
}
