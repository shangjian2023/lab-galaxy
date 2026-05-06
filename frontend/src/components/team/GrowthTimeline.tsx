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

  if (loading) return <div className="p-6 text-black">加载中...</div>;
  if (error && !data) return <div className="p-6 text-red-400">{error}</div>;
  if (!data) return null;

  const { timeline, summary } = data;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary cards */}
      <div className="flex gap-3 border-b border-gray-100 bg-white p-4">
        <SummaryCard label="文档总数" value={summary.total_documents} icon="📄" />
        <SummaryCard label="成果数量" value={summary.total_achievements} icon="🏆" />
        <SummaryCard label="知识实体" value={summary.unique_entities} icon="🔗" />
        <SummaryCard label="团队成员" value={summary.members.length} icon="👥" />
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        {timeline.length === 0 ? (
          <p className="py-8 text-center text-sm text-black">暂无成长记录</p>
        ) : (
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-orange-300 to-gray-200" />

            {timeline.map((entry, i) => (
              <div key={i} className="relative mb-4 last:mb-0">
                {/* Dot */}
                <div className={`absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-white shadow ${
                  entry.type === "achievement" ? "bg-amber-400" : "bg-blue-400"
                }`} />

                <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                      entry.type === "achievement"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700"
                    }`}>
                      {entry.type === "achievement"
                        ? entry.achievement_type || "成果"
                        : "文档"}
                    </span>
                    <span className="text-xs text-black">{entry.user_nickname}</span>
                    {entry.date && (
                      <span className="ml-auto text-xs text-black">
                        {new Date(entry.date).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-800">{entry.title}</p>
                  {entry.details && (
                    <p className="mt-1 text-xs text-gray-700">{entry.details}</p>
                  )}
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
    <div className="flex flex-1 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-lg font-bold text-gray-800">{value}</p>
        <p className="text-xs text-gray-700">{label}</p>
      </div>
    </div>
  );
}
