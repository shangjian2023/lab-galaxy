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
