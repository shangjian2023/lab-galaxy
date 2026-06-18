"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { getDashboard, getFeaturedFeed, type DashboardData, type FeaturedItem } from "@/lib/api";

// ── Feature modules ──
const MODULES = [
  {
    label: "知识图谱",
    href: "/graph",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <circle cx={6} cy={6} r={3} /><circle cx={18} cy={6} r={3} /><circle cx={6} cy={18} r={3} /><circle cx={18} cy={18} r={3} />
        <line x1={8.5} y1={7.5} x2={15.5} y2={7.5} /><line x1={8.5} y1={16.5} x2={15.5} y2={16.5} /><line x1={6} y1={9} x2={6} y2={15} /><line x1={18} y1={9} x2={18} y2={15} />
      </svg>
    ),
    desc: "AI 抽取实体关系，可视化知识网络",
    gradient: "from-[#9A8C73]/10 to-[#9A8C73]/5",
    iconBg: "bg-[#9A8C73]/15",
  },
  {
    label: "工作台",
    href: "/workbench",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <rect x={2} y={3} width={20} height={14} rx={2} /><line x1={8} y1={21} x2={16} y2={21} /><line x1={12} y1={17} x2={12} y2={21} />
      </svg>
    ),
    desc: "文档管理与知识沉淀中心",
    gradient: "from-[#8C7D70]/10 to-[#8C7D70]/5",
    iconBg: "bg-[#8C7D70]/15",
  },
  {
    label: "上传文档",
    href: "/documents",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <path d="M12 16V4m0 0l-4 4m4-4l4 4" /><path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" />
      </svg>
    ),
    desc: "支持 PDF、DOCX、PPTX 格式",
    gradient: "from-[#7D6F62]/10 to-[#7D6F62]/5",
    iconBg: "bg-[#7D6F62]/15",
  },
  {
    label: "知识发酵池",
    href: "/forum",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
    desc: "社区讨论、灵感碰撞与知识共享",
    gradient: "from-[#9A8C73]/10 to-[#8C7D70]/5",
    iconBg: "bg-[#9A8C73]/15",
  },
  {
    label: "模板市场",
    href: "/templates",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <rect x={3} y={3} width={7} height={7} rx={1} /><rect x={14} y={3} width={7} height={7} rx={1} /><rect x={3} y={14} width={7} height={7} rx={1} /><rect x={14} y={14} width={7} height={7} rx={1} />
      </svg>
    ),
    desc: "实验报告模板，一键套用高效产出",
    gradient: "from-[#6B5D50]/10 to-[#6B5D50]/5",
    iconBg: "bg-[#6B5D50]/15",
  },
  {
    label: "团队空间",
    href: "/team",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx={9} cy={7} r={4} /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    desc: "协作编辑、知识共建与传承",
    gradient: "from-[#8C7D70]/10 to-[#9A8C73]/5",
    iconBg: "bg-[#8C7D70]/15",
  },
];

// ── Featured dynamics feed ──
const CAROUSEL_INTERVAL = 5000;

function useFeaturedFeed() {
  const [items, setItems] = useState<FeaturedItem[]>([]);
  useEffect(() => {
    getFeaturedFeed().then((res) => setItems(res.items)).catch(() => {});
  }, []);
  return items;
}

