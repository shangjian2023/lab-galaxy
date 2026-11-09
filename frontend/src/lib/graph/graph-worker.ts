/// Worker 适配层；调度、缓冲池和初始化代次由可测试的状态机负责。
import { GraphWorkerRuntime, type InitRequest } from "./graph-runtime";
import { TsLayoutEngine } from "./ts-engine";
import { WasmLayoutEngine } from "./wasm-engine";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

const runtime = new GraphWorkerRuntime(
  async (request: InitRequest) => {
    try {
      return await WasmLayoutEngine.load(
        "/wasm/graph_layout.js",
        "/wasm/graph_layout_bg.wasm",
        request.nodes,
        request.links,
        request.cx,
        request.cy,
        request.alpha,
        request.seed,
        request.settings,
      );
    } catch (error) {
      if (typeof console !== "undefined") {
        const reason = error instanceof Error ? error.message : String(error);
        console.info(`[graph-worker] WASM 不可用，使用 TS 回退：${reason}`);
      }
      const fallback = new TsLayoutEngine();
      fallback.init(
        request.nodes,
        request.links,
        request.cx,
        request.cy,
        request.alpha,
        request.seed,
        request.settings,
      );
      return fallback;
    }
  },
  (message, transfer) => ctx.postMessage(message, transfer),
);

ctx.onmessage = (event) => runtime.request(event.data);

export {};
