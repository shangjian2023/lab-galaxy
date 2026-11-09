/**
 * WASM 引擎包装：加载 `public/wasm/graph_layout.js`（wasm-bindgen no-modules
 * 产物，经 importScripts 注入后暴露全局 `wasm_bindgen`）。
 *
 * 任何一步失败（脚本 404 / 实例化失败 / 版本不匹配）都会抛错，
 * 由 worker 捕获并回退到 TS 引擎 —— 绝不把 fallback 冒充 wasm。
 */

import {
  EXPECTED_WASM_ABI_VERSION,
  type EngineSettings,
  type InitLink,
  type InitNode,
  type LayoutEngine,
} from "./protocol";

interface WasmExports {
  graph_alloc(len: number): number;
  graph_alloc_u32(len: number): number;
  graph_init(
    nodesPtr: number,
    nodeCount: number,
    linksPtr: number,
    linkCount: number,
    cx: number,
    cy: number,
    alpha: number,
    seed: bigint,
    repel: number,
    centerStrength: number,
    linkDistance: number,
    linkStrength: number,
    clusterForce: number,
  ): void;
  graph_config(...args: number[]): void;
  graph_step(steps: number): number;
  graph_heat(alpha: number): void;
  graph_set_ambient(alpha: number): void;
  graph_set_center(cx: number, cy: number): void;
  graph_set_target(index: number, x: number, y: number, dragging: boolean): void;
  graph_set_fixed(index: number, fixed: boolean): number;
  graph_end_drag(index: number, keepPinned: boolean, vx: number, vy: number): number;
  graph_done(): boolean;
  graph_alpha(): number;
  graph_pin_sequence(): number;
  graph_node_count(): number;
  graph_tick(): number;
  graph_positions_ptr(): number;
  graph_targets_ptr(): number;
  graph_edges_ptr(): number;
  graph_edge_count(): number;
  graph_fixed_ptr(): number;
  graph_engine_version(): number;
  graph_memory(): { buffer: ArrayBuffer };
}

type WasmModule = WasmExports & {
  (options: { module_or_path: string }): Promise<unknown>;
};


export class WasmLayoutEngine implements LayoutEngine {
  readonly engine = "wasm" as const;
  private exp: WasmExports;
  private nodeCountVal = 0;
  private edgeCountVal = 0;
  private posView: Float32Array | null = null;
  private fixedView: Uint8Array | null = null;
  private edgesView: Uint32Array | null = null;
  private memoryRef: { buffer: ArrayBuffer };

  private constructor(exp: WasmExports, memory: { buffer: ArrayBuffer }) {
    this.exp = exp;
    this.memoryRef = memory;
  }

  static async load(
    scriptUrl: string,
    wasmUrl: string,
    nodes: readonly InitNode[],
    links: readonly InitLink[],
    cx: number,
    cy: number,
    alpha: number,
    seed: number,
    settings: EngineSettings,
  ): Promise<WasmLayoutEngine> {
    // importScripts 在经典 worker 中同步加载 no-modules 产物，定义全局 wasm_bindgen
    (self as unknown as { importScripts(url: string): void }).importScripts(scriptUrl);
    const globalWasm = (self as unknown as { wasm_bindgen?: WasmModule }).wasm_bindgen;
    if (typeof globalWasm !== "function") {
      throw new Error("wasm_bindgen global missing after importScripts");
    }
    await globalWasm({ module_or_path: wasmUrl });
    const exp = globalWasm;
    if (!exp || typeof exp.graph_engine_version !== "function") {
      throw new Error("wasm exports missing graph_* ABI");
    }
    if (exp.graph_engine_version() !== EXPECTED_WASM_ABI_VERSION) {
      throw new Error(
        `wasm ABI version mismatch: got ${exp.graph_engine_version()}, want ${EXPECTED_WASM_ABI_VERSION}`,
      );
    }

    // 写入线性缓冲: nodes [x,y,type]*n，links [a,b]*m
    const nodeBuf = exp.graph_alloc(nodes.length * 3);
    const nodeView = new Float32Array(exp.graph_memory().buffer, nodeBuf, nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) {
      nodeView[i * 3] = nodes[i].x;
      nodeView[i * 3 + 1] = nodes[i].y;
      nodeView[i * 3 + 2] = nodes[i].type;
    }
    const linkBuf = exp.graph_alloc_u32(links.length * 2);
    const linkView = new Uint32Array(exp.graph_memory().buffer, linkBuf, links.length * 2);
    const idToIndex = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
      if (!idToIndex.has(nodes[i].id)) idToIndex.set(nodes[i].id, i);
    }
    let m = 0;
    for (const l of links) {
      const a = idToIndex.get(l.source);
      const b = idToIndex.get(l.target);
      if (a === undefined || b === undefined || a === b || m * 2 + 1 >= linkView.length) continue;
      linkView[m * 2] = a;
      linkView[m * 2 + 1] = b;
      m++;
    }

