"""Entity & relationship extraction via LLM."""

import json
import logging
import re
import uuid

from app.services.llm import call_llm
from app.registries.extractors import extractor_registry

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一个专业的实验文档分析助手。你的任务是从实验文档中抽取实体和关系。

实体类型:
- Experiment: 实验名称或实验方案
- Equipment: 实验设备/仪器
- Theory: 涉及的理论/原理/公式
- Consumable: 实验耗材/试剂
- Tool: 工具/软件/平台

输出严格的 JSON 格式:
{
  "entities": [
    {"id": "唯一标识", "type": "实体类型", "name": "实体名称", "summary": "简短描述"}
  ],
  "relations": [
    {"source_id": "实体id", "target_id": "实体id", "type": "关系类型", "confidence": 0.0-1.0}
  ]
}

关系类型:
- uses: Experiment → Equipment / Tool / Consumable
- based_on: Experiment → Theory
- similar_to: Experiment ↔ Experiment（相似实验）
- requires: Equipment → Consumable（设备需要耗材）

注意:
- 每个实体必须有唯一的 id（使用 uuid 格式）
- confidence 是 0 到 1 之间的浮点数
- 只输出 JSON，不要有其他文本"""


@extractor_registry.register("default")
async def extract_entities_llm(text: str) -> dict:
    max_chars = 12000
    truncated = text[:max_chars]
    if len(text) > max_chars:
        truncated += "\n...（文档过长，已截断）"

    prompt = f"请分析以下实验文档内容，抽取实体和关系：\n\n{truncated}"

    response = await call_llm(prompt, system=SYSTEM_PROMPT, max_tokens=4096)

    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
    json_str = json_match.group(1) if json_match else response

    # Strip markdown/code fences
    json_str = json_str.strip()
    if json_str.startswith("```"):
        json_str = re.sub(r"^```\w*\n?", "", json_str)
        json_str = re.sub(r"\n?```$", "", json_str)

    # Extract the outermost JSON object
    brace_match = re.search(r"\{[\s\S]*\}", json_str)
    if brace_match:
        json_str = brace_match.group()

    # Try parsing with increasingly aggressive fixes
    result = None
    for attempt in range(3):
        try:
            result = json.loads(json_str)
            break
        except json.JSONDecodeError:
            if attempt == 0:
                # Fix trailing commas before } or ]
                json_str = re.sub(r",\s*([}\]])", r"\1", json_str)
                # Fix missing commas between key-value pairs
                json_str = re.sub(r'"\s*\n\s*"', '",\n"', json_str)
            elif attempt == 1:
                # Try extracting just entities array
                ent_match = re.search(r'"entities"\s*:\s*\[([\s\S]*?)\]', json_str)
                if ent_match:
                    try:
                        entities = json.loads("[" + ent_match.group(1) + "]")
                        result = {"entities": entities, "relations": []}
                        break
                    except json.JSONDecodeError:
                        pass

    if result is None:
        logger.warning(f"Failed to parse LLM JSON output, returning empty result")
        result = {"entities": [], "relations": []}

    for entity in result.get("entities", []):
        if not entity.get("id"):
            entity["id"] = str(uuid.uuid4())

    return result


async def extract_entities(text: str, strategy: str = "default") -> dict:
    fn = extractor_registry.get(strategy)
    return await fn(text)
