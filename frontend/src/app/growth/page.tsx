"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getMyGrowth, type GrowthInfo } from "@/lib/api";
import LevelBadge from "@/components/growth/LevelBadge";

export default function GrowthPage() {
  const [data, setData] = useState<GrowthInfo | null>(null);

  useEffect(() => {
    getMyGrowth().then(setData);
  }, []);

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-black">加载中...</div>;
  }

  const { level, level_config, points_rules, recent_points } = data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
      {/* Profile card */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <LevelBadge
            level={level.level}
            icon={level.icon}
            frame={level.frame}
            nickname={data.nickname}
            avatar={data.avatar}
            points={data.points}
            size="lg"
          />
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-800">{data.points}</p>
            <p className="text-sm text-gray-700">成长值</p>
          </div>
        </div>

        {/* Progress bar */}
        {level.next_level_points && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-black">
              <span>VIP{level.level} {level.title}</span>
              <span>{level.next_level_points - data.points} 分升下一级</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <motion.div
                className="h-full rounded-full bg-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${level.progress * 100}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Level roadmap */}
      <div className="glass-card p-6">
        <h2 className="mb-4 text-lg font-bold">等级路线图</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {level_config.map((l) => {
            const isCurrent = l.level === level.level;
            const isUnlocked = data.points >= l.points;
            return (
              <div
                key={l.level}
                className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${
                  isCurrent ? "border-orange-400 bg-orange-50/60" : isUnlocked ? "border-green-200 bg-green-50/60" : "border-gray-100 bg-white/40"
                }`}
              >
                <span className="text-lg">{l.icon}</span>
                <span className="mt-1 text-[10px] font-bold">VIP{l.level}</span>
                <span className="text-[9px] text-gray-700">{l.title}</span>
                <span className="mt-1 text-[9px] text-black">{l.points}分</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Points rules */}
      <div className="glass-card p-6">
        <h2 className="mb-4 text-lg font-bold">成长值获取</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(points_rules).map(([key, val]) => (
            <div key={key} className="glass-button flex items-center justify-between px-3 py-2">
              <span className="text-xs text-black">{RULE_LABELS[key] || key}</span>
              <span className="text-sm font-bold text-orange-600">+{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent points */}
      <div className="glass-card p-6">
        <h2 className="mb-4 text-lg font-bold">最近积分变动</h2>
        {recent_points.length === 0 ? (
          <p className="text-sm text-black">暂无记录</p>
        ) : (
          <div className="space-y-2">
            {recent_points.map((p, i) => (
              <div key={i} className="glass-table-row flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-black">{p.reason}</span>
                <span className="font-bold text-orange-600">+{p.change}</span>
                <span className="text-xs text-black">{new Date(p.created_at).toLocaleDateString("zh-CN")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const RULE_LABELS: Record<string, string> = {
  // 内容贡献
  upload_doc: "上传实验资料",
  ai_parse_complete: "AI 解析完成",
  publish_template: "发布模板",
  template_adopted: "模板被收藏",
  comment_liked: "回复被点赞",
  // 活跃 / 参与
  login_daily: "每日登录",
  ai_query: "AI 智能问答",
  // 论坛 / 团队
  forum_post: "论坛发帖",
  forum_reply: "论坛回复",
  forum_featured: "帖子被加精",
  forum_best_answer: "回答被采纳",
  forum_vote_established: "发起团队投票达多数",
  thread_create: "发布系统公告",
};
