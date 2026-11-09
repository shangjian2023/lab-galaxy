/**
 * TS 回退引擎测试：与 Rust 测试同一组不变量
 * （有限数值 / pin 不动 / 同 seed 一致 / 0 与 1 节点 / 大图性能边界），
 * 以及 worker 协议消息行为。
 */

import { describe, expect, it } from "vitest";
import { TsLayoutEngine } from "./ts-engine";
import { DEFAULT_SETTINGS, deriveSeed, type EngineSettings } from "./protocol";
import type { InitLink, InitNode } from "./protocol";

function settings(): EngineSettings {
  return { ...DEFAULT_SETTINGS, linkDistance: 120, linkStrength: 0.6 };
}

function ringGraph(n: number): { nodes: InitNode[]; links: InitLink[] } {
  const nodes: InitNode[] = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    x: Number.NaN,
    y: Number.NaN,
    type: i % 6,
  }));
  const links: InitLink[] = [];
  for (let i = 0; i < n; i++) links.push({ source: `n${i}`, target: `n${(i + 1) % n}` });
  return { nodes, links };
}

function run(engine: TsLayoutEngine, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    if (engine.done()) break;
    engine.step(1);
  }
}

function assertFinite(engine: TsLayoutEngine): void {
  const p = engine.positions();
  for (let i = 0; i < p.length; i++) {
    expect(Number.isFinite(p[i]), `positions[${i}] not finite`).toBe(true);
  }
  expect(Number.isFinite(engine.alpha())).toBe(true);
  expect(engine.alpha()).toBeGreaterThanOrEqual(0);
  expect(engine.alpha()).toBeLessThanOrEqual(1);
}

describe("TsLayoutEngine 基础不变量", () => {
  it("环图收敛且数值有限", () => {
    const { nodes, links } = ringGraph(80);
    const e = new TsLayoutEngine();
    e.init(nodes, links, 400, 300, 1, 42, settings());
    run(e, 300);
    assertFinite(e);
    expect(e.done()).toBe(true);
  });

  it("非法边被清洗：自环/越界/重复", () => {
    const { nodes } = ringGraph(10);
    const e = new TsLayoutEngine();
    e.init(
      nodes,
      [
        { source: "n0", target: "n1" },
        { source: "n1", target: "n0" },
        { source: "n3", target: "n3" },
        { source: "n0", target: "ghost" },
      ],
      0,
      0,
      1,
      7,
      settings(),
    );
    expect(e.edgeCount).toBe(1);
    run(e, 100);
    assertFinite(e);
  });

  it("0 节点与 1 节点安全终止", () => {
    const empty = new TsLayoutEngine();
    empty.init([], [], 0, 0, 1, 1, settings());
    empty.step(50);
    expect(empty.done()).toBe(true);
    expect(empty.positions().length).toBe(0);

    const single = new TsLayoutEngine();
    single.init([{ id: "solo", x: 500, y: 500, type: 2 }], [], 0, 0, 1, 3, settings());
    run(single, 500);
    expect(single.done()).toBe(true);
    assertFinite(single);
  });
});

describe("固定（pin）语义", () => {
  it("pin 后节点位置严格不变", () => {
    const { nodes, links } = ringGraph(60);
    const e = new TsLayoutEngine();
    e.init(nodes, links, 400, 300, 1, 1234, settings());
    run(e, 40);
    const p = e.positions();
    const pinIdx = 17;
    const [px, py] = [p[pinIdx * 2], p[pinIdx * 2 + 1]];
    expect(e.setFixed(pinIdx, true)).toBe(1);
    for (let round = 0; round < 3; round++) {
      e.heat(1);
      run(e, 100);
    }
    const after = e.positions();
    expect(after[pinIdx * 2]).toBe(px);
    expect(after[pinIdx * 2 + 1]).toBe(py);
    assertFinite(e);
  });

  it("越界 pin 返回 0", () => {
    const { nodes } = ringGraph(4);
    const e = new TsLayoutEngine();
    e.init(nodes, [], 0, 0, 1, 1, settings());
    expect(e.setFixed(99, true)).toBe(0);
    expect(e.pinSequence()).toBe(0);
  });

  it("拖拽释放后保持固定；再次释放（不固定）则自由", () => {
    const { nodes, links } = ringGraph(30);
    const e = new TsLayoutEngine();
    e.init(nodes, links, 300, 300, 1, 5, settings());
    run(e, 20);
    e.setTarget(4, 900, 900, true);
    expect(e.fixed()[4]).toBe(2);
    e.step(5);
    let p = e.positions();
    expect(p[8]).toBe(900); // index 4 => floats 8,9
    expect(p[9]).toBe(900);
    const seq1 = e.endDrag(4, true);
    expect(e.fixed()[4]).toBe(1);
    e.heat(1);
    run(e, 80);
    p = e.positions();
    expect(p[8]).toBe(900);
    const seq2 = e.endDrag(4, false);
    expect(e.fixed()[4]).toBe(0);
    expect(seq2).toBe(seq1 + 1);
    assertFinite(e);
  });
});

