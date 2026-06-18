"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

const PARTICLE_COLORS = ["#9A8C73", "#DBC7B5", "#F4F1EE", "#8C7D70", "#C4A882"];

export default function BackButton() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const spawnParticles = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    for (let i = 0; i < 24; i++) {
      const p = document.createElement("span");
      const angle = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.6;
      const dist = 22 + Math.random() * 42;
      const size = 3 + Math.random() * 5;
      const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      const dur = 420 + Math.random() * 380;

      p.style.cssText = `
        position:absolute; left:${cx}px; top:${cy}px;
        width:${size}px; height:${size}px; border-radius:50%;
        background:${color}; pointer-events:none;
        transform:translate(-50%,-50%);
        animation:particle-burst ${dur}ms ease-out forwards;
        --dx:${Math.cos(angle) * dist}px; --dy:${Math.sin(angle) * dist}px;
      `;
      container.appendChild(p);
      setTimeout(() => p.remove(), dur);
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      spawnParticles(e);
      setTimeout(() => router.back(), 120);
    },
    [router, spawnParticles],
  );

  return (
    <div ref={containerRef} className="pointer-events-none fixed top-4 left-4 z-50">
      <button
        onClick={handleClick}
        aria-label="返回"
        className="pointer-events-auto group relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#DBC7B5]/40 bg-[#F4F1EE]/90 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9A8C73]/50 hover:shadow-lg hover:shadow-[#9A8C73]/25 active:scale-90"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <svg
          className="h-4 w-4 text-[#6B5D50] transition-transform duration-200 group-hover:-translate-x-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {/* Hover glow ring */}
        <span
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ boxShadow: "0 0 14px 3px rgba(154,140,115,0.35)" }}
        />
      </button>
    </div>
  );
}
