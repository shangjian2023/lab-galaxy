"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  browseTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  publishTemplate,
  toggleTemplateLike,
  bookmarkTemplate,
  addTemplateComment,
  getMyGrowth,
} from "@/lib/api";

export function useTemplates(params?: { keyword?: string; category?: string; sort?: string; page?: number }) {
  return useQuery({
    queryKey: ["templates", params],
    queryFn: () => browseTemplates(params),
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: () => getTemplate(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateTemplate(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function usePublishTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: publishTemplate,
    onSuccess: (_res, id) => qc.invalidateQueries({ queryKey: ["templates", id] }),
  });
}

export function useToggleTemplateLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleTemplateLike,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useBookmarkTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bookmarkTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useAddTemplateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => addTemplateComment(id, content),
    onSuccess: (_res, { id }) => qc.invalidateQueries({ queryKey: ["templates", id] }),
  });
}

export function useMyGrowth() {
  return useQuery({
    queryKey: ["growth"],
    queryFn: getMyGrowth,
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });
}
