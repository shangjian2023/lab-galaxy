"""Natural language query engine — RAG pipeline combining vector search, graph traversal, and LLM synthesis."""

import json
import logging
import re

from app.services.llm import call_llm, call_llm_stream
from app.services.vector import search as vector_search
from app.services.graph import expand_neighborhood

logger = logging.getLogger(__name__)

RAG_SYSTEM_PROMPT = """你是一个实验知识图谱的智能助手。用户会用自然语言提问，你需要基于提供的知识图谱上下文来回答问题。

这是一个多轮对话，你可以结合之前的对话历史来理解上下文。例如：
- 如果用户问"上次提到的那个实验呢"，你需要回顾历史中的实验名称
- 如果用户问"它用了什么设备"，你需要理解"它"指的是之前讨论的实体
- 回答时可以自然引用之前讨论过的内容

你必须严格按照以下 JSON 格式输出：
{
  "answer": "文字回答，详细且有条理",
  "highlighted_nodes": ["相关的实体ID列表"],
  "source_documents": [
    {"id": "文档ID", "title": "文档或实验名称", "relevance": 0.9}
  ],
  "suggestions": ["建议用户下一步可以探索的方向1", "方向2"],
  "related_queries": ["相关的搜索建议1", "搜索建议2"]
}

注意：
- answer 应该详细、有条理，引用具体的实验、设备或理论名称
- highlighted_nodes 只包含上下文中确实提到的实体 ID
- 如果没有找到相关内容，answer 中诚实说明，但给出探索建议
- 只输出 JSON，不要有其他文本"""

SUGGEST_SYSTEM_PROMPT = """你是一个知识图谱分析助手。根据给定节点的现有关系和图谱上下文，推测可能存在但尚未建立的关联关系。

输出严格的 JSON 格式：
{
  "suggestions": [
    {
      "source_id": "源节点ID",
      "target_id": "目标节点ID",
      "target_name": "目标节点名称（如果是新节点）",
      "type": "USES|BASED_ON|SIMILAR_TO|REQUIRES|RELATED_TO",
      "confidence": 0.7,
      "reason": "为什么认为这个关系可能存在"
    }
  ]
}

只输出 JSON，不要有其他文本。"""


RAG_ANSWER_PROMPT = """你是一个实验知识图谱的智能助手。用户会用自然语言提问，请基于提供的知识图谱上下文，直接用自然语言回答。

要求：
- 回答详细、有条理，引用具体的实验、设备或理论名称
- 这是多轮对话，可结合历史理解上下文（如"它""上次提到的"）
- 如果上下文不足以回答，诚实说明并给出探索建议
- 直接输出回答正文，不要输出 JSON、不要加代码块标记、不要前言"""


async def natural_language_query(question: str, history: list[dict] | None = None) -> dict:
    """RAG pipeline: vector search → graph expansion → multi-turn LLM synthesis."""
    logger.info(f"QUERY DEBUG: question={question[:80]}, history_len={len(history) if history else 0}, history={history}")

    # Step 1: Vector search
    vector_results = await vector_search(question, top_k=10)
    if not vector_results:
        return _empty_response(question)

    # Step 2: Graph expansion
    entity_ids = [eid for eid, score in vector_results]
    graph_context = await expand_neighborhood(entity_ids, max_hops=2, limit=50)

    # Step 3: Build RAG context for current turn
    context = _build_context(vector_results, graph_context)

    # Step 4: Build structured messages for multi-turn conversation
    current_message = f"用户问题：{question}\n\n知识图谱上下文：\n{context}"
    messages = _build_messages(history, current_message)
    logger.info(f"QUERY DEBUG: messages count={len(messages)}, roles={[m['role'] for m in messages]}")

    # Step 5: LLM synthesis with structured multi-turn messages
    # Qwen3.6 uses CoT reasoning, needs more tokens for reasoning + content
    response = await call_llm(
        prompt=current_message,
        system=RAG_SYSTEM_PROMPT,
        max_tokens=8192,
        messages=messages,
    )

    # Step 6: Parse response
    return _parse_response(response, vector_results, graph_context)