    exp.graph_init(
      nodeBuf,
      nodes.length,
      linkBuf,
      m,
      cx,
      cy,
      alpha,
      BigInt(seed >>> 0),
      settings.repel,
      settings.centerStrength,
      settings.linkDistance,
      settings.linkStrength,
      settings.clusterForce,
    );

    const engine = new WasmLayoutEngine(exp, exp.graph_memory());
    engine.nodeCountVal = exp.graph_node_count();
    engine.edgeCountVal = exp.graph_edge_count();
    if (engine.nodeCountVal !== nodes.length) {
      throw new Error("wasm graph_init did not register all nodes");
    }
    return engine;
  }

  private refreshViews(): void {
    // wasm memory 可能因分配而 grow（detach 旧 buffer），每次取视图前校验
    const buffer = this.memoryRef.buffer;
    if (!this.posView || this.posView.buffer !== buffer) {
      const n = this.nodeCountVal;
      this.posView = new Float32Array(buffer, this.exp.graph_positions_ptr(), n * 2);
      this.fixedView = new Uint8Array(buffer, this.exp.graph_fixed_ptr(), n);
      this.edgesView = new Uint32Array(buffer, this.exp.graph_edges_ptr(), this.edgeCountVal * 2);
    }
  }

  get nodeCount(): number {
    return this.nodeCountVal;
  }

  get edgeCount(): number {
    return this.edgeCountVal;
  }

  step(steps: number): number {
    return this.exp.graph_step(steps);
  }

  alpha(): number {
    return this.exp.graph_alpha();
  }

  done(): boolean {
    return this.exp.graph_done();
  }

  heat(alpha: number): void {
    this.exp.graph_heat(alpha);
  }

  setAmbient(alpha: number): void {
    this.exp.graph_set_ambient(alpha);
  }

  setCenter(cx: number, cy: number): void {
    this.exp.graph_set_center(cx, cy);
  }

  config(settings: EngineSettings): void {
    this.exp.graph_config(
      settings.repel,
      settings.centerStrength,
      settings.linkDistance,
      settings.linkStrength,
      settings.clusterForce,
    );
  }

  setTarget(index: number, x: number, y: number, dragging: boolean): void {
    this.exp.graph_set_target(index, x, y, dragging);
  }

  setFixed(index: number, fixed: boolean): number {
    return this.exp.graph_set_fixed(index, fixed);
  }

  endDrag(index: number, keepPinned: boolean, vx = 0, vy = 0): number {
    return this.exp.graph_end_drag(index, keepPinned, vx, vy);
  }

  pinSequence(): number {
    return this.exp.graph_pin_sequence();
  }

  tick(): number {
    return this.exp.graph_tick();
  }

  positions(): Float32Array {
    // graph_positions_ptr 每次调用都会把内部 SoA 坐标复制到导出缓冲；
    // 不能只按 buffer 是否 detach 缓存视图，否则永远返回首帧快照。
    const pointer = this.exp.graph_positions_ptr();
    const buffer = this.memoryRef.buffer;
    if (
      !this.posView ||
      this.posView.buffer !== buffer ||
      this.posView.byteOffset !== pointer * Float32Array.BYTES_PER_ELEMENT
    ) {
      this.posView = new Float32Array(buffer, pointer, this.nodeCountVal * 2);
    }
    return this.posView;
  }

  fixed(): Uint8Array {
    this.refreshViews();
    return this.fixedView!;
  }

  edges(): Uint32Array {
    this.refreshViews();
    return this.edgesView!;
  }
}

/** 检测 WASM 产物是否可加载（不实例化引擎），供状态展示。 */
export function wasmScriptUrl(): string {
  return "/wasm/graph_layout.js";
}
