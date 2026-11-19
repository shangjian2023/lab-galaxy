"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Download,
  FileText,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  Pause,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Scan,
  Search,
  Settings2,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/components/app/AuthProvider";
import { ObsidianGraph, type ObsidianGraphHandle } from "@/components/graph/ObsidianGraph";
import { groupMeta } from "@/lib/demo-data";
import type { KnowledgeGraphData as PersistedKnowledgeGraphData } from "@/lib/knowledge-types";
import type { ClientState } from "@/lib/graph/engine-client";
import { DEFAULT_DISPLAY_SETTINGS, type ExplorationDepth, type GraphDisplaySettings, type GraphExploration } from "@/lib/graph/graph-settings";
import type { CacheScope } from "@/lib/graph/position-cache";
import { DEFAULT_SETTINGS, type EngineSettings } from "@/lib/graph/protocol";
import type { KnowledgeGraphData, KnowledgeGroup, KnowledgeNode } from "@/lib/research-types";

const EMPTY_GRAPH: PersistedKnowledgeGraphData = { nodes: [], edges: [] };
type InspectorTab = "details" | "nodes" | "display" | "physics";
type GraphSource = "corpus" | "mine";

function GraphWorkspace() {
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const requestedNode = params.get("node");
  const graphRef = useRef<ObsidianGraphHandle>(null);
  const focusNonce = useRef(0);
  const graphRequest = useRef(0);
  const [source, setSource] = useState<GraphSource>("corpus");
  const [sourceReady, setSourceReady] = useState(false);
  const [realGraph, setRealGraph] = useState<PersistedKnowledgeGraphData>(EMPTY_GRAPH);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState("");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [group, setGroup] = useState<"all" | KnowledgeGroup>("all");
  const [year, setYear] = useState("all");
  const [view, setView] = useState<"graph" | "table">("graph");
  const [selected, setSelected] = useState<KnowledgeNode | null>(null);
  const [settings, setSettings] = useState<EngineSettings>(DEFAULT_SETTINGS);
  const [displaySettings, setDisplaySettings] = useState<GraphDisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [exploration, setExploration] = useState<GraphExploration | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; nonce: number } | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [engineState, setEngineState] = useState<ClientState>({ engine: null, ready: false });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("details");
  const [expanded, setExpanded] = useState(false);

  const loadGraph = useCallback(async () => {
    const requestId = ++graphRequest.current;
    setGraphLoading(true);
    setGraphError("");
    try {
      const response = await fetch(`/api/knowledge/graph?scope=${source}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (PersistedKnowledgeGraphData & { detail?: string }) | null;
      if (requestId !== graphRequest.current) return;
      if (!response.ok) throw new Error(payload?.detail ?? `图谱读取失败（HTTP ${response.status}）`);
      setRealGraph({ nodes: payload?.nodes ?? [], edges: payload?.edges ?? [] });
    } catch (error) {
      if (requestId !== graphRequest.current) return;
      setRealGraph(EMPTY_GRAPH);
      setGraphError(error instanceof Error ? error.message : "知识图谱读取失败");
    } finally {
      if (requestId === graphRequest.current) setGraphLoading(false);
    }
  }, [source]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setSourceReady(false);
    const chooseSource = async () => {
      let nextSource: GraphSource = "corpus";
      if (user) {
        try {
          if (requestedNode) {
            const response = await fetch(`/api/knowledge/nodes?id=${encodeURIComponent(requestedNode)}`, { cache: "no-store" });
            const payload = await response.json() as { nodes?: Array<{ sourceScope?: GraphSource }> };
            const requestedScope = payload.nodes?.[0]?.sourceScope;
            if (requestedScope === "mine" || requestedScope === "corpus") nextSource = requestedScope;
          } else {
            const response = await fetch("/api/ingestion/tasks", { cache: "no-store" });
            const payload = await response.json() as { tasks?: Array<{ status: string }> };
            if (response.ok && payload.tasks?.some((task) => task.status === "completed")) nextSource = "mine";
          }
        } catch {
          // 默认来源推断失败时仍提供可切换的公开预置语料。
        }
      }
      if (!cancelled) {
        setSource(nextSource);
        setSourceReady(true);
      }
    };
    void chooseSource();
    return () => { cancelled = true; };
  }, [authLoading, user?.id, requestedNode]);

  useEffect(() => {
    if (!sourceReady) return;
    graphRequest.current += 1;
    setRealGraph(EMPTY_GRAPH);
    setSelected(null);
    setExploration(null);
    void loadGraph();
  }, [user?.id, source, sourceReady, loadGraph]);

  const activeGraph: KnowledgeGraphData = realGraph;
  const cacheScope: CacheScope = useMemo(() => source === "corpus"
    ? { userId: "preloaded-corpus", scope: "public", teamId: null }
    : { userId: user?.id ?? "anonymous", scope: "private", teamId: null }, [source, user?.id]);

  const filteredData = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const nodes = activeGraph.nodes.filter((node) => {
      const matchesQuery = !normalized || `${node.name} ${node.type} ${node.summary}`.toLowerCase().includes(normalized);
      return matchesQuery && (group === "all" || node.group === group) && (year === "all" || node.year === Number(year));
    });
    const ids = new Set(nodes.map((node) => node.id));
    return { nodes, edges: activeGraph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
  }, [activeGraph, query, group, year]);

  const availableYears = useMemo(() => [...new Set(activeGraph.nodes.map((node) => node.year))].sort((a, b) => b - a), [activeGraph]);

  useEffect(() => {
    if (selected && !filteredData.nodes.some((node) => node.id === selected.id)) setSelected(filteredData.nodes[0] ?? null);
    if (exploration && !filteredData.nodes.some((node) => node.id === exploration.rootId)) setExploration(null);
  }, [filteredData.nodes, selected, exploration]);

  useEffect(() => {
    const requestedId = params.get("node");
    if (!selected && requestedId) {
      const requested = activeGraph.nodes.find((node) => node.id === requestedId);
      if (requested) setSelected(requested);
    }
  }, [activeGraph.nodes, params, selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (exploration) setExploration(null);
      else setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exploration]);

  const relations = useMemo(() => {
    if (!selected) return [];
    return filteredData.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).map((edge) => {
      const outgoing = edge.source === selected.id;
      const otherId = outgoing ? edge.target : edge.source;
      return { ...edge, other: activeGraph.nodes.find((node) => node.id === otherId), direction: outgoing ? "引出" : "关联" };
    }).filter((item) => item.other);
  }, [selected, filteredData.edges, activeGraph.nodes]);

  const selectAndFocus = useCallback((node: KnowledgeNode) => {
    setSelected(node);
    setInspectorTab("details");
    setFocusRequest({ nodeId: node.id, nonce: ++focusNonce.current });
  }, []);

  const exploreNode = useCallback((id: string) => {
    const node = filteredData.nodes.find((item) => item.id === id);
    if (!node) return;
    setSelected(node);
    setExploration({ rootId: id, depth: 1, path: [id] });
    setFocusRequest({ nodeId: id, nonce: ++focusNonce.current });
  }, [filteredData.nodes]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(filteredData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "lab-galaxy-graph.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const updatePhysics = (key: keyof EngineSettings, value: number) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  function updateDisplay<K extends keyof GraphDisplaySettings>(key: K, value: GraphDisplaySettings[K]) {
    setDisplaySettings((current) => ({ ...current, [key]: value }));
  }

  const clearFilters = () => {
    setQuery("");
    setGroup("all");
    setYear("all");
    setExploration(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="GRAPH VIEW / 关系图谱"
        title="知识关系图谱"
        description="以 Obsidian 式全局与局部关系视图探索真实实验知识。拖拽节点、滚轮缩放、双击固定，右键进入局部图谱。"
        actions={<button className="btn btn-secondary" onClick={exportData}><Download size={15} />导出当前数据</button>}
      />

      <div className="filter-bar" aria-label="图谱筛选">
        <div className="segmented-control graph-source-control" aria-label="切换图谱数据源">
          <button className={source === "corpus" ? "active" : ""} onClick={() => { setSource("corpus"); setSelected(null); setExploration(null); }}>预置语料演示</button>
          <button className={source === "mine" ? "active" : ""} disabled={!user} title={user ? "查看自己上传文档的知识" : "登录后查看自己的图谱"} onClick={() => { setSource("mine"); setSelected(null); setExploration(null); }}>我的图谱</button>
        </div>
        <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索实体、方法或结论" aria-label="搜索图谱" /></label>
        <select className="select-field" value={group} onChange={(event) => setGroup(event.target.value as "all" | KnowledgeGroup)} aria-label="按实体类型筛选">
          <option value="all">全部类型</option><option value="experiment">实验</option><option value="resource">资源</option><option value="knowledge">知识</option>
        </select>
        <select className="select-field" value={year} onChange={(event) => setYear(event.target.value)} aria-label="按收录年份筛选">
          <option value="all">全部收录年份</option>{availableYears.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="segmented-control" aria-label="切换数据视图">
          <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}><Network size={13} />关系图</button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><Table2 size={13} />数据表</button>
        </div>
      </div>

      <div className={`graph-source-note ${source}`}>
        {source === "corpus"
          ? "首次使用默认探索预置公开实验报告的已发布知识；这是可交互的真实语料演示，不是虚构节点。"
          : "这里只显示你上传文档的已发布知识。文本解析成功后默认进入此视图；完成知识抽取与发布即可看到节点。"}
      </div>

      {graphError ? <div className="form-message error graph-data-message" role="alert"><span>{graphError}。未用其他数据源冒充当前图谱。</span><button className="btn btn-secondary" onClick={() => void loadGraph()}><RotateCcw size={13} />重试</button></div> : null}

      <div className="workspace-grid">
        <section className={`panel graph-workspace obsidian-workspace ${expanded ? "is-expanded" : ""}`} aria-label="知识图谱工作区">
          <div className="panel-heading">
            <div><h2 className="panel-title">{source === "corpus" ? "预置语料 · 交互演示" : "我的知识图谱"}</h2><p className="panel-subtitle">{filteredData.nodes.length} 个节点 · {filteredData.edges.length} 条连接 · {pinnedIds.length} 个固定节点</p></div>
            <span className="graph-live"><i />{!sourceReady || graphLoading ? "正在读取已发布知识" : source === "corpus" ? "真实公开语料 · 可交互演示" : "我的上传 · 仅已发布"}</span>
          </div>
          {!sourceReady || graphLoading ? (
            <div className="empty-state"><RotateCcw size={26} className="animate-spin" /><h3>正在读取已发布知识</h3><p>同时应用公开、私有和团队文档访问边界。</p></div>
          ) : filteredData.nodes.length === 0 ? (
            <div className="empty-state"><Search size={28} /><h3>{activeGraph.nodes.length === 0 ? (source === "corpus" ? "预置语料还没有已发布实体" : "你的图谱还没有已发布实体") : "没有匹配的知识实体"}</h3><p>{activeGraph.nodes.length === 0 ? (source === "corpus" ? "预置报告完成知识抽取与人工发布后，会在这里形成可交互的公开知识图谱。" : "上传解析成功只完成文本处理；请在文档中心继续完成知识抽取与人工发布。") : "尝试减少筛选条件或更换关键词。"}</p>{activeGraph.nodes.length === 0 && source === "mine" ? <Link href="/documents" className="btn btn-primary mt-4"><FileText size={14} />前往文档中心</Link> : activeGraph.nodes.length !== 0 ? <button className="btn btn-secondary mt-4" onClick={clearFilters}>清除筛选</button> : null}</div>
          ) : view === "graph" ? (
            <div className="obsidian-stage">
              <ObsidianGraph
                ref={graphRef}
                className="obsidian-graph"
                nodes={filteredData.nodes}
                edges={filteredData.edges}
                settings={settings}
                selectedId={selected?.id ?? null}
                highlightIds={[]}
                displaySettings={displaySettings}
                exploration={exploration}
                onExplore={exploreNode}
                focusRequest={focusRequest}
                cacheScope={cacheScope}
                onSelect={setSelected}
                onPinsChange={setPinnedIds}
                onEngineReady={setEngineState}
                ariaLabel={`知识图谱，${filteredData.nodes.length} 个实体，${filteredData.edges.length} 条关系。拖拽平移，滚轮缩放，双击固定节点。`}
              />

              {exploration ? (
                <div className="obsidian-exploration-bar">
                  <span><small>局部探索</small><strong>{filteredData.nodes.find((node) => node.id === exploration.rootId)?.name}</strong></span>
                  <label>关系深度<select value={exploration.depth} onChange={(event) => setExploration((current) => current ? { ...current, depth: Number(event.target.value) as ExplorationDepth } : null)}><option value={1}>1 跳</option><option value={2}>2 跳</option><option value={3}>3 跳</option></select></label>
                  <button onClick={() => { setExploration(null); graphRef.current?.fitGlobal(); }} aria-label="返回全局图谱"><X size={14} />全局</button>
                </div>
              ) : null}

              <div className="obsidian-canvas-tools" aria-label="画布控制">
                <button onClick={() => graphRef.current?.zoomBy(1.25)} aria-label="放大"><Plus size={16} /></button>
                <button onClick={() => graphRef.current?.zoomBy(0.8)} aria-label="缩小"><Minus size={16} /></button>
                <button onClick={() => graphRef.current?.fitGlobal()} aria-label="适应全部节点"><Scan size={16} /></button>
                <span />
                <button onClick={() => graphRef.current?.reheat()} aria-label="重新布局"><RotateCcw size={15} /></button>
                <button onClick={() => updateDisplay("ambient", !displaySettings.ambient)} aria-label={displaySettings.ambient ? "暂停环境漂移" : "恢复环境漂移"}>{displaySettings.ambient ? <Pause size={15} /> : <Play size={15} />}</button>
                <button onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "退出全屏" : "全屏图谱"}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
              </div>

              <div className="graph-legend obsidian-legend" aria-label="图例">
                {(Object.keys(groupMeta) as Array<keyof typeof groupMeta>).map((item) => <span key={item}><i className={`legend-mark ${item}`} style={{ background: groupMeta[item].color }} />{groupMeta[item].label}</span>)}
              </div>
            </div>
          ) : (
            <div className="data-table-wrapper mt-5">
              <table className="data-table">
                <thead><tr><th>实体名称</th><th>类型</th><th>分类</th><th>收录年份</th><th>关联关系</th></tr></thead>
                <tbody>{filteredData.nodes.map((node) => {
                  const nodeRelations = filteredData.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
                  return <tr key={node.id}><td><button className="table-node-button" onClick={() => { selectAndFocus(node); setView("graph"); }}>{node.name}</button></td><td>{node.type}</td><td>{groupMeta[node.group].label}</td><td>{node.year}</td><td>{nodeRelations.map((edge) => edge.relation).filter((value, index, array) => array.indexOf(value) === index).join("、") || "—"}</td></tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="panel node-inspector obsidian-inspector" aria-label="图谱检查器">
          <div className="obsidian-inspector-tabs" role="tablist" aria-label="检查器视图">
            <button role="tab" aria-selected={inspectorTab === "details"} className={inspectorTab === "details" ? "active" : ""} onClick={() => setInspectorTab("details")}><Network size={13} />详情</button>
            <button role="tab" aria-selected={inspectorTab === "nodes"} className={inspectorTab === "nodes" ? "active" : ""} onClick={() => setInspectorTab("nodes")}><List size={13} />节点</button>
            <button role="tab" aria-selected={inspectorTab === "display"} className={inspectorTab === "display" ? "active" : ""} onClick={() => setInspectorTab("display")}><Settings2 size={13} />外观</button>
            <button role="tab" aria-selected={inspectorTab === "physics"} className={inspectorTab === "physics" ? "active" : ""} onClick={() => setInspectorTab("physics")}><SlidersHorizontal size={13} />力场</button>
          </div>

          <div className="obsidian-inspector-body">
            {inspectorTab === "details" ? (
              selected ? (
                <>
                  <div className="inspector-hero"><span className="inspector-type">{selected.type} · {groupMeta[selected.group].label}</span><h2>{selected.name}</h2><p>{selected.summary}</p></div>
                  <div className="inspector-stat-grid"><div className="inspector-stat"><strong>{relations.length}</strong><span>直接关联</span></div><div className="inspector-stat"><strong>{selected.year}</strong><span>收录年份</span></div></div>
                  <div className="obsidian-detail-actions">
                    <button className="btn btn-secondary" onClick={() => graphRef.current?.togglePin(selected.id)}><Pin size={13} />{pinnedIds.includes(selected.id) ? "解除固定" : "固定节点"}</button>
                    <button className="btn btn-secondary" onClick={() => exploreNode(selected.id)}><Network size={13} />局部探索</button>
                  </div>
                  <div className="relation-list"><h3>关联路径</h3>{relations.slice(0, 8).map((relation) => (
                    <button className="relation-item w-full text-left" key={relation.id} onClick={() => relation.other && selectAndFocus(relation.other)}><span>{relation.other?.name}</span><small>{relation.relation}</small></button>
                  ))}</div>
                  {selected.documentId ? <Link href={`/documents?doc=${encodeURIComponent(selected.documentId)}`} className="btn btn-secondary mt-5 w-full"><FileText size={14} />查看来源文档<ArrowUpRight size={13} /></Link> : null}
                </>
              ) : <div className="empty-state"><Network size={25} /><h3>尚未选择实体</h3><p>从星图、节点列表或数据表中选择一个节点。</p></div>
            ) : null}

            {inspectorTab === "nodes" ? (
              <div className="obsidian-node-browser">
                <div className="obsidian-panel-heading"><div><strong>知识实体</strong><span>{filteredData.nodes.length} 个结果</span></div><small>键盘 Tab 选择，Enter 定位</small></div>
                <ul>{filteredData.nodes.map((node) => <li key={node.id}><button aria-current={selected?.id === node.id} onClick={() => selectAndFocus(node)}><i style={{ background: groupMeta[node.group].color }} /><span>{node.name}</span><small>{node.type}</small></button></li>)}</ul>
              </div>
            ) : null}

            {inspectorTab === "display" ? (
              <div className="obsidian-settings">
                <div className="obsidian-panel-heading"><div><strong>显示设置</strong><span>即时应用到画布</span></div><small>缩放时标签会自然渐入</small></div>
                <label className="obsidian-range"><span>标签显示阈值<output>{displaySettings.textFadeThreshold.toFixed(2)}</output></span><input type="range" min="0.05" max="1.5" step="0.05" value={displaySettings.textFadeThreshold} onChange={(event) => updateDisplay("textFadeThreshold", Number(event.target.value))} /></label>
                <label className="obsidian-range"><span>节点大小<output>{displaySettings.nodeSize.toFixed(1)}×</output></span><input type="range" min="0.5" max="2.5" step="0.1" value={displaySettings.nodeSize} onChange={(event) => updateDisplay("nodeSize", Number(event.target.value))} /></label>
                <label className="obsidian-range"><span>连线粗细<output>{displaySettings.linkThickness.toFixed(1)}×</output></span><input type="range" min="0.4" max="3" step="0.1" value={displaySettings.linkThickness} onChange={(event) => updateDisplay("linkThickness", Number(event.target.value))} /></label>
                <label className="obsidian-toggle"><span>关系箭头<small>显示知识关系的方向</small></span><input type="checkbox" checked={displaySettings.showArrows} onChange={(event) => updateDisplay("showArrows", event.target.checked)} /></label>
                <label className="obsidian-toggle"><span>悬浮预览<small>悬停后显示实体与关联摘要</small></span><input type="checkbox" checked={displaySettings.showPreview} onChange={(event) => updateDisplay("showPreview", event.target.checked)} /></label>
                <label className="obsidian-toggle"><span>环境漂移<small>布局冷却后保留轻微呼吸感</small></span><input type="checkbox" checked={displaySettings.ambient} onChange={(event) => updateDisplay("ambient", event.target.checked)} /></label>
                <button className="btn btn-secondary w-full" onClick={() => setDisplaySettings(DEFAULT_DISPLAY_SETTINGS)}><RotateCcw size={13} />恢复默认外观</button>
              </div>
            ) : null}

            {inspectorTab === "physics" ? (
              <div className="obsidian-settings">
                <div className="obsidian-panel-heading"><div><strong>力导参数</strong><span>{engineState.engine === "wasm" ? "Rust / WASM" : "TypeScript 回退"}</span></div><small>参数通过 Worker 消息实时更新</small></div>
                <label className="obsidian-range"><span>节点斥力<output>{settings.repel}</output></span><input type="range" min="40" max="4000" step="20" value={settings.repel} onChange={(event) => updatePhysics("repel", Number(event.target.value))} /></label>
                <label className="obsidian-range"><span>链接距离<output>{settings.linkDistance}px</output></span><input type="range" min="40" max="360" step="10" value={settings.linkDistance} onChange={(event) => updatePhysics("linkDistance", Number(event.target.value))} /></label>
                <label className="obsidian-range"><span>链接强度<output>{settings.linkStrength.toFixed(2)}</output></span><input type="range" min="0" max="2" step="0.05" value={settings.linkStrength} onChange={(event) => updatePhysics("linkStrength", Number(event.target.value))} /></label>
                <label className="obsidian-range"><span>中心引力<output>{settings.centerStrength.toFixed(2)}</output></span><input type="range" min="0" max="0.3" step="0.01" value={settings.centerStrength} onChange={(event) => updatePhysics("centerStrength", Number(event.target.value))} /></label>
                <label className="obsidian-range"><span>类型聚簇<output>{settings.clusterForce.toFixed(2)}</output></span><input type="range" min="0" max="0.5" step="0.01" value={settings.clusterForce} onChange={(event) => updatePhysics("clusterForce", Number(event.target.value))} /></label>
                <button className="btn btn-secondary w-full" onClick={() => { setSettings(DEFAULT_SETTINGS); graphRef.current?.reheat(0.7); }}><RotateCcw size={13} />恢复默认并重新布局</button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}

export default function GraphPage() {
  return <Suspense fallback={<div className="empty-state"><Network size={28} /><h3>正在装载知识星图…</h3></div>}><GraphWorkspace /></Suspense>;
}
