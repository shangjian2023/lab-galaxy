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
      content: `你是严谨的实验报告知识图谱抽取器。只依据用户提供的 chunks 抽取，不得使用模型常识。只输出一个 JSON 对象，禁止 Markdown、注释、额外字段或包裹文本。最多输出 12 个实体和 16 条关系，优先覆盖不同的核心技术概念，并确保 JSON 完整闭合。每个实体和关系只能依据其 evidenceChunkId 指向的同一个 chunk，不得把其他 chunk 的数值、示例或解释拼入摘要。关系必须表达原文明确陈述的直接关系，不得把特定组网模式或示例泛化为必要条件，不得臆造安装位置、设备连接或因果方向；关系名称和摘要必须保留原文“通常”“可能”“部分”等范围限定，不得改成无条件必需；认证、维护、配置等关系必须保留准确作用对象，不得把产品写成技术本身；语义模糊时宁可少输出关系。摘要中的数值、示例和技术层级必须与原文一致。group 字段只能原样输出小写英文 experiment、resource、knowledge，不能输出中文或其他类型。relations 的 sourceName 和 targetName 必须逐字复制本次 entities 中已输出的 name；无法建立合法关系时少输出关系或返回空数组，不得引用未输出实体。实体名称必须有独立技术含义和配对括号，不要抽取纯章节号或缺少软件上下文的版本号片段。优先抽取实验、协议、算法、软件、配置、实验现象与技术结论；不要抽取学生或教师姓名、学号、日期、地点等行政信息或个人身份信息，也不要把报告作者当作知识节点。摘要必须能在对应证据中找到依据。结构为：${KNOWLEDGE_EXTRACTION_SCHEMA}`,
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
      max_tokens: 4000,
      stream: false,
      response_format: { type: "json_object" },
      messages: buildExtractionMessages(chunks),
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型服务返回 HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const payload = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error("模型输出达到 token 上限，JSON 未完整返回；请减少 chunk 后重试");
  }
  const content = choice?.message?.content;
  if (typeof content !== "string") throw new Error("模型响应缺少 choices[0].message.content");
  return content;
};
