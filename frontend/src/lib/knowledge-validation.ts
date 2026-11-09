import type {
  KnowledgeChunkInput,
  KnowledgeEntityCandidate,
  KnowledgeRelationCandidate,
  ValidatedKnowledgeExtraction,
} from "@/lib/knowledge-types";

const GROUPS = new Set(["experiment", "resource", "knowledge"]);
const ENTITY_KEYS = new Set(["name", "type", "group", "summary", "confidence", "evidenceChunkId"]);
const RELATION_KEYS = new Set(["sourceName", "targetName", "relation", "confidence", "evidenceChunkId"]);
const ROOT_KEYS = new Set(["entities", "relations"]);
const MAX_ENTITIES = 60;
const MAX_RELATIONS = 100;

export class KnowledgeValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`模型输出未通过结构化校验：${issues.slice(0, 5).join("；")}`);
    this.name = "KnowledgeValidationError";
  }
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path}包含未知字段 ${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) issues.push(`${path}缺少字段 ${key}`);
  }
}

function boundedText(value: unknown, field: string, maxLength: number, issues: string[]): string {
  if (typeof value !== "string") {
    issues.push(`${field}必须是字符串`);
    return "";
  }
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) issues.push(`${field}不能为空`);
  if (text.length > maxLength) issues.push(`${field}长度不能超过 ${maxLength}`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) issues.push(`${field}包含控制字符`);
  return text;
}

function confidence(value: unknown, field: string, issues: string[]): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    issues.push(`${field}必须是 0 到 1 之间的数字`);
    return Number.NaN;
  }
  return value;
}

export function normalizeKnowledgeName(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}

export function parseKnowledgeJson(content: string): unknown {
  if (typeof content !== "string" || !content.trim()) throw new KnowledgeValidationError(["模型未返回 JSON"]);
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new KnowledgeValidationError(["模型返回的不是合法 JSON"]);
  }
}

export function validateKnowledgeExtraction(
  payload: unknown,
  chunks: readonly KnowledgeChunkInput[],
): ValidatedKnowledgeExtraction {
  const issues: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new KnowledgeValidationError(["模型输出必须是 JSON 对象"]);
  }
  const root = payload as Record<string, unknown>;
  exactKeys(root, ROOT_KEYS, "输出", issues);
  const entityInput = root.entities;
  const relationInput = root.relations;
  if (!Array.isArray(entityInput)) issues.push("entities 必须是数组");
  if (!Array.isArray(relationInput)) issues.push("relations 必须是数组");
  if (issues.length) throw new KnowledgeValidationError(issues);

  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
  const entityNames = new Map<string, KnowledgeEntityCandidate>();
  if (Array.isArray(entityInput) && entityInput.length > MAX_ENTITIES) issues.push(`实体数量不能超过 ${MAX_ENTITIES}`);

  (Array.isArray(entityInput) ? entityInput : []).slice(0, MAX_ENTITIES + 1).forEach((rawEntity, index) => {
    const path = `entities[${index}]`;
    if (!rawEntity || typeof rawEntity !== "object" || Array.isArray(rawEntity)) {
      issues.push(`${path}必须是对象`);
      return;
    }
    const entity = rawEntity as Record<string, unknown>;
    exactKeys(entity, ENTITY_KEYS, path, issues);
    const name = boundedText(entity.name, `${path}.name`, 120, issues);
    const type = boundedText(entity.type, `${path}.type`, 80, issues);
    const summary = boundedText(entity.summary, `${path}.summary`, 600, issues);
    const groupValue = typeof entity.group === "string" && GROUPS.has(entity.group) ? entity.group : undefined;
    const group = groupValue as KnowledgeEntityCandidate["group"] | undefined;
    if (!group) issues.push(`${path}.group 必须是 experiment/resource/knowledge`);
    const score = confidence(entity.confidence, `${path}.confidence`, issues);
    const evidenceChunkId = typeof entity.evidenceChunkId === "string" ? entity.evidenceChunkId : "";
    if (!evidenceChunkId || !chunkIds.has(evidenceChunkId)) {
      issues.push(`${path}.evidenceChunkId 不属于本次输入`);
    }
    if (!name || !type || !summary || !group || Number.isNaN(score) || !chunkIds.has(evidenceChunkId)) return;
    const normalized = normalizeKnowledgeName(name);
    if (entityNames.has(normalized)) {
      issues.push(`${path}.name 与其他实体重复`);
      return;
    }
    entityNames.set(normalized, {
      name,
      normalizedName: normalized,
      type,
      group,
      summary,
      confidence: score,
      evidenceChunkId,
    });
  });

  if (Array.isArray(relationInput) && relationInput.length > MAX_RELATIONS) issues.push(`关系数量不能超过 ${MAX_RELATIONS}`);
  const relations: KnowledgeRelationCandidate[] = [];
  const relationKeys = new Set<string>();
  (Array.isArray(relationInput) ? relationInput : []).slice(0, MAX_RELATIONS + 1).forEach((rawRelation, index) => {
    const path = `relations[${index}]`;
    if (!rawRelation || typeof rawRelation !== "object" || Array.isArray(rawRelation)) {
      issues.push(`${path}必须是对象`);
      return;
    }
    const relation = rawRelation as Record<string, unknown>;
    exactKeys(relation, RELATION_KEYS, path, issues);
    const sourceName = boundedText(relation.sourceName, `${path}.sourceName`, 120, issues);
    const targetName = boundedText(relation.targetName, `${path}.targetName`, 120, issues);
    const label = boundedText(relation.relation, `${path}.relation`, 100, issues);
    const score = confidence(relation.confidence, `${path}.confidence`, issues);
    const evidenceChunkId = typeof relation.evidenceChunkId === "string" ? relation.evidenceChunkId : "";
    if (!evidenceChunkId || !chunkIds.has(evidenceChunkId)) {
      issues.push(`${path}.evidenceChunkId 不属于本次输入`);
    }
    const source = sourceName ? entityNames.get(normalizeKnowledgeName(sourceName)) : undefined;
    const target = targetName ? entityNames.get(normalizeKnowledgeName(targetName)) : undefined;
    if (!source) issues.push(`${path}.sourceName 未出现在实体列表`);
    if (!target) issues.push(`${path}.targetName 未出现在实体列表`);
    if (!label || !source || !target || Number.isNaN(score) || !chunkIds.has(evidenceChunkId)) return;
    if (source.normalizedName === target.normalizedName) {
      issues.push(`${path}不能指向相同实体`);
      return;
    }
    const key = `${source.normalizedName}\0${target.normalizedName}\0${normalizeKnowledgeName(label)}`;
    if (relationKeys.has(key)) {
      issues.push(`${path}与其他关系重复`);
      return;
    }
    relationKeys.add(key);
    relations.push({
      sourceName: source.name,
      targetName: target.name,
      relation: label,
      confidence: score,
      evidenceChunkId,
    });
  });

  if (issues.length) throw new KnowledgeValidationError(issues);
  return { entities: [...entityNames.values()], relations };
}

export function validateKnowledgeModelOutput(
  content: string,
  chunks: readonly KnowledgeChunkInput[],
): ValidatedKnowledgeExtraction {
  return validateKnowledgeExtraction(parseKnowledgeJson(content), chunks);
}
