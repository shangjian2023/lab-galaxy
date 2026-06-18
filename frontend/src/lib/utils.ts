export function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export const TYPE_LABELS: Record<string, string> = {
  Experiment: "实验",
  Equipment: "设备",
  Theory: "理论",
  Consumable: "耗材",
  Tool: "工具",
  Concept: "概念",
};

// Canonical node-type colors. Shared by GalaxyView (canvas render) and NodeCard
// (detail card) so they never drift out of sync. Backend NODE_COLORS mirrors this.
export const TYPE_COLORS: Record<string, string> = {
  Experiment: "#7c3aed",
  Equipment: "#dc2626",
  Theory: "#2563eb",
  Consumable: "#d97706",
  Tool: "#059669",
  Concept: "#6b7280",
};
