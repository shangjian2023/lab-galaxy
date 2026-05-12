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

SYSTEM_PROMPT_ENTITIES = """你是一个专业的实验文档分析助手。从实验文档中抽取实体。

## 实体类型
- Experiment: 实验名称或实验方案（**每份文档只提取一个最主要的实验**）
- Equipment: 实验设备/仪器
- Theory: 涉及的理论/原理/公式
- Consumable: 实验耗材/试剂
- Tool: 工具/软件/平台

## 输出格式
严格输出以下 JSON，不要任何额外文本或解释：

{
  "entities": [
    {"id": "e1", "type": "Equipment", "name": "示波器", "summary": "用于观测电信号的电子测量仪器"},
    {"id": "e2", "type": "Experiment", "name": "RC电路瞬态响应实验", "summary": "研究RC电路的充放电特性"},
    {"id": "e3", "type": "Theory", "name": "RC时间常数", "summary": "τ=RC，决定充放电速率"}
  ]
}

## 关键规则
1. 每个实体的 id 必须用 e1, e2, e3... 格式，按顺序编号
2. 只输出 JSON，不要有任何其他文字
3. 确保所有字符串正确转义，特别是反斜杠和引号"""


SYSTEM_PROMPT_RELATIONS = """你是一个专业的实验知识图谱分析助手。基于已抽取的实体，找出它们之间的关系。

## 关系类型
- uses: Experiment 使用 Equipment/Tool/Consumable
- based_on: Experiment 基于 Theory
- requires: Equipment 需要 Consumable
- similar_to: Experiment 与 Experiment 相似

## 输出格式
严格输出以下 JSON，不要任何额外文本或解释：

{
  "relations": [
    {"source_id": "e2", "target_id": "e1", "type": "uses", "confidence": 0.9},
    {"source_id": "e2", "target_id": "e3", "type": "based_on", "confidence": 0.95}
  ]
}

## 关键规则
1. source_id 和 target_id 必须使用上面列出的实体 id（e1, e2... 格式），**不能使用 UUID 或其他格式**
2. 只输出 JSON，不要有任何其他文字
3. **必须为 Experiment 类型的实体创建至少 2 个关系（uses 或 based_on）**
4. 对于每个 Equipment 类型的实体，考虑它是否被 Experiment 使用
5. 如果有 Equipment 和 Consumable，考虑 requires 关系
6. confidence 是 0.0 到 1.0 之间的浮点数
7. 确保所有字符串正确转义"""


SYSTEM_PROMPT_ACHIEVEMENTS = """你是一个专业的实验文档分析助手。从实验文档中提取成果信息。

## 成果类型
- 论文: 发表的学术论文
- 专利: 申请或获得的专利
- 获奖: 获得的奖项或荣誉
- 项目成果: 完成的项目或技术突破
- 其他: 其他类型的成果

## 输出格式
严格输出以下 JSON，不要任何额外文本或解释：

{
  "achievements": [
    {"name": "成果名称", "description": "简要描述", "type": "论文"}
  ]
}

## 关键规则
1. 只提取文档中明确提到的成果
2. 只输出 JSON，不要有任何其他文字
3. 如果没有成果，输出 {"achievements": []}
4. 确保所有字符串正确转义"""


def _extract_json(response: str) -> str:
    """Extract JSON string from LLM response, handling markdown fences and stray text."""
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
    json_str = json_match.group(1) if json_match else response

    json_str = json_str.strip()
    json_str = re.sub(r"^```\w*\n?", "", json_str)
    json_str = re.sub(r"\n?```$", "", json_str)

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
    i = 0
    while i < len(json_str):
        if json_str[i] == "{":
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
                if '"name"' in obj_str and '"type"' in obj_str:
                    try:
                        obj = json.loads(obj_str)
                        if isinstance(obj, dict) and "name" in obj:
                            entities.append(obj)
                    except json.JSONDecodeError:
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
    """Apply common JSON repair strategies for LLM output issues."""
    json_str = re.sub(r",\s*([}\]])", r"\1", json_str)
    json_str = re.sub(r'"\s*\n\s*"', '",\n"', json_str)
    json_str = re.sub(r"(?<!\\)\\(?![\"\\/bfnrtu])", r"\\\\", json_str)
    json_str = json_str.replace("﻿", "").replace("​", "")
    if json_str.count("'") > json_str.count('"') * 2:
        json_str = re.sub(r"'(?=[^']*':)", '"', json_str)
    json_str = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", json_str)
    json_str = json_str.replace("“", '"').replace("”", '"')
    json_str = json_str.replace("‘", "'").replace("’", "'")
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
                try:
                    from json_repair import repair_json  # type: ignore
                    fixed = repair_json(json_str)
                    return json.loads(fixed) if isinstance(fixed, str) else fixed
                except (ImportError, Exception):
                    pass
            elif attempt == 2:
                ent_match = re.search(r'"entities"\s*:\s*\[([\s\S]*?)\](?=\s*[,}])', json_str)
                if ent_match:
                    try:
                        entities = json.loads("[" + ent_match.group(1) + "]")
                        return {"entities": entities, "relations": []}
                    except json.JSONDecodeError:
                        pass
            elif attempt == 3:
                entities = _extract_entity_objects(json_str)
                if entities:
                    return {"entities": entities, "relations": []}
            elif attempt == 4:
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


