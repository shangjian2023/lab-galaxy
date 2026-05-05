"""AI-powered growth analysis service."""

import json
import logging

from app.services.llm import call_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一个专业的科研团队成长分析助手。根据团队的实验数据、成果和成员信息，给出全面的成长分析报告。

## 输出格式
严格输出以下 JSON，不要任何额外文本：

{
  "summary": "整体成长总结（2-3句话）",
  "strengths": ["优势1", "优势2", "优势3"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": ["建议1", "建议2", "建议3"],
  "score": 75
}

## 评分标准（score 0-100）
- 60以下：成长初期，需要更多积累
- 60-75：稳步成长，有一定基础
- 75-85：良好发展，成果突出
- 85-95：优秀团队，综合实力强
- 95+：卓越团队，行业标杆

## 分析维度
1. 实验多样性：涉及的实验类型是否丰富
2. 设备掌握度：使用的设备种类和深度
3. 理论基础：涉及的理论知识广度
4. 成果产出：论文、专利、获奖等
5. 团队协作：成员之间的分工与合作

只输出 JSON，不要有任何其他文字。"""


async def analyze_team_growth(data: dict) -> dict:
    """Analyze team growth data using LLM."""
    team_name = data.get("team_name", "未知团队")
    total_docs = data.get("total_documents", 0)
    total_achs = data.get("total_achievements", 0)
    entity_summary = data.get("entity_summary", {})
    achievements = data.get("achievements", [])
    members = data.get("members", [])

    # Build analysis prompt
    entity_lines = []
    for etype, names in entity_summary.items():
        unique_names = list(set(names))[:10]
        entity_lines.append(f"- {etype}: {', '.join(unique_names)}（共 {len(names)} 个）")

    ach_lines = []
    for ach in achievements[:10]:
        ach_lines.append(f"- [{ach.get('type', '其他')}] {ach.get('name', '')} - {ach.get('description', '')}（{ach.get('member', '')}）")

    member_lines = []
    for m in members:
        member_lines.append(f"- {m.get('nickname', '未知')} (Lv.{m.get('level', 1)}, {m.get('document_count', 0)} 份文档)")

    prompt = f"""请分析以下科研团队的成长数据：

## 团队信息
- 团队名称：{team_name}
- 成员数量：{len(members)} 人
- 文档总数：{total_docs} 份
- 成果总数：{total_achs} 个

## 成员详情
{chr(10).join(member_lines) if member_lines else "暂无成员数据"}

## 知识图谱实体分布
{chr(10).join(entity_lines) if entity_lines else "暂无实体数据"}

## 团队成果
{chr(10).join(ach_lines) if ach_lines else "暂无成果数据"}

请给出全面的成长分析报告。"""

    try:
        response = await call_llm(prompt, system=SYSTEM_PROMPT, max_tokens=1024)

        # Parse JSON from response
        import re
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        json_str = json_match.group(1) if json_match else response
        json_str = json_str.strip()

        # Find JSON object
        start = json_str.find("{")
        if start != -1:
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
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        json_str = json_str[start:i + 1]
                        break

        result = json.loads(json_str)

        # Validate shape
        return {
            "summary": result.get("summary", "暂无分析"),
            "strengths": result.get("strengths", []) if isinstance(result.get("strengths"), list) else [],
            "weaknesses": result.get("weaknesses", []) if isinstance(result.get("weaknesses"), list) else [],
            "suggestions": result.get("suggestions", []) if isinstance(result.get("suggestions"), list) else [],
            "score": min(100, max(0, int(result.get("score", 50)))),
        }

    except Exception as e:
        logger.error(f"Growth analysis failed: {e}")
        return {
            "summary": "分析暂时不可用，请稍后重试",
            "strengths": [],
            "weaknesses": [],
            "suggestions": [],
            "score": 50,
        }
