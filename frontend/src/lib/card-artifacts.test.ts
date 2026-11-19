import { describe, expect, it } from "vitest";
import { cardArtifactForTitle } from "./card-artifacts";

describe("cardArtifactForTitle", () => {
  it("recognizes networking experiments, including software-defined networking", () => {
    expect(cardArtifactForTitle("Lab07_TCP_UDP_Protocol")).toBe("network");
    expect(cardArtifactForTitle("软件定义网络基础实验")).toBe("network");
  });

  it("recognizes computer hardware without confusing memory with a database", () => {
    expect(cardArtifactForTitle("计算机组成原理：存储器扩展")).toBe("hardware");
    expect(cardArtifactForTitle("Digital Logic Circuit Report")).toBe("hardware");
  });

  it("recognizes algorithm and data-structure experiments", () => {
    expect(cardArtifactForTitle("数据结构：二叉树遍历")).toBe("algorithm");
    expect(cardArtifactForTitle("Sorting Algorithm Comparison")).toBe("algorithm");
  });

  it("recognizes database, security and artificial-intelligence reports", () => {
    expect(cardArtifactForTitle("MySQL 数据库事务与索引实验")).toBe("database");
    expect(cardArtifactForTitle("网络安全：数字签名与身份认证")).toBe("security");
    expect(cardArtifactForTitle("神经网络机器学习实验")).toBe("ai");
  });

  it("gives specialized subjects priority over generic keywords", () => {
    expect(cardArtifactForTitle("信息安全中的网络加密")).toBe("security");
    expect(cardArtifactForTitle("人工智能搜索算法")).toBe("ai");
    expect(cardArtifactForTitle("SQL 数据库存储过程")).toBe("database");
    expect(cardArtifactForTitle("Web 应用网络安全测试")).toBe("security");
  });

  it("recognizes mobile, web, operating-system and distributed reports", () => {
    expect(cardArtifactForTitle("Android 移动应用开发")).toBe("mobile");
    expect(cardArtifactForTitle("React Web 前端实验")).toBe("web");
    expect(cardArtifactForTitle("操作系统进程管理实验")).toBe("os");
    expect(cardArtifactForTitle("Hadoop MapReduce 分布式计算")).toBe("distributed");
  });

  it("uses the neutral laboratory notebook for other reports", () => {
    expect(cardArtifactForTitle("创新实验报告模板")).toBe("software");
  });
});
