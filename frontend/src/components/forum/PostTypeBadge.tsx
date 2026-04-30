const BOARD_MAP: Record<string, { label: string; icon: string; color: string }> = {
  methodology: { label: "方法论堂", icon: "🔬", color: "#3b82f6" },
  graph_hall: { label: "图谱议事厅", icon: "🗺️", color: "#8b5cf6" },
  emergency_room: { label: "实验急诊室", icon: "🏥", color: "#ef4444" },
  aha_square: { label: "Aha! 广场", icon: "💡", color: "#f59e0b" },
  cross_discipline: { label: "学科撞车现场", icon: "💥", color: "#10b981" },
  announcements: { label: "公告堂", icon: "📢", color: "#6b7280" },
};

const POST_TYPE_MAP: Record<string, { label: string; color: string }> = {
  regular: { label: "讨论", color: "#6b7280" },
  insight: { label: "发现", color: "#f59e0b" },
  prediction: { label: "预测", color: "#3b82f6" },
  challenge: { label: "挑战", color: "#ef4444" },
  "exchange-diary": { label: "交换日记", color: "#8b5cf6" },
  "cold-knowledge": { label: "冷知识", color: "#10b981" },
};

export function getBoardInfo(slug: string) {
  return BOARD_MAP[slug] || { label: slug, icon: "📋", color: "#6b7280" };
}

export function getPostTypeInfo(type: string) {
  return POST_TYPE_MAP[type] || { label: type, color: "#6b7280" };
}
