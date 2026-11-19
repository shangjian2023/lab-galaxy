/**
 * 图谱引擎消息协议，与 Rust/WASM ABI 对应。
 * 每次 init 递增 generation，过期异步初始化或帧不会进入当前画布。
 * engine 字段如实区分 "wasm" 与同协议的 "ts-fallback"。
 */

export interface EngineSettings {
  repel: number;
  centerStrength: number;
  linkDistance: number;
  linkStrength: number;
  clusterForce: number;
}

export interface InitNode {
  id: string;
  x: number;
  y: number;
  type: number;
}

export interface InitLink {
  source: string;
  target: string;
}

export type WorkerRequest =
  | {
      type: "init";
      generation: number;
      nodes: InitNode[];
      links: InitLink[];
      cx: number;
      cy: number;
      settings: EngineSettings;
      alpha: number;
      seed: number;
      pinned: number[];
    }
  | { type: "heat"; alpha: number }
  | { type: "center"; cx: number; cy: number }
  | { type: "ambient"; alpha: number }
  | { type: "target"; index: number; x: number; y: number }
  | {
      type: "end-drag";
      index: number;
      keepPinned: boolean;
      vx: number;
      vy: number;
    }
  | { type: "pin"; index: number; fixed: boolean }
  | { type: "restart"; settings?: EngineSettings; alpha?: number }
  | { type: "ack"; generation: number; bufferId: number; buffer: ArrayBuffer };

export interface TickMessage {
  type: "tick";
  generation: number;
  positions: Float32Array;
  bufferId: number;
  alpha: number;
  done: boolean;
  engine: EngineKind;
  pinSequence: number;
  computeMs: number;
  tick: number;
}

export type EngineKind = "wasm" | "ts-fallback";

export type WorkerResponse =
  | { type: "ready"; generation: number; engine: EngineKind; nodeCount: number; edgeCount: number }
  | { type: "error"; generation: number; message: string }
  | TickMessage;

export const DEFAULT_SETTINGS: EngineSettings = {
  repel: 1000,
  centerStrength: 0.01,
  linkDistance: 120,
  linkStrength: 0.9,
  clusterForce: 0,
};

export const ALPHA_DONE = 0.005;

export const EXPECTED_WASM_ABI_VERSION = 2;

export interface LayoutEngine {
  readonly engine: EngineKind;
  readonly nodeCount: number;
  readonly edgeCount: number;
  step(steps: number): number;
  alpha(): number;
  done(): boolean;
  heat(alpha: number): void;
  setAmbient(alpha: number): void;
  setCenter(cx: number, cy: number): void;
  config(settings: EngineSettings): void;
  setTarget(index: number, x: number, y: number, dragging: boolean): void;
  setFixed(index: number, fixed: boolean): number;
  /** vx/vy 为释放前采样得到的世界坐标每步速度。 */
  endDrag(index: number, keepPinned: boolean, vx?: number, vy?: number): number;
  pinSequence(): number;
  tick(): number;
  positions(): Float32Array;
  fixed(): Uint8Array;
  edges(): Uint32Array;
}

export function deriveSeed(ids: readonly string[]): number {
  let hash = 0xcbf29ce484222325;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 0x1000001b3);
    }
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x1000001b3);
  }
  return hash >>> 0;
}
