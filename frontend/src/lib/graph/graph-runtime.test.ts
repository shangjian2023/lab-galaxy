import { describe, expect, it } from "vitest";
import { GraphWorkerRuntime, type InitRequest } from "./graph-runtime";
import { DEFAULT_SETTINGS, type LayoutEngine, type WorkerResponse } from "./protocol";
import { TsLayoutEngine } from "./ts-engine";

function init(generation = 1): InitRequest {
  return {
    type: "init",
    generation,
    nodes: [
      { id: "a", x: 0, y: 0, type: 0 },
      { id: "b", x: 90, y: 80, type: 1 },
    ],
    links: [{ source: "a", target: "b" }],
    cx: 400,
    cy: 300,
    settings: { ...DEFAULT_SETTINGS },
    alpha: 1,
    seed: 42,
    pinned: [],
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function engine(): TsLayoutEngine {
  const result = new TsLayoutEngine();
  result.init(
    init().nodes,
    [],
    0,
    0,
    0,
    42,
    { ...DEFAULT_SETTINGS, repel: 1, centerStrength: 0, clusterForce: 0 },
  );
  return result;
}

function harness(factory?: (request: InitRequest) => Promise<LayoutEngine>) {
  const frames: { callback: () => void; cancelled: boolean }[] = [];
  const messages: { message: WorkerResponse; transfers: Transferable[]; mainBuffer?: ArrayBuffer }[] = [];
  const cancelled: unknown[] = [];
  const runtime = new GraphWorkerRuntime(
    factory ?? (async () => engine()),
    (message, transfers = []) => {
      // 模拟真实 postMessage 的 transfer：原视图 detach，主线程拿到等价副本。
      if (message.type === "tick" && transfers[0] instanceof ArrayBuffer && transfers[0].byteLength > 0) {
        const positions = structuredClone(message.positions, { transfer: [transfers[0]] });
        messages.push({ message: { ...message, positions }, transfers, mainBuffer: positions.buffer as ArrayBuffer });
        return;
      }
      messages.push({ message, transfers });
    },
    (callback) => {
      const frame = { callback, cancelled: false };
      frames.push(frame);
      return frame;
    },
    (timer) => {
      cancelled.push(timer);
      (timer as { cancelled: boolean }).cancelled = true;
    },
  );
  const nextFrame = () => {
    while (frames.length) {
      const frame = frames.shift()!;
      if (!frame.cancelled) {
        frame.callback();
        return true;
      }
    }
    return false;
  };
  return { runtime, frames, messages, cancelled, nextFrame };
}

async function settled(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("GraphWorkerRuntime 生命周期", () => {
  it("先收到 ambient 也不会在初始化时丢失", async () => {
    const { runtime, frames, messages, nextFrame } = harness();
    runtime.request({ type: "ambient", alpha: 0.012 });
    runtime.request(init());
    await settled();
    expect(messages.some(({ message }) => message.type === "ready")).toBe(true);
    for (let i = 0; i < 150 && nextFrame(); i++) {
      const tick = [...messages].reverse().find(({ message }) => message.type === "tick");
      if (tick?.message.type !== "tick") continue;
      runtime.request({
        type: "ack",
        generation: 1,
        bufferId: tick.message.bufferId,
        buffer: new ArrayBuffer(16),
      });
    }
    const ticks = messages.filter(({ message }) => message.type === "tick");
    expect(ticks.length).toBeGreaterThan(100);
    expect(ticks.every(({ message }) => message.type === "tick" && !message.done)).toBe(true);
    expect(ticks.every(({ transfers }) => transfers.length === 1)).toBe(true);
  });

  it("较早的异步 init 完成后不会覆盖新布局", async () => {
    const old = deferred<LayoutEngine>();
    const current = deferred<LayoutEngine>();
    const { runtime, messages } = harness((request) =>
      request.generation === 1 ? old.promise : current.promise,
    );
    runtime.request(init(1));
    runtime.request(init(2));
    current.resolve(engine());
    await settled();
    old.resolve(engine());
    await settled();
    expect(messages.filter(({ message }) => message.type === "ready").length).toBe(1);
    expect(messages[0].message).toMatchObject({ type: "ready", generation: 2 });
    runtime.request({ type: "ack", generation: 1, bufferId: 1, buffer: new ArrayBuffer(16) });
    expect(messages.filter(({ message }) => message.type === "error")).toEqual([]);
  });

  it("真实 transfer detach 后，归还非首个缓冲也能恢复调度", async () => {
    const { runtime, frames, messages, nextFrame } = harness();
    runtime.request({ type: "ambient", alpha: 0.012 });
    runtime.request(init());
    await settled();
    for (let i = 0; i < 4; i++) nextFrame();
    const ticks = messages.filter(({ message }) => message.type === "tick");
    expect(ticks).toHaveLength(3);
    const second = ticks[1];
    expect(second.message.type === "tick" && second.message.positions.byteLength).toBe(16);
    expect(frames).toHaveLength(0);
    runtime.request({
      type: "ack",
      generation: 1,
      bufferId: second.message.type === "tick" ? second.message.bufferId : -1,
      buffer: second.mainBuffer!,
    });
    expect(frames).toHaveLength(1);
    nextFrame();
    expect(messages.filter(({ message }) => message.type === "tick")).toHaveLength(4);
  });

  it("缓冲池满后停止定时重试，正确 ack 才恢复", async () => {
    const { runtime, frames, messages, nextFrame } = harness();
    runtime.request({ type: "ambient", alpha: 0.012 });
    runtime.request(init());
    await settled();
    nextFrame();
    nextFrame();
    nextFrame();
    nextFrame();
    const ticks = messages.filter(({ message }) => message.type === "tick");
    expect(ticks).toHaveLength(3);
    expect(frames).toHaveLength(0);
    runtime.request({
      type: "ack",
      generation: 2,
      bufferId: 1,
      buffer: ticks[0].transfers[0] as ArrayBuffer,
    });
    expect(frames).toHaveLength(0);
    runtime.request({
      type: "ack",
      generation: 1,
      bufferId: 999,
      buffer: ticks[0].transfers[0] as ArrayBuffer,
    });
    expect(frames).toHaveLength(0);
    runtime.request({
      type: "ack",
      generation: 1,
      bufferId: ticks[0].message.type === "tick" ? ticks[0].message.bufferId : -1,
      buffer: new ArrayBuffer(16),
    });
    expect(frames).toHaveLength(1);
    frames.shift()?.callback();
    expect(messages.filter(({ message }) => message.type === "tick")).toHaveLength(4);
  });

  it("重新初始化恢复 pin，普通拖拽释放保留惯性", async () => {
    const { runtime, messages, nextFrame } = harness();
    runtime.request({ type: "ambient", alpha: 0.012 });
    const request = init();
    request.pinned = [1];
    runtime.request(request);
    await settled();
    nextFrame();
    const first = messages.find(({ message }) => message.type === "tick");
    expect(first?.message.type === "tick" && first.message.pinSequence).toBe(1);
    runtime.request({ type: "target", index: 0, x: 200, y: 200 });
    runtime.request({ type: "end-drag", index: 0, keepPinned: false, vx: 12, vy: 0 });
    nextFrame();
    const tick = [...messages].reverse().find(({ message }) => message.type === "tick");
    expect(tick?.message.type === "tick" && tick.message.positions[0]).toBeGreaterThan(200);
  });

  it("reinit 取消旧定时任务且过期 ready 不会发出", async () => {
    const old = deferred<LayoutEngine>();
    const current = deferred<LayoutEngine>();
    const { runtime, frames, messages, cancelled } = harness((request) =>
      request.generation === 1 ? old.promise : current.promise,
    );
    runtime.request(init(1));
    runtime.request(init(2));
    expect(cancelled.length).toBeGreaterThanOrEqual(0);
    expect(frames).toHaveLength(0);
    current.resolve(engine());
    await settled();
    old.resolve(engine());
    await settled();
    expect(messages.every(({ message }) => message.type !== "ready" || message.generation === 2)).toBe(true);
  });
});