describe("环境漂移与拖拽惯性", () => {
  it("环境漂移不被预热 tick 上限截断，关闭后收敛并可恢复", () => {
    const { nodes, links } = ringGraph(30);
    const e = new TsLayoutEngine();
    e.init(nodes, links, 0, 0, 0, 42, settings());
    e.setAmbient(0.012);
    run(e, 3010);
    expect(e.done()).toBe(false);
    expect(e.alpha()).toBeLessThanOrEqual(0.03);
    e.setAmbient(0);
    run(e, 1000);
    expect(e.done()).toBe(true);
    e.setAmbient(0.012);
    expect(e.done()).toBe(false);
    assertFinite(e);
  });

  it("自由释放有界惯性，固定释放不移动", () => {
    const nodes = [
      { id: "a", x: 200, y: 100, type: 0 },
      { id: "b", x: 800, y: 800, type: 1 },
    ];
    const e = new TsLayoutEngine();
    e.init(nodes, [], 0, 0, 0, 42, { ...settings(), repel: 1, centerStrength: 0, clusterForce: 0 });
    run(e, 200);
    e.setTarget(0, 200, 100, true);
    e.endDrag(0, false, 120, -8);
    e.step(1);
    let p = e.positions();
    expect(p[0]).toBeGreaterThan(200);
    expect(p[1]).toBeLessThan(100);
    e.setTarget(1, -30, 20, true);
    e.endDrag(1, true, 24, 24);
    p = e.positions();
    const before = [p[2], p[3]];
    e.step(10);
    p = e.positions();
    expect([p[2], p[3]]).toEqual(before);
    assertFinite(e);
  });
});

describe("确定性与 seed", () => {
  it("同 seed 位级一致", () => {
    const { nodes, links } = ringGraph(50);
    const a = new TsLayoutEngine();
    const b = new TsLayoutEngine();
    a.init(nodes, links, 400, 300, 1, 20260101, settings());
    b.init(nodes, links, 400, 300, 1, 20260101, settings());
    run(a, 200);
    run(b, 200);
    expect(a.positions()).toEqual(b.positions());
  });

  it("不同 seed 布局发散", () => {
    const { nodes, links } = ringGraph(50);
    const a = new TsLayoutEngine();
    const b = new TsLayoutEngine();
    a.init(nodes, links, 400, 300, 1, 1, settings());
    b.init(nodes, links, 400, 300, 1, 2, settings());
    run(a, 200);
    run(b, 200);
    expect(a.positions()).not.toEqual(b.positions());
  });

  it("deriveSeed 稳定且对顺序/内容敏感", () => {
    expect(deriveSeed(["a", "b"])).toBe(deriveSeed(["a", "b"]));
    expect(deriveSeed(["a", "b"])).not.toBe(deriveSeed(["b", "a"]));
    expect(deriveSeed([])).toBe(deriveSeed([]));
  });
});

describe("大图边界", () => {
  it("1200 节点 200 步内保持有限且合理耗时", () => {
    const n = 1200;
    const nodes: InitNode[] = Array.from({ length: n }, (_, i) => ({
      id: `n${i}`,
      x: Number.NaN,
      y: Number.NaN,
      type: i % 6,
    }));
    const links: InitLink[] = [];
    for (let i = 1; i < n; i++) links.push({ source: `n${i}`, target: `n${i - 1}` });
    const started = Date.now();
    const e = new TsLayoutEngine();
    e.init(nodes, links, 0, 0, 1, 777, settings());
    run(e, 200);
    const elapsed = Date.now() - started;
    assertFinite(e);
    expect(elapsed).toBeLessThan(20000);
  }, 30000);
});

describe("协议消息行为（init/heat/restart/pin 序列）", () => {
  it("heat 复位 done 并继续演化", () => {
    const { nodes, links } = ringGraph(30);
    const e = new TsLayoutEngine();
    e.init(nodes, links, 0, 0, 1, 11, settings());
    run(e, 1000);
    expect(e.done()).toBe(true);
    e.heat(0.5);
    expect(e.done()).toBe(false);
    run(e, 300);
    assertFinite(e);
  });

  it("restart 更新参数且保持节点数", () => {
    const { nodes, links } = ringGraph(20);
    const e = new TsLayoutEngine();
    e.init(nodes, links, 0, 0, 1, 2, settings());
    e.config({ ...settings(), linkDistance: 60 });
    e.heat(0.4);
    run(e, 200);
    expect(e.nodeCount).toBe(20);
    assertFinite(e);
  });

  it("pinSequence 随操作单调递增", () => {
    const { nodes } = ringGraph(5);
    const e = new TsLayoutEngine();
    e.init(nodes, [], 0, 0, 1, 9, settings());
    e.setFixed(0, true);
    e.setFixed(1, true);
    const s3 = e.setFixed(0, false);
    expect(s3).toBe(3);
    expect(e.pinSequence()).toBe(3);
  });
});
