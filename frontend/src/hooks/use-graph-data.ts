"use client";

import { useQuery } from "@tanstack/react-query";
import { getGraphData, getTimelineData, getMatrixData, discoverInsights } from "@/lib/api";

export function useGraphData(
  nodeType?: string,
  keyword?: string,
  fromDate?: string,
  toDate?: string,
) {
  return useQuery({
    queryKey: ["graph", "galaxy", nodeType, keyword, fromDate, toDate],
    queryFn: () => getGraphData(nodeType || undefined, keyword || undefined, 500, fromDate, toDate),
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useTimelineData() {
  return useQuery({
    queryKey: ["graph", "timeline"],
    queryFn: getTimelineData,
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useMatrixData() {
  return useQuery({
    queryKey: ["graph", "matrix"],
    queryFn: getMatrixData,
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useInsights(enabled: boolean) {
  return useQuery({
    queryKey: ["insights"],
    queryFn: discoverInsights,
    enabled,
    staleTime: 60_000,
  });
}
