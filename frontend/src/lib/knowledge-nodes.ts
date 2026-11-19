import type { Viewer } from "./auth-types";
import { getKnowledgeGraph } from "./knowledge-store";
import type { KnowledgeGraphNode } from "./knowledge-types";

export function getKnowledgeNodesByIds(viewer: Viewer | null, ids: readonly string[]): KnowledgeGraphNode[] {
  const wanted = new Set(ids.slice(0, 4));
  if (!wanted.size) return [];
  return getKnowledgeGraph(viewer, "all").nodes.filter((node) => wanted.has(node.id));
}

/** 搜索当前账号可在“预置语料 / 我的图谱”中直接定位的已发布节点。 */
export function searchKnowledgeNodes(viewer: Viewer | null, query = "", limit = 8, id = ""): KnowledgeGraphNode[] {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit) || 8));
  const normalized = query.trim().toLocaleLowerCase();
  return getKnowledgeGraph(viewer, "all").nodes
    .filter((node) => node.sourceScope === "corpus" || node.sourceScope === "mine")
    .filter((node) => !id || node.id === id)
    .filter((node) => !normalized || `${node.name} ${node.type} ${node.summary}`.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => {
      const aStarts = a.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1;
      const bStarts = b.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, "zh-CN");
    })
    .slice(0, safeLimit);
}
