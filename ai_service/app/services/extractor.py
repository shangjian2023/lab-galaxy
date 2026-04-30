"""Entity & relationship extraction via LLM."""

import hashlib
import json
import logging
import re
import uuid

from app.core.exceptions import ExtractionError
from app.services.llm import call_llm
from app.registries.extractors import extractor_registry

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一个专业的实验文档分析助手。从实验文档中抽取实体和关系，构建知识图谱。

## 实体类型
- Experiment: 实验名称或实验方案（**每份文档只提取一个最主要的实验**）
- Equipment: 实验设备/仪器
- Theory: 涉及的理论/原理/公式
- Consumable: 实验耗材/试剂
- Tool: 工具/软件/平台

## 关系类型（极其重要：必须抽取关系！relations 数组不能为空！）
- uses: Experiment 使用 Equipment/Tool/Consumable
- based_on: Experiment 基于 Theory
- requires: Equipment 需要 Consumable
- similar_to: Experiment 与 Experiment 相似

## 输出格式
严格输出以下 JSON，不要任何额外文本或解释：

{
  "entities": [
    {"id": "e1", "type": "Equipment", "name": "示波器", "summary": "用于观测电信号的电子测量仪器"},
    {"id": "e2", "type": "Experiment", "name": "RC电路瞬态响应实验", "summary": "研究RC电路的充放电特性"},
    {"id": "e3", "type": "Theory", "name": "RC时间常数", "summary": "τ=RC，决定充放电速率"}
  ],
  "relations": [
    {"source_id": "e2", "target_id": "e1", "type": "uses", "confidence": 0.9},
    {"source_id": "e2", "target_id": "e3", "type": "based_on", "confidence": 0.95}
  ]
}

## 关键规则
1. 每个实体的 id 必须用 e1, e2, e3... 格式，按顺序编号
2. 关系的 source_id 和 target_id 必须引用上面已定义的实体 id
3. **relations 数组绝对不能为空！必须为 Experiment 至少创建 2 个关系**
4. 找关系时思考：这个实验用了什么设备？基于什么理论？需要什么耗材和工具？
5. 如果有多个 Experiment，考虑它们之间的 similar_to 关系
6. 如果有 Equipment 和 Consumable，考虑 requires 关系
7. confidence 是 0.0 到 1.0 之间的浮点数
8. 只输出 JSON，不要有任何其他文字"""

RELATIONS_ONLY_PROMPT = """基于以下已抽取的实体，找出它们之间的关系。

已抽取实体：
{entities_text}

## 关系类型
- uses: Experiment 使用 Equipment/Tool/Consumable
- based_on: Experiment 基于 Theory
- requires: Equipment 需要 Consumable
- similar_to: Experiment 与 Experiment 相似

## 输出格式
严格输出一个 JSON 数组，只包含关系，不要任何额外文本：

[
  {{"source_id": "e2", "target_id": "e1", "type": "uses", "confidence": 0.9}},
  {{"source_id": "e2", "target_id": "e3", "type": "based_on", "confidence": 0.8}}
]

