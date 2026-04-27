/** Constants for the upload form. */

export const EXPERIMENT_TYPES = [
  { value: "course", label: "课程实验" },
  { value: "innovation", label: "创新实验" },
  { value: "research", label: "科研项目" },
  { value: "competition", label: "竞赛项目" },
] as const;

export const SUBJECT_OPTIONS = [
  { value: "cs", label: "计算机" },
  { value: "bio", label: "生物" },
  { value: "physics", label: "物理" },
  { value: "chemistry", label: "化学" },
  { value: "electronics", label: "电子" },
  { value: "mechanical", label: "机械" },
  { value: "materials", label: "材料" },
  { value: "math", label: "数学" },
  { value: "env", label: "环境" },
  { value: "medicine", label: "医学" },
] as const;

export const PRIVACY_OPTIONS = [
  { value: "public", label: "公开", icon: "🌐" },
  { value: "team", label: "仅团队可见", icon: "👥" },
  { value: "private", label: "私有", icon: "🔒" },
] as const;

/** Generate year options for the last N years. */
export function getYearOptions(count = 20) {
  const current = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => current - i);
}

export const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_SIZE_LABEL = "50 MB";

/** Node type colors shared between graph views and admin. */
export const NODE_TYPE_COLORS: Record<string, string> = {
  Experiment: "#3b82f6",
  Equipment: "#ef4444",
  Theory: "#8b5cf6",
  Consumable: "#f59e0b",
  Tool: "#10b981",
  Concept: "#6b7280",
};
