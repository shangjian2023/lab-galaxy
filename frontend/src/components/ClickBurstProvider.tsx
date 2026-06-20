"use client";

import { useEffect, useRef } from "react";

/**
 * Global click burst provider — adds particle burst effect to ALL clickable
 * buttons and links across the entire app. Uses a single document-level click
 * listener, so zero changes needed in any component.
 *
 * Particles use the brand palette and auto-clean after ~600ms.
 */

const COLORS = ["#9A8C73", "#DBC7B5", "#F4F1EE", "#8C7D70", "#C4A882"];

export default function ClickBurstProvider() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only burst on actual buttons / links / role=button elements
      const clickable = target.closest("button, a[href], [role='button'], [data-burst]");
      if (!clickable) return;

      // Skip if the element is disabled
      if ((clickable as HTMLElement).hasAttribute("disabled")) return;

      const container = containerRef.current;
      if (!container) return;

      // Fewer particles for smaller elements (icon buttons)
      const rect = clickable.getBoundingClientRect();
      const count = rect.width < 40 ? 10 : 18;

      for (let i = 0; i < count; i++) {
        const p = document.createElement("span");
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const dist = 15 + Math.random() * 30;
        const size = 2 + Math.random() * 4;
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const dur = 350 + Math.random() * 250;

        p.style.cssText = `
          position:fixed; left:${e.clientX}px; top:${e.clientY}px;
          width:${size}px; height:${size}px; border-radius:50%;
          background:${color}; pointer-events:none;
          transform:translate(-50%,-50%);
          animation:particle-burst ${dur}ms ease-out forwards;
          --dx:${Math.cos(angle) * dist}px; --dy:${Math.sin(angle) * dist}px;
        `;
        container.appendChild(p);
        setTimeout(() => p.remove(), dur);
      }
    };

    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return <div ref={containerRef} className="pointer-events-none fixed inset-0 z-[9999]" />;
}
