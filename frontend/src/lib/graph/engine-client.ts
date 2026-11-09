import {
  deriveSeed,
  type EngineKind,
  type EngineSettings,
  type InitLink,
  type InitNode,
  type TickMessage,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";

export interface ClientState {
  engine: EngineKind | null;
  ready: boolean;
}

interface Frame {
  id: number;
  buffer: ArrayBufferLike;
}

export class GraphEngineClient {
  private worker: Worker | null = null;
  private onTick: ((msg: TickMessage) => void) | null = null;
  private onReady: ((state: ClientState) => void) | null = null;
  private display: Frame | null = null;
  private retired: Frame[] = [];
  private generation = 0;
  private ambientAlpha = 0;
  private hidden = false;
  private disposed = false;
  private onVisibility: (() => void) | null = null;

  start(onTick: (msg: TickMessage) => void, onReady?: (state: ClientState) => void): void {
    this.onTick = onTick;
    this.onReady = onReady ?? null;
    this.disposed = false;
    this.hidden = document.hidden;
    this.worker = new Worker(new URL("./graph-worker.ts", import.meta.url), {
      name: "graph-layout-worker",
    });
    this.onVisibility = () => {
      this.hidden = document.hidden;
      if (!this.hidden) this.releaseAll();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.generation !== this.generation) return;
      if (msg.type === "ready") {
        this.onReady?.({ engine: msg.engine, ready: true });
        return;
      }
      if (msg.type === "error") {
        console.error("[graph-engine]", msg.message);
        return;
      }
      const previous = this.display;
      this.display = { id: msg.bufferId, buffer: msg.positions.buffer };
      if (previous) this.retired.push(previous);
      // 后台标签页也保留最新坐标；渲染循环会在 hidden 时停止，Worker 通过
      // 未归还的缓冲自然节流。这样首次后台打开后恢复前台，能立即绘制最近帧，
      // 而不是一直停留在“暂无图谱数据”。
      this.onTick?.(msg);
      this.releaseAll();
    };
    this.worker.onerror = (event) => {
      console.error("[graph-engine] worker error", event.message ?? event);
    };
  }

  get ready(): boolean {
    return this.display !== null;
  }

  init(
    nodes: readonly InitNode[],
    links: readonly InitLink[],
    cx: number,
    cy: number,
    settings: EngineSettings,
    alpha = 1,
    pinned: readonly number[] = [],
  ): void {
    this.generation++;
    this.display = null;
    this.retired = [];
    this.send({
      type: "init",
      generation: this.generation,
      nodes: [...nodes],
      links: [...links],
      cx,
      cy,
      settings,
      alpha,
      seed: deriveSeed(nodes.map((node) => node.id)),
      pinned: [...pinned],
    });
    this.ambient(this.ambientAlpha);
  }

  ambient(alpha: number): void {
    this.ambientAlpha = alpha;
    this.send({ type: "ambient", alpha });
  }

  center(cx: number, cy: number): void {
    this.send({ type: "center", cx, cy });
  }

  heat(alpha: number): void {
    this.send({ type: "heat", alpha });
  }

  target(index: number, x: number, y: number): void {
    this.send({ type: "target", index, x, y });
  }

  endDrag(index: number, keepPinned: boolean, vx: number, vy: number): void {
    this.send({ type: "end-drag", index, keepPinned, vx, vy });
  }

  pin(index: number, fixed: boolean): void {
    this.send({ type: "pin", index, fixed });
  }

  restart(settings?: EngineSettings, alpha?: number): void {
    this.send({ type: "restart", settings, alpha });
  }

  release(): void {
    this.releaseAll();
  }

  resetBuffers(): void {
    this.generation++;
    this.display = null;
    this.retired = [];
  }

  dispose(): void {
    this.disposed = true;
    if (this.onVisibility) document.removeEventListener("visibilitychange", this.onVisibility);
    this.onVisibility = null;
    this.worker?.terminate();
    this.worker = null;
    this.onTick = null;
    this.onReady = null;
    this.display = null;
    this.retired = [];
  }

  private releaseAll(): void {
    if (!this.worker || this.hidden || this.disposed) return;
    const generation = this.generation;
    const entries = [...this.retired];
    this.retired = [];
    for (const entry of entries) {
      const buffer = entry.buffer as ArrayBuffer;
      this.worker.postMessage({ type: "ack", generation, bufferId: entry.id, buffer }, [buffer]);
    }
  }

  private send(request: WorkerRequest): void {
    if (!this.disposed) this.worker?.postMessage(request);
  }
}
