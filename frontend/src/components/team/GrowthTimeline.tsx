"use client";

import { useEffect, useState } from "react";
import { getTeamGrowth, requestAIGrowthAnalysis } from "@/lib/api";
import type { GrowthTimelineResponse, AIGrowthAnalysis } from "@/lib/api";

interface Props {
  teamId: string;
}

export default function GrowthTimeline({ teamId }: Props) {
  const [data, setData] = useState<GrowthTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AIGrowthAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeamGrowth(teamId)
      .then(setData)
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }, [teamId]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await requestAIGrowthAnalysis(teamId);
      setAnalysis(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-600">加载中...</div>;
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

      {/* AI Analysis */}
      <div className="border-b border-gray-100 bg-white p-4">
        {!analysis ? (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {analyzing ? "AI 分析中..." : "🤖 AI 成长分析"}
          </button>
        ) : (
          <AnalysisCard analysis={analysis} />
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        {timeline.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-600">暂无成长记录</p>
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
                    <span className="text-xs text-gray-600">{entry.user_nickname}</span>
                    {entry.date && (
                      <span className="ml-auto text-xs text-gray-600">
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

function AnalysisCard({ analysis }: { analysis: AIGrowthAnalysis }) {
  const scoreColor =
    analysis.score >= 85 ? "text-green-600" :
    analysis.score >= 70 ? "text-blue-600" :
    analysis.score >= 60 ? "text-amber-600" : "text-red-500";

  return (
    <div className="rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="relative h-14 w-14">
          <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="#e5e7eb" strokeWidth="4" />
            <circle
              cx="28" cy="28" r="24" fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={`${(analysis.score / 100) * 150.8} 150.8`}
              strokeLinecap="round"
              className={scoreColor}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${scoreColor}`}>
            {analysis.score}
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">成长评分</p>
          <p className="text-xs text-gray-700">AI 基于团队数据综合评估</p>
        </div>
      </div>

      <p className="mb-3 text-sm text-gray-700">{analysis.summary}</p>

      {analysis.strengths.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-green-700">优势</p>
          <ul className="space-y-0.5">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="text-xs text-gray-600">• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.weaknesses.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-amber-700">待提升</p>
          <ul className="space-y-0.5">
            {analysis.weaknesses.map((w, i) => (
              <li key={i} className="text-xs text-gray-600">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.suggestions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-blue-700">建议</p>
          <ul className="space-y-0.5">
            {analysis.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-gray-600">• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.quota && (
        <p className="mt-3 text-xs text-gray-600">
          本月剩余 {analysis.quota.remaining}/{analysis.quota.limit} 次
        </p>
      )}
    </div>
  );
}