function FeaturedCarousel() {
  const items = useFeaturedFeed();
  const [idx, setIdx] = useState(0);

  const next = useCallback(() => setIdx((i) => (items.length ? (i + 1) % items.length : 0)), [items.length]);

  useEffect(() => {
    if (!items.length) return;
    const t = setInterval(next, CAROUSEL_INTERVAL);
    return () => clearInterval(t);
  }, [items.length, next]);

  if (!items.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-[#DBC7B5]/40 bg-[#F4F1EE]/60">
        <p className="text-sm text-[#6B5D50]">暂无精选内容，去 <Link href="/forum" className="text-[#9A8C73] hover:underline">知识发酵池</Link> 发一帖吧</p>
      </div>
    );
  }

  const cur = items[idx];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#DBC7B5]/40 bg-[#F4F1EE]/60">
      <div className="relative h-72">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center"
          >
            {cur.image_url && (
              <img src={cur.image_url} alt="" className="mb-3 h-24 w-24 rounded-xl object-cover shadow-md" />
            )}
            <span className="mb-2 rounded-full bg-[#9A8C73]/15 px-2.5 py-0.5 text-[10px] font-medium text-[#9A8C73]">
              {cur.badge}
            </span>
            <h3 className="relative mb-1 line-clamp-2 text-2xl font-bold text-[#8C3232]">
              {cur.title}
              <span className="absolute inset-0 pointer-events-none overflow-hidden" style={{
                background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
                animation: "shimmer 8s ease-in-out infinite",
              }} />
            </h3>
            {cur.subtitle && <p className="mt-1 text-sm text-[#6B5D50]">{cur.subtitle}</p>}
            <Link href={cur.href} className="mt-3 rounded-lg bg-[#9A8C73] px-4 py-1.5 text-xs font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-[#8C7D70]">
              {cur.type === "equipment" ? "去借用" : "查看详情"}
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === idx ? "w-4 bg-[#9A8C73]" : "w-1.5 bg-[#DBC7B5]/50 hover:bg-[#9A8C73]/40"
            }`}
          />
        ))}
      </div>

      {/* Arrows */}
      <button
        onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-[#F4F1EE]/80 p-1 text-[#6B5D50] opacity-0 shadow-sm transition-opacity hover:bg-[#F4F1EE] group-hover:opacity-100"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      </button>
      <button
        onClick={() => setIdx((i) => (i + 1) % items.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#F4F1EE]/80 p-1 text-[#6B5D50] opacity-0 shadow-sm transition-opacity hover:bg-[#F4F1EE] group-hover:opacity-100"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}

// ── Stats card ──
function StatCard({ label, value, href, suffix }: { label: string; value: number | string; href: string; suffix?: string }) {
  return (
    <Link href={href} className="group flex flex-col rounded-xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/70 p-4 transition-all hover:border-[#9A8C73]/40 hover:bg-[#F4F1EE] hover:shadow-md hover:shadow-[#9A8C73]/5">
      <span className="text-xs text-[#6B5D50]">{label}</span>
      <span className="mt-1 text-2xl font-bold text-[#4a3e34]">
        {value}<span className="text-sm font-normal text-[#6B5D50]">{suffix}</span>
      </span>
    </Link>
  );
}

// ── Main page ──
export default function Home() {
  const { user, loading } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (user) getDashboard().then(setDashboard).catch(() => {});
  }, [user]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-[#4a3e34]">加载中...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-[calc(100vh-53px)] flex-col items-center justify-center px-6" style={{ background: "#9A8C73" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h1 className="mb-3 text-5xl font-bold text-white drop-shadow-lg">
            创新实验知识图谱平台首页
          </h1>
          <p className="mb-2 text-xl text-white/90">AI 驱动的实验知识管理与发现</p>
          <p className="mb-10 text-sm text-white/70">上传实验文档，AI 自动抽取知识实体，构建关联图谱，让隐性知识显性化</p>
          <div className="flex justify-center gap-4">
            <Link href="/login" className="rounded-xl bg-white px-8 py-3 text-sm font-bold text-[#6B5D50] shadow-lg transition-all hover:bg-[#F4F1EE] hover:shadow-xl hover:-translate-y-0.5">
              登录
            </Link>
            <Link href="/register" className="rounded-xl border-2 border-white/60 bg-transparent px-8 py-3 text-sm font-bold text-white transition-all hover:bg-white/10 hover:border-white hover:-translate-y-0.5">
              注册
            </Link>
          </div>
        </motion.div>
      </main>
    );
  }

  const stats = dashboard?.stats ?? { document_count: 0, template_count: 0, points: user.points, level: user.level };
  const recentDocs = dashboard?.recent_documents ?? [];
  const recentPoints = dashboard?.recent_points ?? [];

  return (
    <main className="mx-auto max-w-7xl px-6 pb-12 pt-8">
      {/* Hero section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/80 p-8" style={{ backdropFilter: "blur(12px)" }}>
          <p className="mb-1 text-sm font-medium">
            <span className="text-[#8C3232]">欢迎回来，</span>
            <span className="relative inline-block">
              <span className="text-2xl font-bold text-[#8C3232]">{user.nickname || user.username}</span>
              <span className="absolute inset-0 pointer-events-none overflow-hidden" style={{
                background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%)",
                animation: "shimmer 8s ease-in-out infinite",
              }} />
            </span>
            <span className="ml-2 inline-flex items-center rounded-full bg-[#8C3232]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#8C3232]">
              Lv.{stats.level}
            </span>
          </p>
          <h1 className="text-3xl font-bold text-[#8C3232]">
            让每一份实验知识，都有迹可循
          </h1>
          <p className="mt-2 text-sm text-[#6B5D50]">
            告别碎片化笔记与遗忘的实验细节——AI 自动解析文档、抽取知识实体、构建关系图谱，让你的知识沉淀为可搜索、可关联、可复用的知识网络
          </p>
        </div>
      </motion.section>

      {/* Stats row */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatCard label="我的文档" value={stats.document_count} href="/documents" />
        <StatCard label="我的模板" value={stats.template_count} href="/templates" />
        <StatCard label="成长值" value={stats.points} href="/growth" />
        <StatCard label="当前等级" value={stats.level} href="/growth" suffix=" 级" />
      </motion.section>

      {/* Feature modules + featured carousel — original 2+1 grid, carousel taller & prominent */}
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {MODULES.map((m, i) => (
            <Link
              key={m.label}
              href={m.href}
              className={`group relative overflow-hidden rounded-xl border border-[#DBC7B5]/30 bg-gradient-to-br ${m.gradient} p-5 transition-all hover:border-[#9A8C73]/40 hover:shadow-lg hover:shadow-[#9A8C73]/5 hover:-translate-y-0.5`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${m.iconBg}`}>
                {m.icon}
              </div>
              <h3 className="text-sm font-bold text-[#8C3232] group-hover:text-[#6B2020] transition-colors">
                {m.label}
              </h3>
              <p className="mt-1 text-[11px] text-[#6B5D50] line-clamp-2">{m.desc}</p>
            </Link>
          ))}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-[#4a3e34]">✨ 精选动态</h2>
            <Link href="/forum" className="text-[11px] text-[#9A8C73] hover:underline">查看全部 →</Link>
          </div>
          <FeaturedCarousel />
        </motion.section>
      </div>

      {/* Recent docs + points */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="grid gap-6 lg:grid-cols-2"
      >
        {/* Recent documents */}
        <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/70 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#4a3e34]">最近文档</h2>
            <Link href="/documents" className="text-[11px] text-[#9A8C73] hover:underline">查看全部 →</Link>
          </div>
          {!recentDocs.length ? (
            <p className="text-sm text-[#6B5D50]">暂无文档，去<Link href="/documents" className="text-[#9A8C73] hover:underline">上传</Link>吧</p>
          ) : (
            <div className="space-y-2">
              {recentDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg bg-[#DBC7B5]/20 px-3 py-2.5 transition-colors hover:bg-[#DBC7B5]/30">
                  <span className="truncate text-sm text-[#4a3e34] max-w-[200px]">{doc.title}</span>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    doc.status === "completed" ? "bg-green-100/60 text-green-700" :
                    doc.status === "failed" ? "bg-red-100/60 text-red-700" :
                    "bg-[#9A8C73]/15 text-[#6B5D50]"
                  }`}>
                    {doc.status === "completed" ? "已完成" : doc.status === "failed" ? "失败" : doc.status === "parsing" ? "解析中" : doc.status === "extracting" ? "萃取中" : doc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent points */}
        <div className="rounded-2xl border border-[#DBC7B5]/30 bg-[#F4F1EE]/70 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#4a3e34]">成长记录</h2>
            <Link href="/growth" className="text-[11px] text-[#9A8C73] hover:underline">查看全部 →</Link>
          </div>
          {!recentPoints.length ? (
            <p className="text-sm text-[#6B5D50]">暂无积分记录</p>
          ) : (
            <div className="space-y-2">
              {recentPoints.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-[#DBC7B5]/20 px-3 py-2.5 transition-colors hover:bg-[#DBC7B5]/30">
                  <span className="text-sm text-[#4a3e34]">{p.reason}</span>
                  <span className="font-bold text-[#9A8C73]">+{p.change}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.section>
    </main>
  );
}
