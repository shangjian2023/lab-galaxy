#!/usr/bin/env python3
"""On-demand structured knowledge extraction utilities shared by ingestion tooling."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

GROUPS = frozenset({"experiment", "resource", "knowledge"})
MAX_ENTITIES = 60
MAX_RELATIONS = 100


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    page_start: int | None
    page_end: int | None
    text: str


class ExtractionError(ValueError):
    def __init__(self, issues: Sequence[str]) -> None:
        self.issues = list(issues)
        super().__init__("；".join(self.issues[:5]))


def extraction_schema() -> str:
    return json.dumps(
        {
            "entities": [{
                "name": "string 1-120", "type": "string 1-80",
                "group": "experiment|resource|knowledge", "summary": "string 1-600 grounded in text",
                "confidence": "number [0,1]", "evidenceChunkId": "one input chunkId",
            }],
            "relations": [{
                "sourceName": "output entity name", "targetName": "output entity name",
                "relation": "string 1-100", "confidence": "number [0,1]",
                "evidenceChunkId": "one input chunkId",
            }],
        },
        ensure_ascii=False,
    )


def build_messages(chunks: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    corpus = [
        {
            "chunkId": str(chunk["chunkId"]),
            "page": chunk.get("pageStart"),
            "text": str(chunk["text"]),
        }
        for chunk in chunks
    ]
    return [
        {
            "role": "system",
            "content": (
                "You extract a knowledge graph only from supplied chunks. "
                "Return exactly one JSON object with this schema and no extra text: "
                + extraction_schema()
            ),
        },
        {"role": "user", "content": json.dumps({"chunks": corpus}, ensure_ascii=False)},
    ]


def _text(value: Any, field: str, maximum: int, issues: list[str]) -> str:
    if not isinstance(value, str):
        issues.append(f"{field} must be a string")
        return ""
    text = re.sub(r"\s+", " ", value.strip())
    if not text:
        issues.append(f"{field} must not be empty")
    if len(text) > maximum:
        issues.append(f"{field} exceeds {maximum} characters")
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", text):
        issues.append(f"{field} contains control characters")
    return text


def _confidence(value: Any, field: str, issues: list[str]) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= float(value) <= 1:
        issues.append(f"{field} must be between 0 and 1")
        return float("nan")
    return float(value)


def _exact_keys(value: Mapping[str, Any], allowed: set[str], path: str, issues: list[str]) -> None:
    unknown = set(value) - allowed
    missing = allowed - set(value)
    if unknown:
        issues.append(f"{path} has unknown fields: {','.join(sorted(unknown))}")
    if missing:
        issues.append(f"{path} is missing fields: {','.join(sorted(missing))}")


def _normalized(value: str) -> str:
    return value.casefold()


def parse_output(content: str) -> Any:
    try:
        return json.loads(content)
    except (TypeError, json.JSONDecodeError) as error:
        raise ExtractionError(["model output is not valid JSON"]) from error


def validate_output(payload: Any, chunks: Sequence[Chunk]) -> dict[str, list[dict[str, Any]]]:
    issues: list[str] = []
    if not isinstance(payload, dict):
        raise ExtractionError(["output must be an object"])
    _exact_keys(payload, {"entities", "relations"}, "output", issues)
    if not isinstance(payload.get("entities"), list) or not isinstance(payload.get("relations"), list):
        raise ExtractionError(["entities and relations must be arrays"] + issues)
    if len(payload["entities"]) > MAX_ENTITIES:
        issues.append(f"more than {MAX_ENTITIES} entities")
    if len(payload["relations"]) > MAX_RELATIONS:
        issues.append(f"more than {MAX_RELATIONS} relations")

    chunk_ids = {chunk.chunk_id for chunk in chunks}
    entities: list[dict[str, Any]] = []
    entity_names: dict[str, str] = {}
    entity_allowed = {"name", "type", "group", "summary", "confidence", "evidenceChunkId"}
    for index, raw in enumerate(payload["entities"]):
        path = f"entities[{index}]"
        if not isinstance(raw, dict):
            issues.append(f"{path} must be an object")
            continue
        _exact_keys(raw, entity_allowed, path, issues)
        name = _text(raw.get("name"), f"{path}.name", 120, issues)
        normalized = _normalized(name)
        if not name or normalized in entity_names:
            if normalized in entity_names:
                issues.append(f"{path}.name duplicates another entity")
            continue
        group = raw.get("group")
        if group not in GROUPS:
            issues.append(f"{path}.group is invalid")
        confidence = _confidence(raw.get("confidence"), f"{path}.confidence", issues)
        evidence = raw.get("evidenceChunkId")
        if evidence not in chunk_ids:
            issues.append(f"{path}.evidenceChunkId is not in input")
        if None in (group, evidence) or confidence != confidence:
            continue
        entity_names[normalized] = name
        entities.append({
            "name": name,
            "normalizedName": normalized,
            "type": _text(raw.get("type"), f"{path}.type", 80, issues),
            "group": group,
            "summary": _text(raw.get("summary"), f"{path}.summary", 600, issues),
            "confidence": confidence,
            "evidenceChunkId": evidence,
        })

    relations: list[dict[str, Any]] = []
    relation_allowed = {"sourceName", "targetName", "relation", "confidence", "evidenceChunkId"}
    relation_keys: set[tuple[str, str, str]] = set()
    for index, raw in enumerate(payload["relations"]):
        path = f"relations[{index}]"
        if not isinstance(raw, dict):
            issues.append(f"{path} must be an object")
            continue
        _exact_keys(raw, relation_allowed, path, issues)
        source = _text(raw.get("sourceName"), f"{path}.sourceName", 120, issues)
        target = _text(raw.get("targetName"), f"{path}.targetName", 120, issues)
        relation = _text(raw.get("relation"), f"{path}.relation", 100, issues)
        confidence = _confidence(raw.get("confidence"), f"{path}.confidence", issues)
        source_normalized, target_normalized = _normalized(source), _normalized(target)
        if source_normalized not in entity_names or target_normalized not in entity_names:
            issues.append(f"{path} references an entity absent from output")
            continue
        if source_normalized == target_normalized:
            issues.append(f"{path} connects an entity to itself")
            continue
        evidence = raw.get("evidenceChunkId")
        if evidence not in chunk_ids:
            issues.append(f"{path}.evidenceChunkId is not in input")
            continue
        key = (source_normalized, target_normalized, _normalized(relation))
        if key in relation_keys:
            issues.append(f"{path} duplicates another relation")
            continue
        relation_keys.add(key)
        relations.append({
            "sourceName": entity_names[source_normalized],
            "targetName": entity_names[target_normalized],
            "relation": relation,
            "confidence": confidence,
            "evidenceChunkId": evidence,
        })

    if issues:
        raise ExtractionError(issues)
    return {"entities": entities, "relations": relations}


def validate_content(content: str, chunks: Sequence[Chunk]) -> dict[str, list[dict[str, Any]]]:
    return validate_output(parse_output(content), chunks)


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chunks", required=True, help="JSON file containing chunkId/pageStart/pageEnd/text objects")
    parser.add_argument("--messages", action="store_true", help="print model messages instead of validating output")
    parser.add_argument("--output", help="model JSON output to validate; omit with --messages")
    args = parser.parse_args(list(argv) if argv is not None else None)
    raw_chunks = json.loads(Path(args.chunks).read_text(encoding="utf-8"))
    chunks = [
        Chunk(str(item["chunkId"]), item.get("pageStart"), item.get("pageEnd"), str(item["text"]))
        for item in raw_chunks
    ]
    if args.messages:
        print(json.dumps(build_messages(raw_chunks), ensure_ascii=False, indent=2))
    elif args.output:
        print(json.dumps(validate_content(Path(args.output).read_text(encoding="utf-8"), chunks), ensure_ascii=False, indent=2))
    else:
        parser.error("use --messages or --output")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
