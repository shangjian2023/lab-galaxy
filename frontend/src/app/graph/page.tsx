"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getGraphData, getTimelineData, getMatrixData, discoverInsights, createGraphRelation, type CytoscapeData, type TimelineEntry, type MatrixEntry, type InsightEvent } from "@/lib/api";
import { soundEngine } from "@/lib/audio/SoundEngine";
import GalaxyView from "@/components/graph/GalaxyView";
import TimelineView from "@/components/graph/TimelineView";
import MatrixView from "@/components/graph/MatrixView";
import NodeCard from "@/components/graph/NodeCard";
import GraphToolbar, { type ViewMode } from "@/components/graph/GraphToolbar";
import InsightOverlay from "@/components/insight/InsightOverlay";
import QueryPanel from "@/components/query/QueryPanel";
import { useRouter } from "next/navigation";

interface SelectedNode {
  id: string;
  name: string;
  type: string;
  summary: string;
  color: string;
  document_id: string | null;
  size?: number;
}

export default function GraphPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [viewType, setViewType] = useState<ViewMode>("galaxy");
  const [nodeType, setNodeType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [queryHighlightedNodes, setQueryHighlightedNodes] = useState<string[]>([]);

  // Galaxy data
  const [galaxyData, setGalaxyData] = useState<CytoscapeData>({ nodes: [], edges: [] });
  const [timelineData, setTimelineData] = useState<TimelineEntry[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixEntry[]>([]);

  // Temporal filter
  const [fromDate, setFromDate] = useState<string | undefined>();
  const [toDate, setToDate] = useState<string | undefined>();

  // Live update counter
  const [liveCount, setLiveCount] = useState(0);

  // Insight state
  const [activeInsight, setActiveInsight] = useState<InsightEvent | null>(null);

  // SSE ref
  const eventSourceRef = useRef<EventSource | null>(null);

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

  const loadGalaxy = useCallback(() => {
    getGraphData(nodeType || undefined, keyword || undefined, undefined, fromDate, toDate).then(setGalaxyData);
  }, [nodeType, keyword, fromDate, toDate]);

  const loadTimeline = useCallback(() => {
    getTimelineData().then(setTimelineData);
  }, []);

  const loadMatrix = useCallback(() => {
    getMatrixData().then(setMatrixData);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (viewType === "galaxy") loadGalaxy();
    else if (viewType === "timeline") loadTimeline();
    else loadMatrix();
  }, [viewType, user, loadGalaxy, loadTimeline, loadMatrix]);

  useEffect(() => {
    if (viewType === "galaxy" && user) loadGalaxy();
  }, [nodeType, keyword, viewType, user, loadGalaxy]);

  // SSE connection for live updates
  useEffect(() => {
    if (!user) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    const token = localStorage.getItem("token");
    const url = `${API_BASE}/graph/stream?token=${token}`;

    const es = new EventSource(url);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLiveCount((prev) => prev + 1);
        // Reload galaxy data on any graph change
        if (viewType === "galaxy") loadGalaxy();
      } catch {
        // keepalive or non-JSON, ignore
      }
    };
    es.onerror = () => {
      // Reconnect is handled automatically by EventSource
    };
    eventSourceRef.current = es;

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [user, viewType, loadGalaxy]);

  // Update API function to support date params
  const getGraphDataWithDates = useCallback(async (
    nodeType?: string, keyword?: string, limit?: number,
    fromDate?: string, toDate?: string
  ) => {
    const params = new URLSearchParams();
    if (nodeType) params.set("node_type", nodeType);
    if (keyword) params.set("keyword", keyword);
    if (limit) params.set("limit", String(limit));
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const query = params.toString();
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/graph/data${query ? `?${query}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json() as Promise<CytoscapeData>;
  }, []);

  // Override loadGalaxy with date support
  const loadGalaxyWithDates = useCallback(() => {
    getGraphDataWithDates(nodeType || undefined, keyword || undefined, undefined, fromDate, toDate).then(setGalaxyData);
  }, [nodeType, keyword, fromDate, toDate, getGraphDataWithDates]);

  // Re-register loadGalaxy effect with dates
  useEffect(() => {
    if (viewType === "galaxy" && user) loadGalaxyWithDates();
  }, [fromDate, toDate]);

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
    if (nodeIds.length > 0) setHighlightedNodeId(nodeIds[0]);
  };

  const handleJumpToWorkbench = (documentId: string) => {
    router.push(`/workbench?doc=${documentId}`);
  };

  const handleAcceptSuggestion = async (suggestion: { source_id: string; target_id: string; type: string; confidence: number }) => {
    try {
      await createGraphRelation(suggestion);
      soundEngine.play("achievement");
      loadGalaxyWithDates();
    } catch {
      // Silently fail
    }
  };

  const handleDateChange = (from?: string, to?: string) => {
    setFromDate(from);
    setToDate(to);
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <InsightOverlay insight={activeInsight} onDismiss={() => setActiveInsight(null)} animationIntensity={0.7} />

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800">知识图谱</h1>
        <p className="mt-1 text-sm text-gray-500">探索实验、设备、理论之间的关联</p>
      </div>

      {/* Natural Language Query */}
      <div className="mb-4">
        <QueryPanel
          onHighlightNodes={handleQueryHighlight}
          onSourceClick={(docId) => handleJumpToWorkbench(docId)}
        />
      </div>

      {/* Toolbar */}
      <GraphToolbar
        viewType={viewType}
        onViewChange={setViewType}
        nodeType={nodeType}
        onNodeTypeChange={setNodeType}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSearch={loadGalaxyWithDates}
        nodeCount={galaxyData.nodes.length}
        edgeCount={galaxyData.edges.length}
        liveCount={liveCount}
        fromDate={fromDate}
        toDate={toDate}
        onDateChange={handleDateChange}
      />

      {/* View area */}
      <div className="relative mt-4" style={{ height: "calc(100vh - 380px)", minHeight: 360 }}>
        {viewType === "galaxy" && (
          <>
            <GalaxyView
              data={galaxyData}
              onNodeClick={handleNodeClick}
              highlightedNodeId={highlightedNodeId}
              queryHighlightedNodes={queryHighlightedNodes}
            />
            <NodeCard
              node={selectedNode}
              onClose={() => { setSelectedNode(null); setHighlightedNodeId(null); setQueryHighlightedNodes([]); }}
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

      {/* Legend */}
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
            onClick={() => { setSelectedNode(null); setHighlightedNodeId(null); setQueryHighlightedNodes([]); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            清除选中
          </button>
        )}
      </div>
    </main>
  );
}
