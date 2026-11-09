import { describe, expect, it } from "vitest";
import { validateKnowledgeModelOutput } from "./knowledge-validation";
import type { KnowledgeChunkInput } from "./knowledge-types";

const chunks: KnowledgeChunkInput[] = [
  { chunkId: "chunk-1", pageStart: 1, pageEnd: 1, text: "TCP 使用三次握手建立可靠连接。" },
  { chunkId: "chunk-2", pageStart: 2, pageEnd: 2, text: "实验比较了拥塞控制算法。" },
];

function payload() {
  return {
    entities: [
      { name: "TCP", type: "协议", group: "knowledge", summary: "传输控制协议。", confidence: 0.92, evidenceChunkId: "chunk-1" },
      { name: "三次握手", type: "过程", group: "experiment", summary: "连接建立过程。", confidence: 0.87, evidenceChunkId: "chunk-1" },
    ],
    relations: [
      { sourceName: "TCP", targetName: "三次握手", relation: "使用", confidence: 0.8, evidenceChunkId: "chunk-2" },
    ],
  };
}

describe("knowledge extraction validation", () => {
  it("accepts valid strict JSON and preserves input chunk evidence", () => {
    const result = validateKnowledgeModelOutput(JSON.stringify(payload()), chunks);
    expect(result.entities).toHaveLength(2);
    expect(result.relations[0].evidenceChunkId).toBe("chunk-2");
  });

  it("rejects malformed JSON", () => {
    expect(() => validateKnowledgeModelOutput("{bad", chunks)).toThrow(/合法 JSON/);
  });

  it("rejects fabricated evidence", () => {
    const bad = payload();
    bad.entities[0].evidenceChunkId = "not-input";
    expect(() => validateKnowledgeModelOutput(JSON.stringify(bad), chunks)).toThrow(/不属于本次输入/);
  });

  it("rejects invalid confidence, fields, names and relations", () => {
    const confidence = payload();
    confidence.entities[0].confidence = 1.1;
    expect(() => validateKnowledgeModelOutput(JSON.stringify(confidence), chunks)).toThrow(/置信度|confidence/);

    const unknown = payload() as Record<string, unknown>;
    (unknown.entities as Array<Record<string, unknown>>)[0].extra = true;
    expect(() => validateKnowledgeModelOutput(JSON.stringify(unknown), chunks)).toThrow(/未知字段/);

    const relation = payload();
    relation.relations[0].targetName = "不存在";
    expect(() => validateKnowledgeModelOutput(JSON.stringify(relation), chunks)).toThrow(/未出现在实体列表/);
  });
});