async def natural_language_query_stream(question: str, history: list[dict] | None = None):
    """Streaming RAG: yields SSE-style event dicts.

    Event types:
      {"type": "meta",  "highlighted_nodes": [...], "source_documents": [...], "entities": [...]}
      {"type": "delta", "text": "...answer token..."}
      {"type": "done"}
      {"type": "error", "message": "..."}

    Meta (which nodes to highlight + source docs) comes from retrieval, NOT from
    the LLM, so it is reliable and available before the answer starts streaming.
    The answer text is streamed token-by-token from the LLM for responsiveness.
    """
    logger.info(f"QUERY STREAM: question={question[:80]}, history_len={len(history) if history else 0}")

    try:
        # Step 1: Vector search
        vector_results = await vector_search(question, top_k=10)
        if not vector_results:
            yield {"type": "meta", "highlighted_nodes": [], "source_documents": [], "entities": []}
            yield {"type": "delta", "text": f"未找到与「{question}」相关的知识图谱数据。请先上传实验文档，系统将自动构建图谱。"}
            yield {"type": "done"}
            return

        # Step 2: Graph expansion
        entity_ids = [eid for eid, score in vector_results]
        graph_context = await expand_neighborhood(entity_ids, max_hops=2, limit=50)

        # Step 3: Build meta from retrieval (highlight top vector matches + their docs)
        highlighted = [eid for eid, _ in vector_results[:5]]
        all_nodes = {n["id"]: n for n in graph_context["nodes"]}
        entities = [all_nodes[eid] for eid in highlighted if eid in all_nodes]
        source_docs = []
        seen_docs = set()
        for n in graph_context["nodes"]:
            did = n.get("document_id")
            if did and did not in seen_docs:
                seen_docs.add(did)
                source_docs.append({"id": did, "title": n["name"], "relevance": 0.8})

        yield {
            "type": "meta",
            "highlighted_nodes": highlighted,
            "source_documents": source_docs,
            "entities": entities,
        }

        # Step 4: Stream the answer text
        context = _build_context(vector_results, graph_context)
        current_message = f"用户问题：{question}\n\n知识图谱上下文：\n{context}"
        messages = _build_messages(history, current_message)

        async for delta in call_llm_stream(
            prompt=current_message,
            system=RAG_ANSWER_PROMPT,
            max_tokens=4096,
            messages=messages,
        ):
            yield {"type": "delta", "text": delta}

        yield {"type": "done"}
    except Exception as e:
        logger.error(f"Query stream error: {e}", exc_info=True)
        yield {"type": "error", "message": str(e)[:200]}


async def suggest_relations(node_id: str) -> dict:
    """AI-suggested relationships for a given node."""
    # Get node's current neighborhood
    graph_context = await expand_neighborhood([node_id], max_hops=1, limit=30)

    if not graph_context["nodes"]:
        return {"suggestions": []}

    # Build context about existing relationships
    node = next((n for n in graph_context["nodes"] if n["id"] == node_id), None)
    if not node:
        return {"suggestions": []}

    existing_rels = [
        f"- {r['type']}: {r['source_id']} → {r['target_id']} (confidence: {r['confidence']})"
        for r in graph_context["relations"]
    ]
    neighbor_names = [
        f"  [{n['type']}] {n['name']} (ID: {n['id']}): {n['summary'][:80]}"
        for n in graph_context["nodes"] if n["id"] != node_id
    ]

    prompt = f"""分析节点 [{node['type']}] {node['name']} (ID: {node_id})
摘要: {node.get('summary', '无')}

当前邻居节点:
{chr(10).join(neighbor_names)}

现有关系:
{chr(10).join(existing_rels) if existing_rels else '无'}

请推测这个节点可能还与其他哪些节点存在关系，或者需要创建哪些新节点。"""

    response = await call_llm(prompt, system=SUGGEST_SYSTEM_PROMPT, max_tokens=1024)
    return _parse_suggestions(response)


def _build_messages(history: list[dict] | None, current_message: str) -> list[dict]:
    """Build structured message array for multi-turn LLM conversation.

    Returns a list of {"role": "user"|"assistant", "content": "..."} dicts
    suitable for both Anthropic and OpenAI providers.
    """
    messages: list[dict] = []

    if history:
        # Keep last 10 turns and ensure valid role alternation
        prev_role = None
        for msg in history[-10:]:
            # Handle both Pydantic models (attribute access) and plain dicts
            role = getattr(msg, "role", None) or (msg.get("role", "") if isinstance(msg, dict) else "")
            content = getattr(msg, "content", None) or (msg.get("content", "") if isinstance(msg, dict) else "")
            if role not in ("user", "assistant") or not content:
                continue
            # Anthropic requires alternating roles — merge consecutive same-role messages
            if role == prev_role and messages:
                messages[-1]["content"] += "\n" + content
            else:
                messages.append({"role": role, "content": content})
            prev_role = role

        # Ensure first message is from user (Anthropic requirement)
        if messages and messages[0]["role"] != "user":
            messages.insert(0, {"role": "user", "content": "（对话开始）"})

    # Append current user message with RAG context
    messages.append({"role": "user", "content": current_message})

    return messages


