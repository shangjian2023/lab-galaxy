"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import cytoscape from "cytoscape";
import type { CytoscapeData } from "@/lib/api";

interface Props {
  data: CytoscapeData;
  onNodeClick: (node: { id: string; name: string; type: string; summary: string; color: string; document_id: string | null }) => void;
  highlightedNodeId: string | null;
  queryHighlightedNodes?: string[];
}

export default function GalaxyView({ data, onNodeClick, highlightedNodeId, queryHighlightedNodes = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const getFilteredData = useCallback(() => {
    if (collapsed.size === 0) return data;
    const visible = new Set<string>();
    for (const n of data.nodes) visible.add(n.data.id);
    const filteredEdges = data.edges.filter((e) => {
      const s = e.data.source;
      const t = e.data.target;
      if (collapsed.has(s)) return false;
      if (collapsed.has(t)) return false;
      return true;
    });
    return { nodes: data.nodes, edges: filteredEdges };
  }, [data, collapsed]);

  const initCy = useCallback(() => {
    if (!containerRef.current) return;
    if (cyRef.current) cyRef.current.destroy();

    const filtered = getFilteredData();

    const cy = cytoscape({
      container: containerRef.current,
      elements: filtered,
      style: [
        {
          selector: "node",
          style: {
            "label": "data(label)",
            "background-color": "data(color)",
            "width": "data(size)",
            "height": "data(size)",
            "font-size": "10px",
            "color": "#374151",
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-wrap": "ellipsis",
            "text-max-width": "80px",
            "border-width": 2,
            "border-color": "#fff",
            "text-outline-color": "#fff",
            "text-outline-width": 2,
            "transition-property": "background-color, border-width, border-color, width, height",
            "transition-duration": 200,
          },
        },
        // Experiment nodes get a glow ring (star metaphor)
        {
          selector: 'node[type="Experiment"]',
          style: {
            "border-width": 3,
            "border-color": "#93c5fd",
            "border-opacity": 0.7,
            "font-size": "12px",
            "font-weight": "bold",
          },
        },
        {
          selector: "node:active",
          style: {
            "border-width": 4,
            "border-color": "#f97316",
          },
        },
        {
          selector: "node.highlighted",
          style: {
            "border-width": 4,
            "border-color": "#f97316",
            "z-index": 999,
          },
        },
        {
          selector: "node.dimmed",
          style: {
            "opacity": 0.25,
          },
        },
        {
          selector: "node.cross-highlighted",
          style: {
            "border-width": 5,
            "border-color": "#8b5cf6",
            "z-index": 998,
          },
        },
        {
          selector: "node.query-highlighted",
          style: {
            "border-width": 4,
            "border-color": "#f59e0b",
            "z-index": 997,
            "opacity": 1,
          },
        },
        {
          selector: "edge",
          style: {
            "width": "mapData(confidence, 0, 1, 1, 5)",
            "line-color": "#d1d5db",
            "target-arrow-color": "#9ca3af",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "opacity": 0.6,
            "transition-property": "opacity, line-color, width",
            "transition-duration": 200,
          },
        },
        {
          selector: "edge.highlighted",
          style: {
            "opacity": 1,
            "line-color": "#f97316",
            "width": "mapData(confidence, 0, 1, 2, 6)",
            "target-arrow-color": "#f97316",
          },
        },
        {
          selector: "edge.dimmed",
          style: {
            "opacity": 0.1,
          },
        },
      ],
      layout: {
        name: "cose",
        animate: true,
        animationDuration: 800,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 120,
        gravity: 0.3,
        padding: 40,
        randomize: false,
      } as any,
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const d = node.data();
      onNodeClick({
        id: d.id,
        name: d.name,
        type: d.type,
        summary: d.summary,
        color: d.color,
        document_id: d.document_id ?? null,
      });

      // Highlight connected, dim rest
      cy.elements().removeClass("highlighted dimmed");
      cy.elements().addClass("dimmed");
      node.removeClass("dimmed").addClass("highlighted");
      node.connectedEdges().removeClass("dimmed").addClass("highlighted");
      node.connectedEdges().connectedNodes().removeClass("dimmed").addClass("highlighted");
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass("highlighted dimmed");
      }
    });

    cyRef.current = cy;
    setReady(true);
  }, [getFilteredData, onNodeClick]);

  useEffect(() => {
    initCy();
    return () => { cyRef.current?.destroy(); };
  }, [initCy]);

  // Update elements when data changes
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const filtered = getFilteredData();
    cy.elements().remove();
    cy.add(filtered);
    cy.layout({
      name: "cose",
      animate: true,
      animationDuration: 600,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 120,
      gravity: 0.3,
      padding: 40,
    } as any).run();
  }, [getFilteredData]);

  // Cross-view highlight
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().removeClass("cross-highlighted");
    if (highlightedNodeId) {
      const node = cy.$(`#${highlightedNodeId}`);
      if (node.length > 0) {
        node.addClass("cross-highlighted");
        // Pan to node
        cy.animate({
          center: { eles: node },
          duration: 400,
          easing: "ease-in-out-cubic",
        });
      }
    }
  }, [highlightedNodeId]);

  // Multi-node query highlight
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().removeClass("query-highlighted dimmed");
    if (queryHighlightedNodes.length > 0) {
      const nodeSet = new Set(queryHighlightedNodes);
      cy.nodes().forEach((n) => {
        if (nodeSet.has(n.id())) {
          n.addClass("query-highlighted");
        }
      });
      // Highlight edges between query-highlighted nodes
      cy.edges().forEach((e) => {
        const sid = e.source().id();
        const tid = e.target().id();
        if (nodeSet.has(sid) && nodeSet.has(tid)) {
          e.addClass("highlighted");
        }
      });
    }
  }, [queryHighlightedNodes]);

  const toggleCollapse = (nodeId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  return (
    <div className="relative h-full w-full rounded-xl border bg-gray-50">
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          加载图谱中...
        </div>
      )}
    </div>
  );
}
