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

// ── Per-user avatar color (deterministic hash → palette index) ──
export const AVATAR_PALETTE: { bg: string; text: string; accent: string }[] = [
  { bg: "linear-gradient(135deg, #FF6B6B 0%, #EE5A5A 100%)", text: "#fff", accent: "#EE5A5A" },
  { bg: "linear-gradient(135deg, #4ECDC4 0%, #36B5AC 100%)", text: "#fff", accent: "#36B5AC" },
  { bg: "linear-gradient(135deg, #96CEB4 0%, #7AB59A 100%)", text: "#fff", accent: "#7AB59A" },
  { bg: "linear-gradient(135deg, #A78BFA 0%, #8B6FE0 100%)", text: "#fff", accent: "#8B6FE0" },
  { bg: "linear-gradient(135deg, #60A5FA 0%, #4F90E0 100%)", text: "#fff", accent: "#4F90E0" },
  { bg: "linear-gradient(135deg, #FBBF24 0%, #E8A81A 100%)", text: "#fff", accent: "#E8A81A" },
  { bg: "linear-gradient(135deg, #F472B6 0%, #E05FA0 100%)", text: "#fff", accent: "#E05FA0" },
  { bg: "linear-gradient(135deg, #34D399 0%, #22BE85 100%)", text: "#fff", accent: "#22BE85" },
  { bg: "linear-gradient(135deg, #FB923C 0%, #E87F2E 100%)", text: "#fff", accent: "#E87F2E" },
  { bg: "linear-gradient(135deg, #94A3B8 0%, #7A8499 100%)", text: "#fff", accent: "#7A8499" },
];

export function getUserAvatarColor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// Time-based greeting for the homepage hero
export function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "上午好";
  if (h >= 12 && h < 18) return "下午好";
  if (h >= 18 && h < 24) return "晚上好";
  return "凌晨好";
}
