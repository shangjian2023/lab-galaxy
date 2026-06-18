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
  getNodeContext,
  getRelationTree,
  type CytoscapeData,
  type TimelineEntry,
  type MatrixEntry,
} from "@/lib/api";
import { soundEngine } from "@/lib/audio/SoundEngine";
import GalaxyView, { type ForceSettings } from "@/components/graph/GalaxyView";
import TimelineView from "@/components/graph/TimelineView";
import MatrixView from "@/components/graph/MatrixView";
import NodeCard from "@/components/graph/NodeCard";
import GraphToolbar, { type ViewMode } from "@/components/graph/GraphToolbar";
import DraggablePixelChar from "@/components/graph/DraggablePixelChar";
import QueryPanel from "@/components/query/QueryPanel";
import TeamManager from "@/components/graph/TeamManager";
import { useQueryHistoryStore } from "@/stores/query-history-store";
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
      className="absolute left-3 top-3 z-10 overflow-hidden bg-[#F4F1EE] shadow-lg shadow-black/10"
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
              <svg className="h-5 w-5 text-[#9A8C73]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-[9px] font-bold text-[#9A8C73]">{experiments.length}</span>
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
            <div className="flex items-center justify-between border-b border-[#DBC7B5]/40 px-3 py-2">
              <span className="text-xs font-bold text-gray-700">实验列表</span>
              <button
                onClick={onToggle}
                className="rounded-md p-0.5 text-black transition-colors hover:bg-[#DBC7B5]/30 hover:text-[#9A8C73]"
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
                      ? "bg-[#DBC7B5]/50 font-semibold text-[#6B5D50]"
                      : "text-black hover:bg-[#DBC7B5]/20 hover:text-[#9A8C73]"
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
  const guestFromUrl = searchParams.get("guest") === "1";
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
  const [timelineMode, setTimelineMode] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const graphSignatureRef = useRef("");
  const appliedNodeParamRef = useRef<string | null>(null);
  const [isGuestView, setIsGuestView] = useState(false); // viewing a shared node not in own scope
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expListOpen, setExpListOpen] = useState(false);
  const [graphScope, setGraphScope] = useState<"public" | "team" | "private">(
    scopeFromUrl === "private" || scopeFromUrl === "public" || scopeFromUrl === "team"
      ? scopeFromUrl
      : teamIdFromUrl
        ? "team"
        : "private"
  );
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(teamIdFromUrl || undefined);
  const [showTeamManager, setShowTeamManager] = useState(false);

  // NOTE: graphScope & activeTeamId are initialized directly from URL params
  // above (not via useEffect) so the first data load already uses the correct
  // scope — this prevents the race where the first load runs with the default
  // "private" scope and the target node goes missing.

  // Experiment list derived from graph data (deduplicated by node id — polling
  // refreshes can momentarily carry duplicates before React reconciles)
  const experiments = useMemo(() => {
    const seen = new Set<string>();
    return galaxyData.nodes
      .filter((n) => {
        if (n.data.type !== "Experiment") return false;
        if (seen.has(n.data.id)) return false;
        seen.add(n.data.id);
        return true;
      })
      .map((n) => ({ id: n.data.id, name: n.data.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [galaxyData.nodes]);

  // ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // Load available years. When targeting a node via URL (?node=), select ALL
  // years so the target node's document is guaranteed to load — otherwise the
  // default "latest year only" filter can hide the node and break the jump.
  useEffect(() => {
    if (!user) return;
    getGraphYears(graphScope, activeTeamId).then((res) => {
      setAvailableYears(res.years);
      if (res.years.length > 0) {
        setSelectedYears(targetNodeId ? [...res.years] : [res.years[0]]);
      }
    });
  }, [user, graphScope, activeTeamId, targetNodeId]);

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
    // While a target node from the URL hasn't been resolved yet, ignore the year
    // filter so the node is guaranteed to be in the loaded data. Once resolved
    // (appliedNodeParamRef matches targetNodeId), normal year filtering resumes
    // so the user can narrow down again.
    const hasPendingTarget = !!targetNodeId && appliedNodeParamRef.current !== targetNodeId;
    const effectiveYears = hasPendingTarget
      ? undefined
      : (selectedYears.length > 0 ? selectedYears : undefined);
    const data = await getGraphData(nodeType || undefined, keyword || undefined, undefined, fromDate, toDate, effectiveYears, graphScope, activeTeamId);
    applyGalaxyData(data, fromPolling);
  }, [nodeType, keyword, fromDate, toDate, selectedYears, graphScope, activeTeamId, applyGalaxyData, targetNodeId]);

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
    // In guest mode the graph shows a shared node's mini-graph; skip loading
    // the user's own graph data entirely (otherwise it races with the guest
    // load and overwrites the mini-graph).
    if (viewType === "galaxy" && guestFromUrl) return;
    if (viewType === "galaxy") {
      void loadGalaxy();
      return;
    }
    if (viewType === "timeline") {
      void loadTimeline();
      return;
    }
    void loadMatrix();
  }, [user, viewType, loadGalaxy, loadTimeline, loadMatrix, guestFromUrl]);

  useEffect(() => {
    if (!user || viewType !== "galaxy") return;
    if (isGuestView) return; // don't poll & overwrite the guest mini-graph
    const timer = window.setInterval(() => {
      void loadGalaxy(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [user, viewType, loadGalaxy, isGuestView]);

  useEffect(() => {
    if (!targetNodeId || viewType !== "galaxy") {
      appliedNodeParamRef.current = null;
      return;
    }
  }, [targetNodeId, viewType]);

  useEffect(() => {
    if (!targetNodeId || viewType !== "galaxy") return;
    if (appliedNodeParamRef.current === targetNodeId) return;
    const targetNode = galaxyData.nodes.find((node) => node.data.id === targetNodeId)?.data;
    if (targetNode) {
      // Node is in the currently-loaded graph data: highlight & pan to it.
      setSelectedNode(toSelectedNode(targetNode));
      setHighlightedNodeId(targetNode.id);
      setQueryHighlightedNodes([]);
      appliedNodeParamRef.current = targetNodeId;
    }
    // else: node belongs to a document the user can't see in bulk (guest view).
    // Handled by the guest-loading effect below.
  }, [targetNodeId, galaxyData, viewType]);

  // Guest view: the target node is not in any of the user's graph scopes (it
  // was @-mentioned from someone else's private doc). Load its relation tree and
  // render it as a temporary "mini graph" centred on the node, so the user can
  // see & locate the shared node. This replaces the user's own graph until they
  // return. Direction: any logged-in user can view a shared node.
  useEffect(() => {
    if (!guestFromUrl || !targetNodeId || viewType !== "galaxy") return;
    if (appliedNodeParamRef.current === targetNodeId) return;
    let cancelled = false;

    // Helper: build a single-node mini-graph from getNodeContext (used when
    // getRelationTree returns nothing, e.g. an isolated Theory/Concept node).
    const buildSingleNode = async () => {
      try {
        const ctx = await getNodeContext(targetNodeId);
        if (cancelled || !ctx.node) return;
        const n = ctx.node;
        const guestData: CytoscapeData = {
          nodes: [{ data: { id: n.id, label: n.name, name: n.name, type: n.type, summary: n.summary, color: "", document_id: n.document_id ?? null, size: 28 } }],
          edges: [],
        };
        setGalaxyData(guestData);
        setIsGuestView(true);
        setSelectedNode({ id: n.id, name: n.name, type: n.type, summary: n.summary, color: "", document_id: n.document_id ?? null });
        setHighlightedNodeId(n.id);
        setQueryHighlightedNodes([]);
        appliedNodeParamRef.current = targetNodeId;
      } catch {
        /* nothing we can do — node doesn't exist or no permission */
      }
    };

    (async () => {
      try {
        const tree = await getRelationTree(targetNodeId);
        if (cancelled) return;
        if (!tree.root) {
          // No relation tree for this node — fall back to single-node view
          await buildSingleNode();
          return;
        }
        const root = tree.root;
        const nodes: CytoscapeData["nodes"] = [
          { data: { id: root.id, label: root.name || root.id.slice(0, 8), name: root.name, type: root.type, summary: root.summary, color: "", document_id: root.document_id ?? null, size: 28 } },
          ...root.children.map((c) => ({
            data: { id: c.id, label: c.name || c.id.slice(0, 8), name: c.name, type: c.type, summary: c.summary, color: "", document_id: c.document_id ?? null, size: 20 },
          })),
        ];
        const edges: CytoscapeData["edges"] = root.children.map((c) => ({
          data: { id: `${root.id}--${c.id}`, source: root.id, target: c.id, type: c.rel_type || "RELATED_TO", confidence: 1 },
        }));
        const guestData: CytoscapeData = { nodes, edges };
        setGalaxyData(guestData);
        setIsGuestView(true);
        setSelectedNode({ id: root.id, name: root.name, type: root.type, summary: root.summary, color: "", document_id: root.document_id ?? null });
        setHighlightedNodeId(root.id);
        setQueryHighlightedNodes([]);
        appliedNodeParamRef.current = targetNodeId;
      } catch {
        // getRelationTree threw — still show the node so the user sees something
        await buildSingleNode();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guestFromUrl, targetNodeId, viewType]);

  // ── Restore last natural-language query highlight on mount ──
  // The QueryPanel's history is persisted (zustand), but queryHighlightedNodes /
  // highlightedNodeId are component state and are lost when navigating away and
  // back. If the user isn't coming from a node-jump URL, restore the most recent
  // query's highlighted nodes so the graph doesn't look "empty" after returning.
  const restoredQueryRef = useRef(false);
  useEffect(() => {
    if (restoredQueryRef.current) return;
    if (targetNodeId) return; // node-jump takes priority
    if (viewType !== "galaxy") return;
    if (galaxyData.nodes.length === 0) return; // data not loaded yet
    const latest = useQueryHistoryStore.getState().items[0];
    if (!latest?.result.highlighted_nodes?.length) return;
    const ids = latest.result.highlighted_nodes;
    setQueryHighlightedNodes(ids);
    const firstNode = galaxyData.nodes.find((n) => n.data.id === ids[0])?.data;
    if (firstNode) {
      setSelectedNode(toSelectedNode(firstNode));
      setHighlightedNodeId(ids[0]);
    }
    restoredQueryRef.current = true;
  }, [targetNodeId, viewType, galaxyData.nodes]);

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
    // Only pan/highlight if the node actually exists in the currently loaded
    // data. If it's filtered out (year/scope), we still store queryHighlightedNodes
    // so they glow once visible, but avoid pointing highlightedNodeId at a node
    // that GalaxyView can never find (which previously caused "跳走就看不见" 感觉).
    const firstNode = galaxyData.nodes.find((node) => node.data.id === nodeIds[0])?.data;
    if (firstNode) {
      setSelectedNode(toSelectedNode(firstNode));
      setHighlightedNodeId(nodeIds[0]);
    }
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
    // Leaving guest view if active
    if (isGuestView) {
      setIsGuestView(false);
      router.replace("/graph");
    }
    // Clear any resolved-node marker so loadGalaxy's hasPendingTarget logic and
    // the node-position effect re-run cleanly for the new scope (otherwise a
    // stale targetNodeId from a prior jump could suppress year filtering).
    appliedNodeParamRef.current = null;
  };

  const exitGuestView = () => {
    setIsGuestView(false);
    setSelectedNode(null);
    setHighlightedNodeId(null);
    setQueryHighlightedNodes([]);
    appliedNodeParamRef.current = null;
    // Remove ?node & ?guest from URL and reload own graph
    router.replace("/graph");
    void loadGalaxy();
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
            forceSettings={{ repel: 0, linkDistance: 0, centerStrength: 0, nodeSize: 0, linkWidth: 0, clusterForce: 0 }}
            timelineMode={timelineMode}
            timelineData={timelineData}
            onTimelineDone={() => setTimelineMode(false)}
            suppressInitialCenter={!!targetNodeId}
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
      {/* Header */}
      <div className="liquid-glass-card mb-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9A8C73] shadow-md shadow-[#9A8C73]/20">
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
                  ? "border border-[#9A8C73] bg-[#DBC7B5]/40 text-[#6B5D50] shadow-sm"
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
                    ? "border border-[#9A8C73] bg-[#DBC7B5]/40 text-[#6B5D50] shadow-sm"
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
          onTimelineAnimate={handleTimelineAnimate}
          isAnimating={timelineMode}
          onCleanupOrphans={handleCleanupOrphans}
          onManageTeams={() => setShowTeamManager(true)}
        />
      </div>

      {/* Guest view banner: shown when viewing a shared node not in own scope */}
      {isGuestView && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-orange-200/50 bg-orange-50/60 px-4 py-2.5">
          <span className="text-xs font-medium text-orange-800">
            🔗 正在查看他人分享的节点及其关联（不在此图谱范围内）
          </span>
          <button
            onClick={exitGuestView}
            className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-orange-600"
          >
            ← 返回我的图谱
          </button>
        </div>
      )}

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
