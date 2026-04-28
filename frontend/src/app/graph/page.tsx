"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  getGraphData,
  getGraphYears,
  getTimelineData,
  getMatrixData,
  discoverInsights,
  createGraphRelation,
  type CytoscapeData,
  type TimelineEntry,
  type MatrixEntry,
  type InsightEvent,
} from "@/lib/api";
import { soundEngine } from "@/lib/audio/SoundEngine";
import GalaxyView, { type ForceSettings } from "@/components/graph/GalaxyView";
import TimelineView from "@/components/graph/TimelineView";
import MatrixView from "@/components/graph/MatrixView";
import NodeCard from "@/components/graph/NodeCard";
import GraphToolbar, { type ViewMode } from "@/components/graph/GraphToolbar";
import InsightOverlay from "@/components/insight/InsightOverlay";
import QueryPanel from "@/components/query/QueryPanel";
import { useRouter, useSearchParams } from "next/navigation";

interface SelectedNode {
  id: string;
  name: string;
  type: string;
  summary: string;
  color: string;
  document_id: string | null;
  size?: number;
}

const DEFAULT_FORCE: ForceSettings = {
  repel: -200,
  linkDistance: 80,
  nodeSize: 1,
  linkWidth: 1,
};

const POLL_INTERVAL_MS = 15000;

function graphSignature(data: CytoscapeData) {
  return JSON.stringify({
    nodes: data.nodes.map((node) => node.data.id).sort(),
    edges: data.edges.map((edge) => edge.data.id).sort(),
  });
}

function toSelectedNode(node: CytoscapeData["nodes"][number]["data"]): SelectedNode {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    summary: node.summary,
    color: node.color,
    document_id: node.document_id,
    size: node.size,
  };
}

function GraphPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetNodeId = searchParams.get("node");
  const [viewType, setViewType] = useState<ViewMode>("galaxy");
  const [nodeType, setNodeType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [queryHighlightedNodes, setQueryHighlightedNodes] = useState<string[]>([]);
  const [galaxyData, setGalaxyData] = useState<CytoscapeData>({ nodes: [], edges: [] });
  const [timelineData, setTimelineData] = useState<TimelineEntry[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixEntry[]>([]);
  const [fromDate, setFromDate] = useState<string | undefined>();
  const [toDate, setToDate] = useState<string | undefined>();
  const [liveCount, setLiveCount] = useState(0);
  const [activeInsight, setActiveInsight] = useState<InsightEvent | null>(null);
  const [forceSettings, setForceSettings] = useState<ForceSettings>(DEFAULT_FORCE);
  const [timelineMode, setTimelineMode] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const graphSignatureRef = useRef("");
  const appliedNodeParamRef = useRef<string | null>(null);

  useEffect(() => {
    if (galaxyData.nodes.length > 3 && user) {
      discoverInsights().then((res) => {
        if (res.insights.length > 0 && res.insights[0].significance >= 0.5) {
          setTimeout(() => {
            setActiveInsight(res.insights[0]);
            soundEngine.play("insight");
          }, 2000);
        }
      });
    }
  }, [galaxyData.nodes.length, user]);

  // Load available years and default to latest
  useEffect(() => {
    if (!user) return;
    getGraphYears().then((res) => {
      setAvailableYears(res.years);
      if (res.years.length > 0) {
        setSelectedYears([res.years[0]]);
      }
    });
  }, [user]);

  const applyGalaxyData = useCallback((data: CytoscapeData, fromPolling = false) => {
    const nextSignature = graphSignature(data);
    if (fromPolling && graphSignatureRef.current && graphSignatureRef.current !== nextSignature) {
      setLiveCount((prev) => prev + 1);
    }
    graphSignatureRef.current = nextSignature;
    setGalaxyData(data);
  }, []);

  const loadGalaxy = useCallback(async (fromPolling = false) => {
    const data = await getGraphData(nodeType || undefined, keyword || undefined, undefined, fromDate, toDate, selectedYears.length > 0 ? selectedYears : undefined);
    applyGalaxyData(data, fromPolling);
  }, [nodeType, keyword, fromDate, toDate, selectedYears, applyGalaxyData]);

  const loadTimeline = useCallback(async () => {
    const data = await getTimelineData();
    setTimelineData(data);
  }, []);

  const loadMatrix = useCallback(async () => {
    const data = await getMatrixData();
    setMatrixData(data);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (viewType === "galaxy") {
      void loadGalaxy();
      return;
    }
    if (viewType === "timeline") {
      void loadTimeline();
      return;
    }
    void loadMatrix();
  }, [user, viewType, loadGalaxy, loadTimeline, loadMatrix]);

  useEffect(() => {
    if (!user || viewType !== "galaxy") return;
    const timer = window.setInterval(() => {
      void loadGalaxy(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [user, viewType, loadGalaxy]);

  useEffect(() => {
    if (!targetNodeId) {
      appliedNodeParamRef.current = null;
      return;
    }
    if (viewType !== "galaxy") {
      setViewType("galaxy");
    }
  }, [targetNodeId, viewType]);

  useEffect(() => {
    if (!targetNodeId) return;
    if (appliedNodeParamRef.current === targetNodeId) return;
    const targetNode = galaxyData.nodes.find((node) => node.data.id === targetNodeId)?.data;
    if (!targetNode) return;
    setSelectedNode(toSelectedNode(targetNode));
    setHighlightedNodeId(targetNode.id);
    setQueryHighlightedNodes([]);
    appliedNodeParamRef.current = targetNodeId;
  }, [targetNodeId, galaxyData]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-500">请先登录后查看知识图谱</p>
          <a href="/login" className="text-blue-600 hover:underline">去登录</a>
        </div>
      </main>
    );
  }

  const handleNodeClick = (node: SelectedNode) => {
    setSelectedNode(node);
    setHighlightedNodeId(node.id);
    setQueryHighlightedNodes([]);
    soundEngine.play("connect");
  };

  const handleQueryHighlight = (nodeIds: string[]) => {
    setQueryHighlightedNodes(nodeIds);
    if (nodeIds.length === 0) {
      setSelectedNode(null);
      setHighlightedNodeId(null);
      return;
    }
    const firstNode = galaxyData.nodes.find((node) => node.data.id === nodeIds[0])?.data;
    if (firstNode) {
      setSelectedNode(toSelectedNode(firstNode));
    }
    setHighlightedNodeId(nodeIds[0]);
  };

  const handleJumpToWorkbench = (documentId: string) => {
    router.push(`/workbench?doc=${documentId}`);
  };

  const handleAcceptSuggestion = async (suggestion: { source_id: string; target_id: string; type: string; confidence: number }) => {
    try {
      await createGraphRelation(suggestion);
      soundEngine.play("achievement");
      await loadGalaxy();
    } catch {
      // Silently fail
    }
  };

  const handleDateChange = (from?: string, to?: string) => {
    setFromDate(from);
    setToDate(to);
  };

  const handleTimelineAnimate = () => {
    if (timelineData.length === 0) {
      getTimelineData().then((data) => {
        setTimelineData(data);
        setTimelineMode(true);
      });
      return;
    }
    setTimelineMode(true);
  };

  const toggleYear = (year: number) => {
    setSelectedYears((prev) => {
      if (prev.includes(year)) {
        return prev.filter((y) => y !== year);
      }
      return [...prev, year].sort((a, b) => b - a);
    });
  };

  const selectAllYears = () => {
    setSelectedYears([...availableYears]);
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <InsightOverlay insight={activeInsight} onDismiss={() => setActiveInsight(null)} animationIntensity={0.7} />

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800">知识图谱</h1>
        <p className="mt-1 text-sm text-gray-500">探索实验、设备、理论之间的关联</p>
      </div>

      <div className="mb-4">
        <QueryPanel
          onHighlightNodes={handleQueryHighlight}
          onSourceClick={(docId) => handleJumpToWorkbench(docId)}
        />
      </div>

      {/* Year filter */}
      {availableYears.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">年份:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={selectAllYears}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                selectedYears.length === availableYears.length
                  ? "border-orange-400 bg-orange-50 text-orange-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              全部
            </button>
            {availableYears.map((year) => (
              <button
                key={year}
                onClick={() => toggleYear(year)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  selectedYears.includes(year)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-400">
            已选 {selectedYears.length}/{availableYears.length} 个年份
          </span>
        </div>
      )}

      <GraphToolbar
        viewType={viewType}
        onViewChange={setViewType}
        nodeType={nodeType}
        onNodeTypeChange={setNodeType}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSearch={() => void loadGalaxy()}
        nodeCount={galaxyData.nodes.length}
        edgeCount={galaxyData.edges.length}
        liveCount={liveCount}
        fromDate={fromDate}
        toDate={toDate}
        onDateChange={handleDateChange}
        forceSettings={forceSettings}
        onForceSettingsChange={setForceSettings}
        onTimelineAnimate={handleTimelineAnimate}
        isAnimating={timelineMode}
      />

      <div className="relative mt-4" style={{ height: "calc(100vh - 380px)", minHeight: 360 }}>
        {viewType === "galaxy" && (
          <>
            <GalaxyView
              data={galaxyData}
              onNodeClick={handleNodeClick}
              highlightedNodeId={highlightedNodeId}
              queryHighlightedNodes={queryHighlightedNodes}
              forceSettings={forceSettings}
              timelineMode={timelineMode}
              timelineData={timelineData}
              onTimelineDone={() => setTimelineMode(false)}
            />
            <NodeCard
              node={selectedNode}
              onClose={() => {
                setSelectedNode(null);
                setHighlightedNodeId(null);
                setQueryHighlightedNodes([]);
              }}
              onJumpToWorkbench={handleJumpToWorkbench}
              onAcceptSuggestion={handleAcceptSuggestion}
            />
          </>
        )}
        {viewType === "timeline" && (
          <TimelineView data={timelineData} highlightedNodeId={highlightedNodeId} onNodeClick={(n) => handleNodeClick({ ...n, document_id: null })} />
        )}
        {viewType === "matrix" && (
          <MatrixView data={matrixData} highlightedNodeId={highlightedNodeId} />
        )}

        {viewType === "galaxy" && galaxyData.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            上传文档后将自动生成知识图谱
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>图例:</span>
          {[
            { label: "实验", color: "#3b82f6" },
            { label: "设备", color: "#ef4444" },
            { label: "理论", color: "#8b5cf6" },
            { label: "耗材", color: "#f59e0b" },
            { label: "工具", color: "#10b981" },
            { label: "概念", color: "#6b7280" },
          ].map((t) => (
            <span key={t.label} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.label}
            </span>
          ))}
        </div>
        {(highlightedNodeId || queryHighlightedNodes.length > 0) && (
          <button
            onClick={() => {
              setSelectedNode(null);
              setHighlightedNodeId(null);
              setQueryHighlightedNodes([]);
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            清除选中
          </button>
        )}
      </div>
    </main>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-gray-400">加载中...</p></main>}>
      <GraphPageContent />
    </Suspense>
  );
}
