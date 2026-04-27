import { create } from "zustand";

export type ViewMode = "galaxy" | "timeline" | "matrix";

interface GraphState {
  viewMode: ViewMode;
  nodeType: string;
  keyword: string;
  fromDate: string | undefined;
  toDate: string | undefined;
  selectedNodeId: string | null;
  highlightedNodeId: string | null;
  queryHighlightNodes: string[];

  setViewMode: (v: ViewMode) => void;
  setNodeType: (t: string) => void;
  setKeyword: (k: string) => void;
  setDateRange: (from?: string, to?: string) => void;
  selectNode: (id: string | null) => void;
  setHighlightedNode: (id: string | null) => void;
  setQueryHighlightNodes: (ids: string[]) => void;
  clearSelection: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  viewMode: "galaxy",
  nodeType: "",
  keyword: "",
  fromDate: undefined,
  toDate: undefined,
  selectedNodeId: null,
  highlightedNodeId: null,
  queryHighlightNodes: [],

  setViewMode: (v) => set({ viewMode: v }),
  setNodeType: (t) => set({ nodeType: t }),
  setKeyword: (k) => set({ keyword: k }),
  setDateRange: (from, to) => set({ fromDate: from, toDate: to }),
  selectNode: (id) => set({ selectedNodeId: id, highlightedNodeId: id, queryHighlightNodes: [] }),
  setHighlightedNode: (id) => set({ highlightedNodeId: id }),
  setQueryHighlightNodes: (ids) => set({ queryHighlightNodes: ids, highlightedNodeId: ids[0] || null }),
  clearSelection: () => set({ selectedNodeId: null, highlightedNodeId: null, queryHighlightNodes: [] }),
}));
