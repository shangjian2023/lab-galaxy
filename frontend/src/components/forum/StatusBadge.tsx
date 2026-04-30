const STATUS_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  open: { label: "开放", color: "#10b981", bgColor: "bg-green-50 ring-green-200/40" },
  resolved: { label: "已解决", color: "#3b82f6", bgColor: "bg-blue-50 ring-blue-200/40" },
  locked: { label: "已锁定", color: "#6b7280", bgColor: "bg-gray-50 ring-gray-200/40" },
  featured: { label: "精华", color: "#f59e0b", bgColor: "bg-amber-50 ring-amber-200/40" },
};

export function getStatusInfo(status: string) {
  return STATUS_MAP[status] || { label: status, color: "#6b7280", bgColor: "bg-gray-50 ring-gray-200/40" };
}