def _build_context(vector_results: list, graph_context: dict) -> str:
    parts = []

    # Vector-matched entities
    parts.append("=== 向量检索匹配的实体 ===")
    for eid, score in vector_results:
        node = next((n for n in graph_context["nodes"] if n["id"] == eid), None)
        if node:
            parts.append(f"[{node['type']}] {node['name']} (ID: {eid}, 相关度: {score:.3f})")
            if node.get("summary"):
                parts.append(f"  摘要: {node['summary']}")
            if node.get("document_id"):
                parts.append(f"  文档ID: {node['document_id']}")
        else:
            parts.append(f"[未知] ID: {eid} (相关度: {score:.3f})")

    # Graph relationships
    if graph_context["relations"]:
        parts.append("\n=== 图谱关系 ===")
        for rel in graph_context["relations"][:30]:
            src = next((n for n in graph_context["nodes"] if n["id"] == rel["source_id"]), None)
            tgt = next((n for n in graph_context["nodes"] if n["id"] == rel["target_id"]), None)
            src_name = src["name"] if src else rel["source_id"][:8]
            tgt_name = tgt["name"] if tgt else rel["target_id"][:8]
            parts.append(f"{src_name} --[{rel['type']}]--> {tgt_name} (置信度: {rel['confidence']})")

    # All discovered nodes
    other_nodes = [
        n for n in graph_context["nodes"]
        if n["id"] not in {eid for eid, _ in vector_results}
    ]
    if other_nodes:
        parts.append("\n=== 图谱扩展发现的实体 ===")
        for n in other_nodes[:20]:
            parts.append(f"[{n['type']}] {n['name']} (ID: {n['id']}): {n.get('summary', '无')[:60]}")

    return "\n".join(parts)


def _parse_response(response: str, vector_results: list, graph_context: dict) -> dict:
    """Parse LLM JSON response, with fallback handling."""
    try:
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        json_str = json_match.group(1) if json_match else response
        result = json.loads(json_str.strip())
    except (json.JSONDecodeError, AttributeError):
        brace_match = re.search(r"\{[\s\S]*\}", response)
        if brace_match:
            try:
                result = json.loads(brace_match.group())
            except json.JSONDecodeError:
                result = {}
        else:
            result = {}

    answer = result.get("answer")
    logger.info(f"PARSE DEBUG: llm_raw_response_len={len(response)}, parsed_keys={list(result.keys())}, answer_empty={not answer}, answer_preview={repr((answer or '')[:80])}")
    if not answer:
        # Fallback: use raw response if answer is missing/empty
        answer = response[:500]

    # Build fallback if LLM didn't provide highlighted_nodes
    highlighted = result.get("highlighted_nodes", [eid for eid, _ in vector_results[:5]])
    all_nodes = {n["id"]: n for n in graph_context["nodes"]}

    # Build source documents from highlighted nodes that have document_id
    source_docs = result.get("source_documents", [])
    if not source_docs:
        seen = set()
        for n in graph_context["nodes"]:
            did = n.get("document_id")
            if did and did not in seen:
                seen.add(did)
                source_docs.append({"id": did, "title": n["name"], "relevance": 0.8})

    # Collect entity details for highlighted nodes
    entities = []
    for eid in highlighted:
        if eid in all_nodes:
            entities.append(all_nodes[eid])

    return {
        "answer": result.get("answer") or response[:500],
        "highlighted_nodes": highlighted,
        "source_documents": source_docs,
        "suggestions": result.get("suggestions", []),
        "related_queries": result.get("related_queries", []),
        "entities": entities,
    }


def _parse_suggestions(response: str) -> dict:
    """Parse AI suggestion response."""
    try:
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        json_str = json_match.group(1) if json_match else response
        result = json.loads(json_str.strip())
    except (json.JSONDecodeError, AttributeError):
        return {"suggestions": []}
    return {"suggestions": result.get("suggestions", [])}


def _empty_response(question: str) -> dict:
    return {
        "answer": f"未找到与「{question}」相关的知识图谱数据。请先上传实验文档，系统将自动构建图谱。",
        "highlighted_nodes": [],
        "source_documents": [],
        "suggestions": ["尝试上传更多实验文档", "使用更具体的关键词搜索"],
        "related_queries": [],
        "entities": [],
    }
