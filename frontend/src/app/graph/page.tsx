"use client";

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import {
  getGraphData,
  getGraphYears,
  getTimelineData,
  getMatrixData,
  cleanupOrphanedNodes,
  discoverInsights,
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
import DraggablePixelChar from "@/components/graph/DraggablePixelChar";
import InsightOverlay from "@/components/insight/InsightOverlay";
import QueryPanel from "@/components/query/QueryPanel";
import TeamManager from "@/components/graph/TeamManager";
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
  centerStrength: 0.08,
  repel: -300,
  linkStrength: 0.8,
  linkDistance: 90,
  experimentCluster: 0.15,
  nodeSize: 1,
  experimentSize: 1.5,
  linkWidth: 1,
};

const FORCE_SETTINGS_KEY = "graph-force-settings";

function loadForceSettings(): ForceSettings {
  if (typeof window === "undefined") return DEFAULT_FORCE;
  try {
    const raw = localStorage.getItem(FORCE_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_FORCE, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_FORCE;
}

function saveForceSettings(s: ForceSettings) {
  try { localStorage.setItem(FORCE_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

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

// ── Springy ball + panel animation ──
const ballVariants = {
  collapsed: {
    width: 48,
    height: 48,
    borderRadius: 12,
    x: 0,
    opacity: 1,
  },
  expanded: {
    width: 280,
    height: "auto" as const,
    borderRadius: 16,
    x: 0,
    opacity: 1,
  },
};

const ballSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 22,
  mass: 0.8,
};

// ── Fullscreen overlay animation (phone app tap-to-open spring) ──
const fullscreenVariants = {
  initial: { opacity: 0, scale: 0.08 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.08 },
};

const fullscreenTransition = {
  type: "spring" as const,
  stiffness: 200,
  damping: 16,
  mass: 0.5,
};

// ── Reusable springy experiment list ball/panel ──
interface ExperimentListProps {
  open: boolean;
  onToggle: () => void;
  experiments: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ExperimentListPanel({ open, onToggle, experiments, selectedId, onSelect }: ExperimentListProps) {
  return (
    <motion.div
      variants={ballVariants}
      initial={false}
      animate={open ? "expanded" : "collapsed"}
      transition={ballSpring}
      className="absolute left-3 top-3 z-10 overflow-hidden bg-gradient-to-br from-white/80 to-orange-50/70 shadow-lg shadow-black/10"
      style={{ backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}
    >
      <AnimatePresence>
        {!open ? (
          <motion.button
            key="ball"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            onClick={() => { onToggle(); soundEngine.play("hover"); }}
            className="flex h-full w-full items-center justify-center"
            title="实验列表"
          >
            <div className="flex flex-col items-center gap-1">
              <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-[9px] font-bold text-orange-600">{experiments.length}</span>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-orange-200/50 px-3 py-2">
              <span className="text-xs font-bold text-gray-700">实验列表</span>
              <button
                onClick={onToggle}
                className="rounded-md p-0.5 text-black transition-colors hover:bg-orange-100 hover:text-orange-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
            <div className="max-h-[calc(100vh-460px)] overflow-y-auto px-1 py-1" style={{ minHeight: 120 }}>
              {experiments.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => onSelect(exp.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-all ${
                    selectedId === exp.id
                      ? "bg-orange-100 font-semibold text-orange-700"
                      : "text-black hover:bg-orange-50 hover:text-orange-700"
                  }`}
                >
                  <span className="line-clamp-2">{exp.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GraphPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetNodeId = searchParams.get("node");
  const teamIdFromUrl = searchParams.get("team_id");
  const scopeFromUrl = searchParams.get("scope");
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
  const [forceSettings, setForceSettings] = useState<ForceSettings>(loadForceSettings);
  const [timelineMode, setTimelineMode] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const graphSignatureRef = useRef("");
  const appliedNodeParamRef = useRef<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expListOpen, setExpListOpen] = useState(false);
  const [graphScope, setGraphScope] = useState<"public" | "team" | "private">("public");
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(teamIdFromUrl || undefined);
  const [showTeamManager, setShowTeamManager] = useState(false);

  // Auto-select team scope when team_id is in URL; auto-select scope from URL param
  useEffect(() => {
    if (teamIdFromUrl) {
      setActiveTeamId(teamIdFromUrl);
      setGraphScope("team");
    } else if (scopeFromUrl === "private" || scopeFromUrl === "public" || scopeFromUrl === "team") {
      setGraphScope(scopeFromUrl);
      if (scopeFromUrl === "team" && teamIdFromUrl) {
        setActiveTeamId(teamIdFromUrl);
      }
    }
  }, [teamIdFromUrl, scopeFromUrl]);

  // Experiment list derived from graph data
  const experiments = useMemo(
    () =>
      galaxyData.nodes
        .filter((n) => n.data.type === "Experiment")
        .map((n) => ({ id: n.data.id, name: n.data.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [galaxyData.nodes],
  );

  // Persist force settings to localStorage
  useEffect(() => { saveForceSettings(forceSettings); }, [forceSettings]);

  // ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // Insight: only show once after document upload completes and new nodes appear
  const initialNodeCountRef = useRef(0);

  useEffect(() => {
    if (galaxyData.nodes.length > 3 && user && galaxyData.nodes.length > initialNodeCountRef.current + 2) {
      const alreadyShown = sessionStorage.getItem("insight_overlay_shown_graph");
      if (!alreadyShown) {
        initialNodeCountRef.current = galaxyData.nodes.length;
        sessionStorage.setItem("insight_overlay_shown_graph", "1");
        discoverInsights().then((res) => {
          if (res.insights.length > 0 && res.insights[0].significance >= 0.5) {
            setTimeout(() => {
              setActiveInsight(res.insights[0]);
              soundEngine.play("insight");
            }, 2000);
          }
        });
      }
    }
  }, [galaxyData.nodes.length, user]);

  // Load available years and default to latest
  useEffect(() => {
    if (!user) return;
    getGraphYears(graphScope, activeTeamId).then((res) => {
      setAvailableYears(res.years);
      if (res.years.length > 0) {
        setSelectedYears([res.years[0]]);
      }
    });
  }, [user, graphScope, activeTeamId]);

  const applyGalaxyData = useCallback((data: CytoscapeData, fromPolling = false) => {
    const nextSignature = graphSignature(data);
    if (fromPolling && graphSignatureRef.current === nextSignature) return;
    if (fromPolling && graphSignatureRef.current && graphSignatureRef.current !== nextSignature) {
      setLiveCount((prev) => prev + 1);
    }
    graphSignatureRef.current = nextSignature;
    setGalaxyData(data);
  }, []);

  const loadGalaxy = useCallback(async (fromPolling = false) => {
    const data = await getGraphData(nodeType || undefined, keyword || undefined, undefined, fromDate, toDate, selectedYears.length > 0 ? selectedYears : undefined, graphScope, activeTeamId);
    applyGalaxyData(data, fromPolling);
  }, [nodeType, keyword, fromDate, toDate, selectedYears, graphScope, activeTeamId, applyGalaxyData]);

  const loadTimeline = useCallback(async () => {
    const data = await getTimelineData(graphScope, activeTeamId);
    setTimelineData(data);
  }, [graphScope, activeTeamId]);

  const loadMatrix = useCallback(async () => {
    const data = await getMatrixData(graphScope, activeTeamId);
    setMatrixData(data);
  }, [graphScope, activeTeamId]);

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
        <p className="text-black">加载中...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-700">请先登录后查看知识图谱</p>
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

  const handleDateChange = (from?: string, to?: string) => {
    setFromDate(from);
    setToDate(to);
  };

  const handleCleanupOrphans = async () => {
    try {
      const res = await cleanupOrphanedNodes();
      if (res.total > 0) {
        // Reload graph after cleanup
        await loadGalaxy();
      }
    } catch {
      // Silently fail
    }
  };

  const handleScopeChange = (scope: "public" | "team" | "private") => {
    setGraphScope(scope);
    // Reset years when scope changes
    setAvailableYears([]);
    setSelectedYears([]);
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

  const handleExperimentSelect = (expId: string) => {
    const node = galaxyData.nodes.find((n) => n.data.id === expId)?.data;
    if (node) {
      setSelectedNode(toSelectedNode(node));
      setHighlightedNodeId(expId);
      setQueryHighlightedNodes([]);
      soundEngine.play("connect");
    }
  };

  // Shared graph content renderer
  const renderGraph = (fullScreen = false) => (
    <>
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
          />
        </>
      )}
      {viewType === "timeline" && (
        <TimelineView data={timelineData} highlightedNodeId={highlightedNodeId} onNodeClick={(n) => handleNodeClick({ ...n, document_id: null })} />
      )}
      {viewType === "matrix" && (
        <MatrixView data={matrixData} highlightedNodeId={highlightedNodeId} />
      )}
    </>
  );

  const legendItems = [
    { label: "实验", color: "#3b82f6" },
    { label: "设备", color: "#ef4444" },
    { label: "理论", color: "#8b5cf6" },
    { label: "耗材", color: "#f59e0b" },
    { label: "工具", color: "#10b981" },
    { label: "概念", color: "#6b7280" },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <InsightOverlay insight={activeInsight} onDismiss={() => setActiveInsight(null)} animationIntensity={0.7} />

      {/* Header */}
      <div className="liquid-glass-card mb-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-md shadow-orange-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">知识图谱</h1>
            <p className="text-[11px] text-gray-700">探索实验、设备、理论之间的关联</p>
          </div>
        </div>
      </div>

      {/* Year filter */}
      {availableYears.length > 0 && (
        <div className="liquid-glass-compact mb-3 flex items-center gap-2 px-4 py-2.5">
          <span className="text-xs font-semibold text-gray-700">年份筛选:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={selectAllYears}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                selectedYears.length === availableYears.length
                  ? "border border-orange-400 bg-orange-50 text-orange-700 shadow-sm"
                  : "glass-button"
              }`}
            >
              全部
            </button>
            {availableYears.map((year) => (
              <button
                key={year}
                onClick={() => toggleYear(year)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selectedYears.includes(year)
                    ? "border border-orange-400 bg-orange-50 text-orange-700 shadow-sm"
                    : "glass-button"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-black">
            已选 {selectedYears.length}/{availableYears.length}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="liquid-glass-card mb-4 p-4">
        <GraphToolbar
          viewType={viewType}
          onViewChange={setViewType}
          graphScope={graphScope}
          onScopeChange={handleScopeChange}
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
          onCleanupOrphans={handleCleanupOrphans}
          onManageTeams={() => setShowTeamManager(true)}
        />
      </div>

      {/* Team Manager Modal */}
      <TeamManager open={showTeamManager} onClose={() => setShowTeamManager(false)} />

      {/* Fullscreen overlay */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            key="graph-fullscreen"
            variants={fullscreenVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={fullscreenTransition}
            className="fixed inset-0 z-40 flex flex-col"
            style={{ backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(30px) saturate(200%)" }}
          >
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-medium text-gray-900">知识图谱 — 全屏模式</span>
              <button
                onClick={() => setIsFullscreen(false)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-gray-900 transition-colors hover:bg-white/20 hover:text-gray-700"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                退出 (ESC)
              </button>
            </div>

            <div className="relative flex-1">
              {renderGraph(true)}

              {/* Experiment list in fullscreen */}
              {viewType === "galaxy" && experiments.length > 0 && (
                <ExperimentListPanel
                  open={expListOpen}
                  onToggle={() => setExpListOpen((v) => !v)}
                  experiments={experiments}
                  selectedId={selectedNode?.id ?? null}
                  onSelect={handleExperimentSelect}
                />
              )}
            </div>

            <div className="flex items-center justify-center gap-5 px-5 py-2.5">
              {legendItems.map((t) => (
                <span key={t.label} className="flex items-center gap-1.5 text-xs text-gray-900">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Draggable Pixel Character ── */}
      <DraggablePixelChar isFullscreen={isFullscreen} onToggle={() => setIsFullscreen((v) => !v)} />

      {/* Inline graph container */}
      <div
        className="relative mt-2"
        style={{ height: "calc(100vh - 380px)", minHeight: 360 }}
      >
        {renderGraph()}

        {/* Springy experiment list ball/panel — left side */}
        {viewType === "galaxy" && experiments.length > 0 && (
          <ExperimentListPanel
            open={expListOpen}
            onToggle={() => setExpListOpen((v) => !v)}
            experiments={experiments}
            selectedId={selectedNode?.id ?? null}
            onSelect={handleExperimentSelect}
          />
        )}

        {viewType === "galaxy" && galaxyData.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-black">
            上传文档后将自动生成知识图谱
          </div>
        )}
      </div>

      <div className="liquid-glass-compact mt-3 flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-4 text-xs text-black">
          <span className="font-medium">图例:</span>
          {legendItems.map((t) => (
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
            className="btn-secondary text-xs"
          >
            清除选中
          </button>
        )}
      </div>

      {/* Query Panel */}
      <div className="liquid-glass-card mt-4 p-4">
        <QueryPanel
          onHighlightNodes={handleQueryHighlight}
          onSourceClick={(docId) => handleJumpToWorkbench(docId)}
        />
      </div>
    </main>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-black">加载中...</p></main>}>
      <GraphPageContent />
    </Suspense>
  );
}
