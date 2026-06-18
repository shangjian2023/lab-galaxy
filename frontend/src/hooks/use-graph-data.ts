"use client";

import { useQuery } from "@tanstack/react-query";
import { getGraphData, getTimelineData, getMatrixData } from "@/lib/api";

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

export function useTimelineData(scope?: string) {
  return useQuery({
    queryKey: ["graph", "timeline", scope],
    queryFn: () => getTimelineData(scope),
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useMatrixData(scope?: string) {
  return useQuery({
    queryKey: ["graph", "matrix", scope],
    queryFn: () => getMatrixData(scope),
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}
