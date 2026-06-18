"use client";

import { useEffect, useState } from "react";
import { getTeamGrowth } from "@/lib/api";
import type { GrowthTimelineResponse } from "@/lib/api";

interface Props {
  teamId: string;
}

export default function GrowthTimeline({ teamId }: Props) {
  const [data, setData] = useState<GrowthTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeamGrowth(teamId)
      .then(setData)
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="p-6 text-sm text-[#6B5D50]">加载中...</div>;
  if (error && !data) return <div className="p-6 text-sm text-red-500">{error}</div>;
  if (!data) return null;

  const { timeline, summary } = data;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 border-b border-black/5 p-3">
        <SummaryCard label="文档总数" value={summary.total_documents} icon="📄" />
        <SummaryCard label="成果数量" value={summary.total_achievements} icon="🏆" />
        <SummaryCard label="知识实体" value={summary.unique_entities} icon="🔗" />
        <SummaryCard label="团队成员" value={summary.members.length} icon="👥" />
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-3">
        {timeline.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6B5D50]">暂无成长记录</p>
        ) : (
          <div className="relative pl-5">
            {/* Vertical line */}
            <div className="absolute left-1.5 top-1 bottom-0 w-0.5 bg-gradient-to-b from-[#9A8C73]/50 to-[#DBC7B5]/30" />

            {timeline.map((entry, i) => (
              <div key={i} className="relative mb-3 last:mb-0">
                {/* Dot */}
                <div
                  className={`absolute -left-[14px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#F4F1EE] shadow-sm ${
                    entry.type === "achievement" ? "bg-amber-400" : "bg-[#9A8C73]"
                  }`}
                />

                <div className="liquid-glass-compact p-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        entry.type === "achievement" ? "bg-amber-50 text-amber-700" : "bg-[#DBC7B5]/40 text-[#6B5D50]"
                      }`}
                    >
                      {entry.type === "achievement" ? entry.achievement_type || "成果" : "文档"}
                    </span>
                    <span className="text-[11px] text-[#6B5D50]">{entry.user_nickname}</span>
                    {entry.date && (
                      <span className="ml-auto text-[10px] text-[#6B5D50]">
                        {new Date(entry.date).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-[#492D22]">{entry.title}</p>
                  {entry.details && <p className="mt-0.5 text-[11px] text-[#6B5D50]">{entry.details}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="liquid-glass-compact flex items-center gap-2 px-2.5 py-2 transition-all duration-200 hover:-translate-y-0.5">
      <span className="text-base">{icon}</span>
      <div className="min-w-0">
        <p className="text-base font-bold leading-tight text-[#492D22]">{value}</p>
        <p className="truncate text-[10px] text-[#6B5D50]">{label}</p>
      </div>
    </div>
  );
}
