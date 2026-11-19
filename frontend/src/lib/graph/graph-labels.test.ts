import { describe, expect, it } from "vitest";
import { planGraphLabels, type GraphLabelPlacement } from "./graph-labels";

function placement(id: string, group: GraphLabelPlacement["group"], index: number, force = false): GraphLabelPlacement {
  return { id, group, force, left: index * 100, top: 0, right: index * 100 + 80, bottom: 20 };
}

describe("graph label planning", () => {
  it("小图不按度数或类型隐藏任何标签", () => {
    const placements = Array.from({ length: 60 }, (_, index) => placement(`node-${index}`, "knowledge", index));
    expect(planGraphLabels(placements).size).toBe(60);
  });

  it("大图碰撞布局轮流保留三种节点，而非只保留实验节点", () => {
    const placements = Array.from({ length: 61 }, (_, index) => placement(`node-${index}`, (["experiment", "resource", "knowledge"] as const)[index % 3], index < 3 ? index : 0));
    const visible = planGraphLabels(placements);
    expect(visible).toEqual(new Set(["node-0", "node-1", "node-2"]));
  });

  it("悬浮和选中标签即使重叠也始终保留", () => {
    const placements = Array.from({ length: 61 }, (_, index) => placement(`node-${index}`, "knowledge", 0, index === 60));
    const visible = planGraphLabels(placements);
    expect(visible.has("node-60")).toBe(true);
    expect(visible.has("node-0")).toBe(false);
  });

  it("总览密度预算仍轮流保留三类节点，force 不占用预算", () => {
    const placements = Array.from({ length: 61 }, (_, index) => placement(
      `node-${index}`,
      (["experiment", "resource", "knowledge"] as const)[index % 3],
      index,
      index === 60,
    ));
    const visible = planGraphLabels(placements, { maxVisible: 6, gap: 4 });
    expect(visible.size).toBe(7);
    expect(visible.has("node-60")).toBe(true);
    expect(["experiment", "resource", "knowledge"].every((group) => (
      placements.some((item) => item.group === group && visible.has(item.id))
    ))).toBe(true);
  });

  it("较宽的总览间距会拒绝原本可紧贴显示的标签", () => {
    const placements = [
      ...Array.from({ length: 60 }, (_, index) => placement(` filler-${index}`, "knowledge", index + 10)),
      { ...placement("near", "experiment", 0), right: 20 },
      { ...placement("next", "resource", 0), left: 24, right: 44 },
    ];
    expect(planGraphLabels(placements, { gap: 3 }).has("next")).toBe(true);
    expect(planGraphLabels(placements, { gap: 5 }).has("next")).toBe(false);
  });
});
