"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDocumentStatus, type DocumentItem } from "@/lib/api";
import { soundEngine } from "@/lib/audio/SoundEngine";

/* ------------------------------------------------------------------ */
/*  Stage definitions                                                  */
/* ------------------------------------------------------------------ */

interface StageDef {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const STAGES: StageDef[] = [
  { key: "uploaded",   label: "注入样本",   icon: "🧪", color: "#3b82f6", description: "样本已注入反应舱" },
  { key: "parsing",    label: "文本解构",   icon: "📄", color: "#6366f1", description: "正在解构文档结构，提取文本分子…" },
  { key: "extracting", label: "知识萃取",   icon: "🧬", color: "#a855f7", description: "AI 正在从文本中萃取知识实体与关联…" },
  { key: "completed",  label: "萃取完成",   icon: "✨", color: "#22c55e", description: "知识已结晶并写入图谱" },
  { key: "failed",     label: "实验中断",   icon: "⚠️",  color: "#ef4444", description: "处理过程中发生异常" },
];

const STAGE_MAP: Record<string, number> = {
  uploaded: 0, parsing: 1, extracting: 2, completed: 3, awaiting_confirmation: 3, failed: -1,
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  docId: string;
  filename: string;
  onComplete: () => void;
  onDuplicateDetected?: (duplicates: DuplicateWarning[]) => void;
}

interface DuplicateWarning {
  new_name: string;
  existing_name: string;
  existing_id: string;
  similarity: number;
  is_exact: boolean;
}

/* ------------------------------------------------------------------ */
/*  Particle helpers                                                   */
/* ------------------------------------------------------------------ */

const PARTICLE_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#22c55e", "#f59e0b", "#ef4444"];

function randomParticle(baseColor: string) {
  const hue = parseInt(baseColor.slice(1, 3), 16);
  return {
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 2 + Math.random() * 4,
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    delay: Math.random() * 2,
    duration: 1.5 + Math.random() * 3,
    drift: (Math.random() - 0.5) * 60,
  };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ProcessingChamber({ docId, filename, onComplete, onDuplicateDetected }: Props) {
  const [status, setStatus] = useState<string>("uploaded");
  const [stageIdx, setStageIdx] = useState(0);
  const [particles] = useState(() => Array.from({ length: 18 }, () => randomParticle("#3b82f6")));
  const prevStage = useRef("uploaded");
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  /* ---- Poll document status ---- */
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const doc: DocumentItem = await getDocumentStatus(docId);
        if (cancelled) return;

        if (doc.status !== prevStage.current) {
          prevStage.current = doc.status;
          setStatus(doc.status);
          const idx = STAGE_MAP[doc.status] ?? 0;
          setStageIdx(idx >= 0 ? idx : 4);

          // sound effects
          if (doc.status === "parsing") soundEngine.play("connect");
          else if (doc.status === "extracting") soundEngine.play("insight");
          else if (doc.status === "completed") soundEngine.play("achievement");
          else if (doc.status === "failed") soundEngine.play("error");
          else if (doc.status === "awaiting_confirmation") soundEngine.play("insight");
        }

        if (doc.status === "awaiting_confirmation") {
          const dups = doc.duplicate_info || doc.extraction_result?.duplicate_warnings || [];
          if (dups.length > 0 && onDuplicateDetected) {
            onDuplicateDetected(dups);
          }
          return; // stop polling, wait for user action
        }

        if (doc.status === "completed" || doc.status === "failed") {
          // Let the completion animation play before calling onComplete
          setTimeout(() => { if (!cancelled) onComplete(); }, 1800);
          return; // stop polling
        }
      } catch {
        // keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDone = status === "completed";
  const isFailed = status === "failed";
  const activeStage = isFailed ? STAGES[4] : STAGES[stageIdx];
  const progressPct = isFailed ? 100 : isDone ? 100 : stageIdx * 33 + (status === "extracting" ? 16 : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className="glass-dark relative overflow-hidden rounded-2xl p-5"
      style={{ minHeight: 240 }}
    >
      {/* ---- Ambient glow ---- */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        animate={{
          boxShadow: isDone
            ? `inset 0 0 80px ${activeStage.color}33, 0 0 40px ${activeStage.color}22`
            : isFailed
              ? `inset 0 0 60px ${activeStage.color}22`
              : `inset 0 0 40px ${activeStage.color}15`,
        }}
        transition={{ duration: 0.8 }}
      />

      {/* ---- Background particles ---- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <AnimatePresence>
          {!isDone && !isFailed && (
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {particles.map((p, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: p.size, height: p.size,
                    left: `${p.x}%`, top: `${p.y}%`,
                    backgroundColor: p.color,
                    filter: "blur(1px)",
                  }}
                  animate={{
                    y: [0, -40 - p.drift, 0],
                    x: [0, p.drift / 2, 0],
                    opacity: [0.3, 0.9, 0.3],
                    scale: [1, 1.6, 1],
                  }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---- Main content ---- */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* Stage icon with orbit */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* Orbit ring */}
          <AnimatePresence mode="wait">
            {!isDone && !isFailed && (
              <motion.div
                key="orbit"
                initial={{ opacity: 0, rotate: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-2 border-dashed"
                style={{ borderColor: activeStage.color + "44" }}
              />
            )}
          </AnimatePresence>

          {/* Center icon */}
          <motion.div
            key={activeStage.icon + status}
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="relative z-10 text-4xl"
          >
            {isDone ? "✨" : isFailed ? "⚠️" : activeStage.icon}
          </motion.div>

          {/* Completion burst */}
          {isDone && (
            <>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={`burst-${i}`}
                  className="absolute rounded-full"
                  style={{
                    width: 6, height: 6,
                    backgroundColor: ["#fbbf24", "#22c55e", "#3b82f6", "#a855f7"][i % 4],
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                  animate={{
                    x: Math.cos((i / 8) * Math.PI * 2) * 45,
                    y: Math.sin((i / 8) * Math.PI * 2) * 45,
                    opacity: 0,
                    scale: 1.5,
                  }}
                  transition={{ duration: 0.7, delay: i * 0.04, ease: "easeOut" }}
                />
              ))}
            </>
          )}
        </div>

        {/* Stage label & description */}
        <div className="text-center">
          <motion.h3
            key={activeStage.label}
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-base font-bold text-white"
          >
            {activeStage.label}
          </motion.h3>
          <motion.p
            key={activeStage.description}
            initial={{ y: 4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-1 text-xs text-black"
          >
            {activeStage.description}
          </motion.p>
        </div>

        {/* Sample label */}
        <div className="rounded-full border border-gray-700 bg-gray-800/60 px-3 py-1 text-[11px] text-black">
          <span className="text-gray-700">样本:</span>{" "}
          <span className="text-gray-800 font-mono">{filename}</span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: activeStage.color }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        {/* Stage dots */}
        <div className="flex items-center gap-2">
          {STAGES.slice(0, 4).map((s, i) => {
            const reached = isFailed ? i <= 2 : i <= stageIdx;
            const current = i === stageIdx && !isDone && !isFailed;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <motion.div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
                  style={{
                    backgroundColor: reached ? s.color : "transparent",
                    border: reached ? "none" : "1px solid #374151",
                  }}
                  animate={current ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  title={s.label}
                >
                  <span className={reached ? "text-white" : "text-black"}>
                    {i + 1}
                  </span>
                </motion.div>
                {i < 3 && (
                  <div className="h-px w-6 rounded" style={{
                    backgroundColor: reached && i < stageIdx ? STAGES[i + 1].color + "88" : "#374151",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
