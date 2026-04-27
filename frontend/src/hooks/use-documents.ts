"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listDocuments, uploadDocument, uploadBatch, getDocumentStatus } from "@/lib/api";

export function useDocuments(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ["documents", page, pageSize],
    queryFn: () => listDocuments(page, pageSize),
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useDocumentStatus(docId: string | null) {
  return useQuery({
    queryKey: ["documents", "status", docId],
    queryFn: () => getDocumentStatus(docId!),
    enabled: !!docId,
    refetchInterval: (q) => {
      if (q.state.data?.status === "completed" || q.state.data?.status === "failed") return false;
      return 3000;
    },
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, meta }: { file: File; meta: Parameters<typeof uploadDocument>[1] }) =>
      uploadDocument(file, meta),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useUploadBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ files, meta }: { files: File[]; meta: Parameters<typeof uploadBatch>[1] }) =>
      uploadBatch(files, meta),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}