## 关键规则
1. source_id 和 target_id 必须使用上面列出的实体 id
2. 只输出 JSON 数组，不要有其他文字
3. **必须为 Experiment 类型的实体创建至少 2 个关系（uses 或 based_on）**
4. 对于每个 Equipment 类型的实体，考虑它是否 relates to Experiment
5. 如果有 Equipment 和 Consumable，考虑 requires 关系
6. confidence 是 0.0 到 1.0 之间的浮点数
7. 不要输出空数组 []，如果找不到关系请重新仔细阅读实体列表再试"""


def _extract_json(response: str) -> str:
    """Extract JSON string from LLM response, handling markdown fences and stray text."""
    # Try markdown code block first
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
    json_str = json_match.group(1) if json_match else response

    json_str = json_str.strip()
    # Remove leading/trailing markdown code fence markers
    json_str = re.sub(r"^```\w*\n?", "", json_str)
    json_str = re.sub(r"\n?```$", "", json_str)

    # Find the outermost JSON object using stack-based matching
    start = json_str.find("{")
    if start == -1:
        start = json_str.find("[")
        if start != -1:
            close = "]"
            open_c = "["
        else:
            return json_str
    else:
        close = "}"
        open_c = "{"

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(json_str)):
        c = json_str[i]
        if escape:
            escape = False
            continue
        if c == "\\":
            escape = True
            continue
        if c == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == open_c:
            depth += 1
        elif c == close:
            depth -= 1
            if depth == 0:
                json_str = json_str[start:i + 1]
                break

    return json_str


def _extract_entity_objects(json_str: str) -> list[dict]:
    """Extract individual entity objects from malformed JSON using stack-based matching."""
    entities = []
    # Find all top-level JSON objects that have "name" and "type" fields
    i = 0
    while i < len(json_str):
        if json_str[i] == "{":
            # Find matching closing brace using stack
            depth = 0
            in_string = False
            escape = False
            end = i
            for j in range(i, len(json_str)):
                c = json_str[j]
                if escape:
                    escape = False
                    continue
                if c == "\\":
                    escape = True
                    continue
                if c == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        end = j + 1
                        break
            if end > i:
                obj_str = json_str[i:end]
                # Only consider objects that look like entities (have name and type)
                if '"name"' in obj_str and '"type"' in obj_str:
                    try:
                        obj = json.loads(obj_str)
                        if isinstance(obj, dict) and "name" in obj:
                            entities.append(obj)
                    except json.JSONDecodeError:
                        # Try repairing this single object
                        obj_repaired = _repair_json(obj_str)
                        try:
                            obj = json.loads(obj_repaired)
                            if isinstance(obj, dict) and "name" in obj:
                                entities.append(obj)
                        except json.JSONDecodeError:
                            pass
                i = end
            else:
                i += 1
        else:
            i += 1
    return entities


def _repair_json(json_str: str) -> str:
    """Apply common JSON repairs for LLM output issues."""
    # Remove trailing commas before ] or }
    json_str = re.sub(r",\s*([}\]])", r"\1", json_str)
    # Fix missing commas between string literals on consecutive lines
    json_str = re.sub(r'"\s*\n\s*"', '",\n"', json_str)
    # Fix unescaped backslashes (but not already escaped ones or valid escapes)
    json_str = re.sub(r"(?<!\\)\\(?![\"\\/bfnrtu])", r"\\\\", json_str)
    # Remove BOM or invisible characters
    json_str = json_str.replace("﻿", "").replace("​", "")
    # Fix single quotes used as string delimiters
    # (only if the whole thing uses single quotes instead of double)
    if json_str.count("'") > json_str.count('"') * 2:
        json_str = re.sub(r"'(?=[^']*':)", '"', json_str)
    # Fix unescaped control characters in strings (except \n, \r, \t)
    json_str = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", json_str)
    # Fix Chinese quotation marks inside JSON strings
    json_str = json_str.replace("“", '"').replace("”", '"')
    json_str = json_str.replace("‘", "'").replace("’", "'")
    # Fix missing opening/closing braces due to truncation
    if json_str.count("{") > json_str.count("}"):
        json_str += "}" * (json_str.count("{") - json_str.count("}"))
    if json_str.count("[") > json_str.count("]"):
        json_str += "]" * (json_str.count("[") - json_str.count("]"))
    return json_str


def _parse_json_with_retry(json_str: str) -> dict | None:
    """Try to parse JSON with multiple repair strategies."""
    for attempt in range(5):
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            if attempt == 0:
                json_str = _repair_json(json_str)
            elif attempt == 1:
                # Try json_repair library if available
                try:
                    import json_repair  # type: ignore
                    return json_repair.repair_json(json_str)
                except (ImportError, Exception):
                    pass
            elif attempt == 2:
                # Try extracting just entities array
                ent_match = re.search(r'"entities"\s*:\s*\[([\s\S]*?)\](?=\s*[,}])', json_str)
                if ent_match:
                    try:
                        entities = json.loads("[" + ent_match.group(1) + "]")
                        return {"entities": entities, "relations": []}
                    except json.JSONDecodeError:
                        pass
            elif attempt == 3:
                # Try extracting individual entity objects using stack-based matching
                entities = _extract_entity_objects(json_str)
                if entities:
                    return {"entities": entities, "relations": []}
            elif attempt == 4:
                # Last resort: try parsing with ast.literal_eval
                try:
                    import ast
                    result = ast.literal_eval(json_str)
                    if isinstance(result, dict):
                        return result
                except (ValueError, SyntaxError, Exception):
                    pass
    return None


def _normalize_entity_ids(entities: list[dict]) -> dict[str, str]:
    """Replace simple ids (e1, e2...) with deterministic UUIDs. Returns id mapping."""
    id_map: dict[str, str] = {}
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        old_id = entity.get("id", "")
        name = entity.get("name", "").strip()
        etype = entity.get("type", "Concept")
        if name:
            raw = f"{etype}:{name}".encode("utf-8")
            new_id = str(uuid.UUID(hashlib.md5(raw).hexdigest()))
        else:
            new_id = str(uuid.uuid4())
        entity["id"] = new_id
        if old_id:
            id_map[old_id] = new_id
    return id_map


def _validate_result_shape(result: object) -> dict:
    if not isinstance(result, dict):
        raise ExtractionError("抽取结果不是合法对象")
    entities = result.get("entities")
    relations = result.get("relations")
    if not isinstance(entities, list) or not isinstance(relations, list):
        raise ExtractionError("抽取结果缺少 entities/relations 列表")
    return {"entities": entities, "relations": relations}


@extractor_registry.register("default")
async def extract_entities_llm(text: str) -> dict:
    max_chars = 12000
    truncated = text[:max_chars]
    if len(text) > max_chars:
        truncated += "\n...（文档过长，已截断）"

    prompt = f"请分析以下实验文档内容，抽取实体和关系：\n\n{truncated}"

    # --- Primary extraction ---
    response = await call_llm(prompt, system=SYSTEM_PROMPT, max_tokens=4096)
    json_str = _extract_json(response)
    result = _parse_json_with_retry(json_str)

    # If JSON parsing failed, retry LLM with stronger constraint
    if result is None:
        logger.warning(
            "Primary extraction failed to parse JSON. Raw response (first 500 chars): %s",
            response[:500]
        )
        retry_prompt = f"{prompt}\n\n【重要提醒：只输出合法 JSON，不要有任何其他文字。确保所有字符串正确转义。】"
        response = await call_llm(retry_prompt, system=SYSTEM_PROMPT, max_tokens=4096)
        json_str = _extract_json(response)
        result = _parse_json_with_retry(json_str)

    if result is None:
        logger.error(
            "Failed to parse LLM JSON output after retry. Retry response (first 500 chars): %s",
            response[:500]
        )
        raise ExtractionError("无法解析模型返回的抽取结果，已尝试重试")

    validated = _validate_result_shape(result)

    # --- Deduplicate experiments: keep only the first Experiment per document ---
    entities = validated["entities"]
    seen_experiment = False
    filtered_entities = []
    experiment_ids_to_drop: set[str] = set()
    for e in entities:
        if isinstance(e, dict) and e.get("type") == "Experiment":
            if seen_experiment:
                experiment_ids_to_drop.add(e["id"])
                continue
            seen_experiment = True
        filtered_entities.append(e)
    entities = filtered_entities
    validated["entities"] = entities

    # --- Second pass: extract relations if missing ---
    entities = validated["entities"]
    relations = validated["relations"]

    if len(entities) >= 2 and len(relations) == 0:
        logger.info(f"Got {len(entities)} entities but 0 relations, running second-pass relation extraction...")
        entity_lines = []
        for e in entities:
            if isinstance(e, dict):
                entity_lines.append(
                    f"  id={e.get('id','?')} | type={e.get('type','?')} | name={e.get('name','?')} | {e.get('summary','')[:80]}"
                )
        relations_response = await call_llm(
            RELATIONS_ONLY_PROMPT.format(entities_text="\n".join(entity_lines)),
            system="你是一个专业的实验知识图谱分析助手。只输出 JSON 数组。",
            max_tokens=2048,
        )
        rel_json_str = _extract_json(relations_response)
        try:
            extra_relations = json.loads(rel_json_str)
            if isinstance(extra_relations, list):
                relations = extra_relations
            elif isinstance(extra_relations, dict) and "relations" in extra_relations:
                relations = extra_relations["relations"]
        except json.JSONDecodeError:
            extra_relations = _parse_json_with_retry(rel_json_str)
            if isinstance(extra_relations, list):
                relations = extra_relations
            elif isinstance(extra_relations, dict) and "relations" in extra_relations:
                relations = extra_relations["relations"]
        logger.info(f"Second pass extracted {len(relations)} relations")

    # Heuristic fallback: auto-link by type if still zero relations
    if len(entities) >= 2 and len(relations) == 0:
        logger.info("Applying heuristic relation generation as last resort")
        experiments = [e for e in entities if isinstance(e, dict) and e.get("type") == "Experiment"]
        equipment = [e for e in entities if isinstance(e, dict) and e.get("type") == "Equipment"]
        theories = [e for e in entities if isinstance(e, dict) and e.get("type") == "Theory"]
        tools = [e for e in entities if isinstance(e, dict) and e.get("type") == "Tool"]
        consumables = [e for e in entities if isinstance(e, dict) and e.get("type") == "Consumable"]
        for exp in experiments:
            for eq in equipment:
                relations.append({"source_id": exp["id"], "target_id": eq["id"], "type": "uses", "confidence": 0.6})
            for th in theories:
                relations.append({"source_id": exp["id"], "target_id": th["id"], "type": "based_on", "confidence": 0.6})
            for tl in tools:
                relations.append({"source_id": exp["id"], "target_id": tl["id"], "type": "uses", "confidence": 0.5})
            for cs in consumables:
                relations.append({"source_id": exp["id"], "target_id": cs["id"], "type": "uses", "confidence": 0.5})
        if not experiments:
            for i, e1 in enumerate(entities):
                if not isinstance(e1, dict): continue
                for e2 in entities[i+1:]:
                    if not isinstance(e2, dict): continue
                    relations.append({"source_id": e1["id"], "target_id": e2["id"], "type": "related_to", "confidence": 0.3})
        logger.info(f"Heuristic generated {len(relations)} relations")

    validated["relations"] = relations

    # Normalize entity IDs from simple format to deterministic UUIDs
    id_map = _normalize_entity_ids(entities)

    # Remap relation source/target IDs
    for relation in relations:
        if not isinstance(relation, dict):
            continue
        src = relation.get("source_id", "")
        tgt = relation.get("target_id", "")
        if src in id_map:
            relation["source_id"] = id_map[src]
        if tgt in id_map:
            relation["target_id"] = id_map[tgt]

    # Validate and filter relations
    valid_ids = {e.get("id") for e in entities if isinstance(e, dict)}
    filtered = []
    for relation in relations:
        if not isinstance(relation, dict):
            continue
        if relation.get("source_id") not in valid_ids or relation.get("target_id") not in valid_ids:
            logger.warning(f"Dropping relation with invalid id ref: {relation}")
            continue
        if relation.get("source_id") == relation.get("target_id"):
            continue
        filtered.append(relation)
    validated["relations"] = filtered
    logger.info(f"Final result: {len(entities)} entities, {len(filtered)} relations")

    return validated


async def extract_entities(text: str, strategy: str = "default") -> dict:
    fn = extractor_registry.get(strategy)
    return await fn(text)
