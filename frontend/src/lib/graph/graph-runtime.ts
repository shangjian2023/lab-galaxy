import type {
  EngineSettings,
  InitLink,
  InitNode,
  LayoutEngine,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

export type InitRequest = Extract<WorkerRequest, { type: "init" }>;
export type EngineFactory = (request: InitRequest) => Promise<LayoutEngine>;

interface PoolBuffer {
  buffer: ArrayBuffer;
  floats: Float32Array;
  /** 转移给主线程后 floats 会 detach，容量需单独保存用于 ack 校验。 */
  byteLength: number;
  outstanding: boolean;
}

/** 无 DOM 的 worker 状态机，便于验证异步初始化和 transferable 缓冲池。 */
export class GraphWorkerRuntime {
  private engine: LayoutEngine | null = null;
  private generation = 0;
  private ambient = 0;
  private wantsFrame = false;
  private timer: unknown = null;
  private framePending = false;
  private pool = new Map<number, PoolBuffer>();
  private nextBufferId = 1;

  constructor(
    private readonly factory: EngineFactory,
    private readonly post: (message: WorkerResponse, transfer?: Transferable[]) => void,
    private readonly schedule: (callback: () => void) => unknown = (callback) =>
      setTimeout(callback, 16),
    private readonly cancel: (timer: unknown) => void = (timer) =>
      clearTimeout(timer as ReturnType<typeof setTimeout>),
    private readonly now: () => number = () => performance.now(),
  ) {}

  request(request: WorkerRequest): void {
    switch (request.type) {
      case "init":
        void this.init(request);
        break;
      case "ack":
        this.ack(request.generation, request.bufferId, request.buffer);
        break;
      case "ambient":
        this.ambient = request.alpha;
        this.engine?.setAmbient(request.alpha);
        if (this.engine && request.alpha > 0) this.wantsFrame = true;
        this.wake();
        break;
      case "center":
        if (!this.engine) return;
        this.engine.setCenter(request.cx, request.cy);
        this.engine.heat(0.06);
        this.wake();
        break;
      case "heat":
        this.engine?.heat(request.alpha);
        this.wake();
        break;
      case "restart":
        if (!this.engine) return;
        if (request.settings) this.engine.config(request.settings);
        this.engine.heat(request.alpha ?? 0.3);
        this.wake();
        break;
      case "target":
        if (!this.engine) return;
        this.engine.setTarget(request.index, request.x, request.y, true);
        if (this.engine.done()) this.engine.heat(0.05);
        this.wake();
        break;
      case "end-drag":
        if (!this.engine) return;
        this.engine.endDrag(request.index, request.keepPinned, request.vx, request.vy);
        this.wake();
        break;
      case "pin":
        if (!this.engine) return;
        this.engine.setFixed(request.index, request.fixed);
        if (this.engine.done()) this.engine.heat(0.05);
        this.wake();
        break;
    }
  }

  private async init(request: InitRequest): Promise<void> {
    this.stopScheduled();
    this.generation = request.generation;
    this.pool.clear();
    this.engine = null;
    this.wantsFrame = false;
    try {
      const loaded = await this.factory(request);
      if (request.generation !== this.generation) return;
      this.engine = loaded;
      loaded.setAmbient(this.ambient);
      for (const index of request.pinned) loaded.setFixed(index, true);
      this.post({
        type: "ready",
        generation: this.generation,
        engine: loaded.engine,
        nodeCount: loaded.nodeCount,
        edgeCount: loaded.edgeCount,
      });
      this.wantsFrame = loaded.nodeCount > 0;
      this.queueFrame();
    } catch (error) {
      if (request.generation !== this.generation) return;
      this.post({
        type: "error",
        generation: this.generation,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private wake(): void {
    if (!this.engine || this.engine.nodeCount === 0 || this.engine.done()) return;
    this.wantsFrame = true;
    this.queueFrame();
  }

  private queueFrame(): void {
    if (this.timer !== null || this.framePending || !this.wantsFrame || !this.engine) return;
    this.framePending = true;
    this.timer = this.schedule(() => {
      this.timer = null;
      this.framePending = false;
      this.tick();
    });
  }

  private tick(): void {
    const engine = this.engine;
    if (!engine || !this.wantsFrame || engine.done()) return;
    let outstanding = 0;
    for (const entry of this.pool.values()) if (entry.outstanding) outstanding++;
    if (outstanding >= 3) return;
    const entry = this.obtain(engine.nodeCount);
    if (!entry) return;
    const started = this.now();
    // 固定步长由调度器节流；低能量漂移不增加主线程渲染负担。
    engine.step(1);
    entry.floats.set(engine.positions());
    this.post(
      {
        type: "tick",
        generation: this.generation,
        positions: entry.floats,
        bufferId: entry.id,
        alpha: engine.alpha(),
        done: engine.done(),
        engine: engine.engine,
        pinSequence: engine.pinSequence(),
        computeMs: this.now() - started,
        tick: engine.tick(),
      },
      [entry.buffer],
    );
    if (engine.done()) this.wantsFrame = false;
    else this.queueFrame();
  }

  private obtain(nodeCount: number): (PoolBuffer & { id: number }) | null {
    for (const [id, entry] of this.pool) {
      if (!entry.outstanding && entry.floats.length === nodeCount * 2) {
        entry.outstanding = true;
        return { ...entry, id };
      }
    }
    if (this.pool.size >= 3) return null;
    const id = this.nextBufferId++;
    const floats = new Float32Array(nodeCount * 2);
    const entry = { buffer: floats.buffer, floats, byteLength: floats.buffer.byteLength, outstanding: true };
    this.pool.set(id, entry);
    return { ...entry, id };
  }

  private ack(generation: number, id: number, buffer: ArrayBuffer): void {
    if (generation !== this.generation) return;
    const entry = this.pool.get(id);
    if (!entry || !entry.outstanding || buffer.byteLength !== entry.byteLength) return;
    entry.buffer = buffer;
    entry.floats = new Float32Array(buffer);
    entry.outstanding = false;
    this.queueFrame();
  }

  private stopScheduled(): void {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.framePending = false;
  }
}

export interface EngineInput {
  nodes: readonly InitNode[];
  links: readonly InitLink[];
  settings: EngineSettings;
}