def _build_entity_id_map(entities: list[dict]) -> dict[str, str]:
    """Build UUID-based id mapping from e1/e2 format to actual UUIDs."""
    return {e.get("id"): e.get("id") for e in entities if isinstance(e, dict) and e.get("id")}


@extractor_registry.register("default")
async def extract_entities_llm(text: str) -> dict:
    max_chars = 12000
    truncated = text[:max_chars]
    if len(text) > max_chars:
        truncated += "\n...（文档过长，已截断）"

    prompt = f"请分析以下实验文档内容，抽取实体：\n\n{truncated}"

    # --- Step 1: Extract entities (uses e1, e2... format) ---
    response = await call_llm(prompt, system=SYSTEM_PROMPT_ENTITIES, max_tokens=4096)
    json_str = _extract_json(response)
    result = _parse_json_with_retry(json_str)

    if result is None:
        retry_prompt = f"{prompt}\n\n【重要提醒：只输出合法 JSON，不要有任何其他文字。确保所有字符串正确转义。】"
        response = await call_llm(retry_prompt, system=SYSTEM_PROMPT_ENTITIES, max_tokens=4096)
        json_str = _extract_json(response)
        result = _parse_json_with_retry(json_str)

    if result is None:
        logger.error(
            "Entity extraction failed to parse JSON after retry. Response (first 500): %s",
            response[:500]
        )
        raise ExtractionError("无法解析实体抽取结果，已尝试重试")

    entities = result.get("entities", [])
    if not isinstance(entities, list):
        entities = []

    # Deduplicate experiments: keep only the first Experiment per document
    seen_experiment = False
    filtered_entities = []
    for e in entities:
        if isinstance(e, dict) and e.get("type") == "Experiment":
            if seen_experiment:
                continue
            seen_experiment = True
        filtered_entities.append(e)
    entities = filtered_entities

    # --- Step 2: Extract relations (use e1, e2... format, NOT UUIDs) ---
    relations = []
    if len(entities) >= 2:
        # Build entity list with e1/e2 format IDs (still in original form before UUID conversion)
        entity_lines = []
        for e in entities:
            if isinstance(e, dict):
                entity_lines.append(
                    f"  id={e.get('id','?')} | type={e.get('type','?')} | name={e.get('name','?')} | {e.get('summary','')[:80]}"
                )
        rel_prompt = f"已抽取实体：\n" + "\n".join(entity_lines)

        for retry in range(2):
            response = await call_llm(rel_prompt, system=SYSTEM_PROMPT_RELATIONS, max_tokens=4096)
            rel_json_str = _extract_json(response)

            # Detect empty response (model returned nothing or whitespace)
            if not rel_json_str.strip() or len(rel_json_str.strip()) < 2:
                logger.warning(
                    "Relation LLM returned empty response (attempt %d/2), retrying...",
                    retry + 1
                )
                rel_prompt += "\n\n【请重新输出关系 JSON，不要为空。】"
                continue

            rel_result = _parse_json_with_retry(rel_json_str)
            if rel_result and "relations" in rel_result:
                relations = rel_result["relations"]
                if relations:  # got valid relations, stop retrying
                    break
            elif isinstance(rel_result, list) and rel_result:
                relations = rel_result
                break

            logger.warning(
                "Relation extraction parse failed (attempt %d/2). Response: %s",
                retry + 1, rel_json_str[:300]
            )
            rel_prompt += "\n\n【请重新输出合法的关系 JSON。】"

    # --- Step 3: Extract achievements (optional, non-blocking) ---
    achievements = []
    try:
        response = await call_llm(truncated, system=SYSTEM_PROMPT_ACHIEVEMENTS, max_tokens=2048)
        ach_json_str = _extract_json(response)
        ach_result = _parse_json_with_retry(ach_json_str)
        if ach_result and "achievements" in ach_result:
            achievements = ach_result["achievements"]
    except Exception as e:
        logger.warning(f"Achievement extraction failed (non-fatal): {e}")

    # --- Heuristic fallback: auto-link by type if still zero relations ---
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
                if not isinstance(e1, dict):
                    continue
                for e2 in entities[i + 1:]:
                    if not isinstance(e2, dict):
                        continue
                    relations.append({"source_id": e1["id"], "target_id": e2["id"], "type": "related_to", "confidence": 0.3})
        logger.info(f"Heuristic generated {len(relations)} relations")

    # Normalize entity IDs from e1/e2 format to deterministic UUIDs
    id_map = _normalize_entity_ids(entities)

    # Remap relation source/target IDs using the e1->UUID mapping
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
    relations = filtered
    logger.info(f"Final result: {len(entities)} entities, {len(relations)} relations, {len(achievements)} achievements")

    return {
        "entities": entities,
        "relations": relations,
        "achievements": achievements,
    }


async def extract_entities(text: str, strategy: str = "default") -> dict:
    fn = extractor_registry.get(strategy)
    return await fn(text)
