"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ParticleCanvas from "./ParticleCanvas";
import type { InsightEvent } from "@/lib/api";

export type { InsightEvent };

interface Props {
  insight: InsightEvent | null;
  onDismiss: () => void;
  animationIntensity: number; // 0-1
}

/**
 * Full-screen insight overlay — the "aha moment" effect.
 * Dark background, glowing prompt, particle energy flow.
 */
export default function InsightOverlay({ insight, onDismiss, animationIntensity }: Props) {
  const [phase, setPhase] = useState<string>("hidden");

  useEffect(() => {
    if (!insight) {
      setPhase("hidden");
      return;
    }

    // Phase timeline: darken → reveal → hold → fade
    setPhase("darken");
    const t1 = setTimeout(() => setPhase("reveal"), 400);
    const t2 = setTimeout(() => setPhase("fade"), 4000);
    const t3 = setTimeout(() => { setPhase("hidden"); onDismiss(); }, 5000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [insight, onDismiss]);

  const intensity = animationIntensity;

  return (
    <AnimatePresence>
      {insight && phase !== "hidden" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          style={{ pointerEvents: phase === "reveal" ? "auto" : "none" }}
          onClick={() => { setPhase("hidden"); onDismiss(); }}
        >
          {/* Dark overlay */}
          <motion.div
            className="absolute inset-0 bg-black"
            animate={{
              opacity: phase === "hidden" ? 0 : phase === "darken" ? 0.3 * animationIntensity : phase === "fade" ? 0.1 : 0.4 * animationIntensity,
            }}
            transition={{ duration: 0.5 }}
          />

          {/* Particle effect */}
          {phase === "reveal" && (
            <ParticleCanvas active={true} edges={[]} />
          )}

          {/* Central content */}
          <div className="relative z-10 flex h-full flex-col items-center justify-center">
            <AnimatePresence>
              {phase === "reveal" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ type: "spring", damping: 20, stiffness: 200 }}
                  className="max-w-lg text-center"
                >
                  {/* Glow ring */}
                  <motion.div
                    className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                    style={{
                      boxShadow: `0 0 ${40 * intensity}px ${20 * intensity}px rgba(249,115,22,0.3)`,
                    }}
                    animate={{
                      boxShadow: [
                        `0 0 ${40 * intensity}px ${20 * intensity}px rgba(249,115,22,0.3)`,
                        `0 0 ${60 * intensity}px ${30 * intensity}px rgba(249,115,22,0.5)`,
                        `0 0 ${40 * intensity}px ${20 * intensity}px rgba(249,115,22,0.3)`,
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <svg className="h-10 w-10 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </motion.div>

                  {/* Title */}
                  <motion.h2
                    className="mb-2 text-2xl font-bold text-white"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    {insight.title}
                  </motion.h2>

                  {/* Message */}
                  <motion.p
                    className="mb-6 text-base leading-relaxed text-orange-200"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    {insight.message}
                  </motion.p>

                  {/* Experiments involved */}
                  {insight.experiments.length > 0 && (
                    <motion.div
                      className="flex flex-wrap justify-center gap-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                    >
                      {insight.experiments.slice(0, 5).map((exp) => (
                        <span
                          key={exp.id}
                          className="rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-sm text-orange-200"
                        >
                          {exp.name || exp.id.slice(0, 8)}
                        </span>
                      ))}
                    </motion.div>
                  )}

                  {/* Dismiss hint */}
                  <motion.p
                    className="mt-6 text-xs text-white/30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                  >
                    点击任意处关闭
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
