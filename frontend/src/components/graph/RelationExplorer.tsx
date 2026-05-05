"use client";

import { useState } from "react";
import { searchGraphNodes, getTreeData } from "@/lib/api";
import type { GraphNode, TreeData } from "@/lib/api";
import TreeGrowthView from "./TreeGrowthView";

const NODE_TYPES = ["Experiment", "Equipment", "Theory", "Consumable", "Tool"];

interface Props {
  onClose: () => void;
}

export default function RelationExplorer({ onClose }: Props) {
  const [step, setStep] = useState<"select" | "explore">("select");
  const [searchType, setSearchType] = useState("Equipment");
  const [targetType, setTargetType] = useState("Theory");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchGraphNodes(query, searchType);
      setResults(res.nodes);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleExplore = async (node: GraphNode) => {
    setSelectedNode(node);
    setLoadingTree(true);
    try {
      const data = await getTreeData(node.id, targetType);
      setTreeData(data);
      setStep("explore");
    } catch {
      // ignore
    } finally {
      setLoadingTree(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative mx-4 max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-800">
            {step === "select" ? "关系探索器" : "关系探索树"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === "select" ? (
          <div className="p-6">
            {/* Step 1: Choose source type and search */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">选择源节点类型</label>
              <div className="flex flex-wrap gap-2">
                {NODE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setSearchType(t); setResults([]); setQuery(""); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      searchType === t
                        ? "bg-orange-100 text-orange-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Search box */}
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={`搜索 ${searchType} 节点...`}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {searching ? "搜索中..." : "搜索"}
              </button>
            </div>

            {/* Search results */}
            {results.length > 0 && (
              <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-gray-100">
                {results.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center justify-between border-b border-gray-50 px-4 py-2 last:border-0 hover:bg-orange-50/50"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">{node.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{node.type}</span>
                      {node.summary && (
                        <p className="text-xs text-gray-500 line-clamp-1">{node.summary}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleExplore(node)}
                      disabled={loadingTree}
                      className="rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
                    >
                      {loadingTree && selectedNode?.id === node.id ? "加载中..." : "探索"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Step 2: Choose target type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">探索关联的目标类型</label>
              <div className="flex flex-wrap gap-2">
                {NODE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTargetType(t)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      targetType === t
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  onClick={() => setTargetType("")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    !targetType
                      ? "bg-purple-100 text-purple-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  全部
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden" style={{ height: "calc(85vh - 73px)" }}>
            {/* Back button */}
            <div className="border-b border-gray-100 px-6 py-2">
              <button
                onClick={() => setStep("select")}
                className="text-sm text-orange-600 hover:text-orange-700"
              >
                ← 返回选择
              </button>
              {selectedNode && (
                <span className="ml-3 text-sm text-gray-500">
                  根节点: <strong>{selectedNode.name}</strong> ({selectedNode.type})
                </span>
              )}
            </div>

            {/* Tree view */}
            <div className="flex-1 overflow-auto">
              {treeData ? (
                <TreeGrowthView data={treeData} />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  加载中...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
