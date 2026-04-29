"""Insight discovery — detect hidden connections across experiments."""

import logging

from app.core.connections import get_neo4j_driver

logger = logging.getLogger(__name__)


async def discover_insights() -> dict:
    """
    Scan the knowledge graph for hidden connections.
    Returns insights sorted by significance, filtered >= 0.3.
    """
    driver = get_neo4j_driver()
    insights: list[dict] = []

    async with driver.session() as session:
        # 1. Shared equipment across experiments
        equip_query = """
        MATCH (e1:Experiment)-[:USES]->(eq:Equipment)<-[:USES]-(e2:Experiment)
        WHERE e1.id < e2.id
        RETURN eq.name AS shared_name, eq.id AS shared_id, eq.summary AS summary,
               collect(DISTINCT {id: e1.id, name: e1.name}) +
               collect(DISTINCT {id: e2.id, name: e2.name}) AS experiments
        """
        records = await session.run(equip_query)
        async for r in records:
            experiments = r["experiments"]
            if len(experiments) >= 2:
                insights.append({
                    "type": "shared_equipment",
                    "significance": min(len(experiments) / 5, 1.0),
                    "title": f"发现共享设备: {r['shared_name']}",
                    "description": f"该设备在 {len(experiments)} 个实验中被使用",
                    "message": f"「{r['shared_name']}」连接了 {len(experiments)} 个实验，可能存在复用路径",
                    "nodes": [e["id"] for e in experiments] + [r["shared_id"]],
                    "experiments": experiments,
                    "shared_entity": {"id": r["shared_id"], "name": r["shared_name"], "summary": r["summary"]},
                })

        # 2. Shared consumables
        consumable_query = """
        MATCH (e1:Experiment)-[:USES]->(c:Consumable)<-[:USES]-(e2:Experiment)
        WHERE e1.id < e2.id
        RETURN c.name AS shared_name, c.id AS shared_id, c.summary AS summary,
               collect(DISTINCT {id: e1.id, name: e1.name}) +
               collect(DISTINCT {id: e2.id, name: e2.name}) AS experiments
        """
        records = await session.run(consumable_query)
        async for r in records:
            experiments = r["experiments"]
            if len(experiments) >= 2:
                insights.append({
                    "type": "shared_consumable",
                    "significance": min(len(experiments) / 5, 1.0),
                    "title": f"发现共享耗材: {r['shared_name']}",
                    "description": f"该耗材在 {len(experiments)} 个实验中使用",
                    "message": f"「{r['shared_name']}」在多个实验路径中出现",
                    "nodes": [e["id"] for e in experiments] + [r["shared_id"]],
                    "experiments": experiments,
                    "shared_entity": {"id": r["shared_id"], "name": r["shared_name"], "summary": r["summary"]},
                })

        # 3. Shared theory / knowledge chain
        theory_query = """
        MATCH (e1:Experiment)-[:BASED_ON]->(t:Theory)<-[:BASED_ON]-(e2:Experiment)
        WHERE e1.id < e2.id
        RETURN t.name AS shared_name, t.id AS shared_id, t.summary AS summary,
               collect(DISTINCT {id: e1.id, name: e1.name}) +
               collect(DISTINCT {id: e2.id, name: e2.name}) AS experiments
        """
        records = await session.run(theory_query)
        async for r in records:
            experiments = r["experiments"]
            if len(experiments) >= 2:
                insights.append({
                    "type": "shared_theory",
                    "significance": min(len(experiments) / 4, 1.0),
                    "title": f"发现共享理论: {r['shared_name']}",
                    "description": f"{len(experiments)} 个实验基于同一理论",
                    "message": f"「{r['shared_name']}」构成了 {len(experiments)} 个实验的知识积累链",
                    "nodes": [e["id"] for e in experiments] + [r["shared_id"]],
                    "experiments": experiments,
                    "shared_entity": {"id": r["shared_id"], "name": r["shared_name"], "summary": r["summary"]},
                })

        # 4. Similar experiment paths (via SIMILAR_TO)
        similar_query = """
        MATCH (e1:Experiment)-[r:SIMILAR_TO]->(e2:Experiment)
        WHERE r.confidence >= 0.6
        RETURN e1.id AS id1, e1.name AS name1, e2.id AS id2, e2.name AS name2,
               r.confidence AS confidence
        ORDER BY r.confidence DESC
        LIMIT 10
        """
        records = await session.run(similar_query)
        async for r in records:
            insights.append({
                "type": "similar_path",
                "significance": r["confidence"],
                "title": "检测到可复用实验路径",
                "description": f"「{r['name1']}」与「{r['name2']}」高度相似",
                "message": f"该方案与相似实验共享核心方法 (置信度 {(r['confidence'] * 100):.0f}%)",
                "nodes": [r["id1"], r["id2"]],
                "experiments": [
                    {"id": r["id1"], "name": r["name1"]},
                    {"id": r["id2"], "name": r["name2"]},
                ],
                "confidence": r["confidence"],
            })

        # 5. Hub nodes — entities connected to many experiments
        hub_query = """
        MATCH (entity)<-[:USES|BASED_ON]-(e:Experiment)
        WITH entity, collect(DISTINCT {id: e.id, name: e.name}) AS experiments
        WHERE size(experiments) >= 3
        RETURN entity.name AS name, entity.id AS id, labels(entity) AS labels,
               size(experiments) AS count, experiments
        ORDER BY count DESC
        LIMIT 5
        """
        records = await session.run(hub_query)
        async for r in records:
            lbls = [l for l in r["labels"] if l in {"Experiment", "Equipment", "Theory", "Consumable", "Tool", "Concept"}]
            entity_type = lbls[0] if lbls else "Concept"
            insights.append({
                "type": "knowledge_chain",
                "significance": min(r["count"] / 6, 1.0),
                "title": f"发现知识积累链",
                "description": f"「{r['name']}」串联了 {r['count']} 个实验",
                "message": f"成员的研究路径围绕「{r['name']}」形成了 {r['count']} 节点知识链",
                "nodes": [e["id"] for e in r["experiments"]] + [r["id"]],
                "experiments": r["experiments"],
                "shared_entity": {"id": r["id"], "name": r["name"], "type": entity_type},
            })

    # Assign stable IDs to each insight
    for i, ins in enumerate(insights):
        nodes_key = "-".join(sorted(ins.get("nodes", [])))
        ins["id"] = f"{ins['type']}_{nodes_key}"

    insights.sort(key=lambda x: x["significance"], reverse=True)
    high_value = [i for i in insights if i["significance"] >= 0.3]
    logger.info(f"Discovered {len(high_value)} insights (from {len(insights)} total)")
    return {"insights": high_value, "total": len(high_value)}
