import { getModelConfig } from "./server-env";
import type { KnowledgeChunkInput, KnowledgeModel } from "./knowledge-types";

export const KNOWLEDGE_EXTRACTION_SCHEMA = `{
  "entities": [{
    "name": "string，1-120个字符",
    "type": "string，实体类型，1-80个字符",
    "group": "experiment | resource | knowledge",
    "summary": "string，仅依据原文，1-600个字符",
    "confidence": 0.0,
    "evidenceChunkId": "必须原样使用输入 chunk 的 chunkId"
  }],
  "relations": [{
    "sourceName": "必须等于某个已输出实体 name",
    "targetName": "必须等于某个已输出实体 name",
    "relation": "string，1-100个字符",
    "confidence": 0.0,
    "evidenceChunkId": "必须原样使用输入 chunk 的 chunkId"
  }]
}`;

export function buildExtractionMessages(chunks: readonly KnowledgeChunkInput[]) {
  const corpus = chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    page: chunk.pageStart === chunk.pageEnd || chunk.pageEnd === null
      ? chunk.pageStart
      : `${chunk.pageStart}-${chunk.pageEnd}`,
    text: chunk.text,
  }));
  return [
    {
      role: "system" as const,
      content: `你是严谨的实验报告知识图谱抽取器。只依据用户提供的 chunks 抽取，不得使用模型常识。只输出一个 JSON 对象，禁止 Markdown、注释、额外字段或包裹文本。结构为：${KNOWLEDGE_EXTRACTION_SCHEMA}`,
    },
    {
      role: "user" as const,
      content: JSON.stringify({ task: "extract_knowledge_graph", chunks: corpus }),
    },
  ];
}

export const requestKnowledgeExtraction: KnowledgeModel = async ({ chunks }) => {
  const config = getModelConfig();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 3000,
      stream: false,
      response_format: { type: "json_object" },
      messages: buildExtractionMessages(chunks),
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型服务返回 HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("模型响应缺少 choices[0].message.content");
  return content;
};
