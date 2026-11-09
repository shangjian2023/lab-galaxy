/**
 * 位置缓存键与签名测试（纯函数，不需要 IndexedDB），
 * 重点验证 用户+scope 隔离 —— 不允许出现跨账号共享键。
 */

import { describe, expect, it } from "vitest";
import {
  cacheKey,
  cacheNamespace,
  graphSignature,
  type CacheScope,
} from "./position-cache";

describe("cacheNamespace 用户+scope 隔离", () => {
  const base: CacheScope = { userId: "u1", scope: "private", teamId: null };

  it("不同用户得到不同命名空间", () => {
    expect(cacheNamespace(base)).not.toBe(cacheNamespace({ ...base, userId: "u2" }));
  });

  it("同一用户不同 scope 得到不同命名空间", () => {
    expect(cacheNamespace(base)).not.toBe(cacheNamespace({ ...base, scope: "team" }));
    expect(cacheNamespace(base)).not.toBe(cacheNamespace({ ...base, scope: "public" }));
  });

  it("同一用户同一 scope 不同团队得到不同命名空间", () => {
    expect(cacheNamespace(base)).not.toBe(cacheNamespace({ ...base, scope: "team", teamId: "t1" }));
    expect(cacheNamespace({ ...base, scope: "team", teamId: "t1" })).not.toBe(
      cacheNamespace({ ...base, scope: "team", teamId: "t2" }),
    );
  });

  it("同参数幂等；匿名用户也有稳定键", () => {
    expect(cacheNamespace(base)).toBe(cacheNamespace({ ...base }));
    expect(cacheNamespace({ userId: "", scope: "private", teamId: null })).toContain("anonymous");
  });

  it("demo 用户命名空间与任何真实用户不同", () => {
    const demo = cacheNamespace({ userId: "demo", scope: "private", teamId: null });
    expect(demo).not.toBe(cacheNamespace(base));
  });

  it("cacheKey 绑定签名", () => {
    const ns = cacheNamespace(base);
    expect(cacheKey(ns, "nabc-e000")).toBe(`${ns}::nabc-e000`);
    expect(cacheKey(ns, "a")).not.toBe(cacheKey(ns, "b"));
  });
});

describe("graphSignature", () => {
  it("与顺序无关", () => {
    expect(graphSignature(["a", "b"], ["x"])).toBe(graphSignature(["b", "a"], ["x"]));
  });

  it("节点或边集合变化则签名变化", () => {
    const s0 = graphSignature(["a", "b"], []);
    expect(graphSignature(["a", "b", "c"], [])).not.toBe(s0);
    expect(graphSignature(["a", "b"], ["e1"])).not.toBe(s0);
  });

  it("空图签名稳定", () => {
    expect(graphSignature([], [])).toBe(graphSignature([], []));
  });
});
