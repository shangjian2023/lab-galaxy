"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDocTree, getCardStream, toggleFavorite } from "@/lib/api";

export function useDocTree() {
  return useQuery({
    queryKey: ["workbench", "tree"],
    queryFn: getDocTree,
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useCardStream(params?: {
  year?: number;
  experiment_type?: string;
  favorite_only?: boolean;
  page?: number;
}) {
  return useQuery({
    queryKey: ["workbench", "cards", params],
    queryFn: () => getCardStream(params),
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => toggleFavorite(docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workbench", "cards"] });
    },
  });
}
