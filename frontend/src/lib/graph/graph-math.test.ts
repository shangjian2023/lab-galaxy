/**
 * graph-math 单元测试：视图变换、命中网格、LOD、邻接表。
 */

import { describe, expect, it } from "vitest";
import {
  buildAdjacency,
  clampZoom,
  easeTowards,
  fitBounds,
  labelOpacity,
  neighborhoodDistances,
  panBy,
  screenToWorld,
  SpatialHitGrid,
  worldToScreen,
  zoomAround,
} from "./graph-math";

describe("视图变换", () => {
  it("world/screen 往返一致", () => {
    const t = { x: 120, y: -40, k: 1.7 };
    const [sx, sy] = worldToScreen(t, 33.5, -12.25);
    const [wx, wy] = screenToWorld(t, sx, sy);
    expect(wx).toBeCloseTo(33.5, 5);
    expect(wy).toBeCloseTo(-12.25, 5);
  });

  it("zoomAround 保持光标下的世界点不动", () => {
    const t = { x: 40, y: 80, k: 1.2 };
    const [sx, sy] = worldToScreen(t, 50, 60);
    const t2 = zoomAround(t, sx, sy, 2);
    const [wx, wy] = screenToWorld(t2, sx, sy);
    expect(wx).toBeCloseTo(50, 4);
    expect(wy).toBeCloseTo(60, 4);
    expect(t2.k).toBeCloseTo(2.4, 5);
  });

  it("clampZoom 限制缩放范围", () => {
    expect(clampZoom(0.0001)).toBeGreaterThan(0);
    expect(clampZoom(999)).toBeLessThan(10);
    expect(clampZoom(1)).toBe(1);
  });

  it("panBy 平移", () => {
    const t = panBy({ x: 0, y: 0, k: 2 }, 10, -5);
    expect(t).toEqual({ x: 10, y: -5, k: 2 });
  });

  it("fitBounds 包围盒居中且不超过 1.6", () => {
    const t = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 600, 50);
    expect(t.k).toBeLessThanOrEqual(1.6);
    // 中心点 (50,50) 应映射到视口中心
    const [sx, sy] = worldToScreen(t, 50, 50);
    expect(sx).toBeCloseTo(400, 4);
    expect(sy).toBeCloseTo(300, 4);
  });
});

describe("缓动与 LOD", () => {
  it("easeTowards 指数趋近并收敛", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = easeTowards(v, 1, 10, 16);
    expect(v).toBe(1);
  });

  it("labelOpacity 分段", () => {
    expect(labelOpacity(0.3)).toBe(0);
    expect(labelOpacity(1.5)).toBe(1);
    expect(labelOpacity(0.7)).toBeGreaterThan(0);
    expect(labelOpacity(0.7)).toBeLessThan(1);
  });
});

describe("SpatialHitGrid", () => {
  it("命中最近节点", () => {
    const grid = new SpatialHitGrid(64);
    const x = [10, 200, 400];
    const y = [10, 210, 400];
    grid.build(x, y, 3);
    expect(grid.hit(x, y, 12, 9, 20)).toBe(0);
    expect(grid.hit(x, y, 205, 205, 20)).toBe(1);
    expect(grid.hit(x, y, 500, 500, 20)).toBe(-1);
  });

  it("负坐标与空网格", () => {
    const grid = new SpatialHitGrid(64);
    grid.build([], [], 0);
    expect(grid.hit(new Float32Array(0), new Float32Array(0), 0, 0, 10)).toBe(-1);
    const x = [-100, -50];
    const y = [-100, -60];
    grid.build(x, y, 2);
    expect(grid.hit(x, y, -98, -99, 10)).toBe(0);
  });

  it("命中半径过滤", () => {
    const grid = new SpatialHitGrid(64);
    const x = [0];
    const y = [0];
    grid.build(x, y, 1);
    expect(grid.hit(x, y, 5, 0, 4)).toBe(-1);
    expect(grid.hit(x, y, 5, 0, 6)).toBe(0);
  });
});

describe("buildAdjacency", () => {
  it("无向邻接双向可达", () => {
    const adj = buildAdjacency(4, new Uint32Array([0, 2, 2, 3]));
    expect([...adj[0]]).toEqual([2]);
    expect([...adj[2]].sort()).toEqual([0, 3]);
    expect([...adj[3]]).toEqual([2]);
    expect(adj[1].length).toBe(0);
  });
});

describe("局部邻域", () => {
  it("逐层扩展并正确处理环", () => {
    const adjacency = buildAdjacency(5, new Uint32Array([0, 1, 1, 2, 2, 0, 2, 3]));
    expect(neighborhoodDistances(adjacency, 0, 1)).toEqual(new Map([[0, 0], [1, 1], [2, 1]]));
    expect(neighborhoodDistances(adjacency, 0, 2).get(3)).toBe(2);
    expect(neighborhoodDistances(adjacency, 0, 3).has(4)).toBe(false);
  });

  it("孤岛与无效根节点不会扩展", () => {
    const adjacency = buildAdjacency(2, new Uint32Array());
    expect(neighborhoodDistances(adjacency, 1, 3)).toEqual(new Map([[1, 0]]));
    expect(neighborhoodDistances(adjacency, -1, 3).size).toBe(0);
    expect(neighborhoodDistances(adjacency, 2, 3).size).toBe(0);
  });
});
