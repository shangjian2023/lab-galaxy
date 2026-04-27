"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Props {
  active: boolean;
  /** Array of [x1,y1,x2,y2] segments to draw energy flow along */
  edges?: Array<[number, number, number, number]>;
}

/**
 * Canvas-based particle effect for insight moments.
 * Draws flowing energy particles along graph edges.
 */
export default function ParticleCanvas({ active, edges = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = () => {
      if (!active || edges.length === 0) return;
      // Pick a random edge and spawn a particle along it
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const [x1, y1, x2, y2] = edge;
      const t = Math.random() * 0.3; // Start near beginning
      particlesRef.current.push({
        x: x1 + (x2 - x1) * t,
        y: y1 + (y2 - y1) * t,
        vx: (x2 - x1) * 0.008,
        vy: (y2 - y1) * 0.008,
        life: 1,
        maxLife: 60 + Math.random() * 40,
        size: 1.5 + Math.random() * 2,
        color: Math.random() > 0.5 ? "#f97316" : "#fbbf24",
      });
    };

    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (active) {
        // Spawn new particles
        for (let i = 0; i < 2; i++) spawn();

        // Draw edge glow lines
        ctx.globalCompositeOperation = "lighter";
        for (const [x1, y1, x2, y2] of edges) {
          const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
          gradient.addColorStop(0, "rgba(249, 115, 22, 0.05)");
          gradient.addColorStop(0.5, "rgba(249, 115, 22, 0.15)");
          gradient.addColorStop(1, "rgba(249, 115, 22, 0.05)");
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Update and draw particles
        particlesRef.current = particlesRef.current.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.life += 1;
          if (p.life >= p.maxLife) return false;

          const alpha = 1 - p.life / p.maxLife;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color.replace(")", `, ${alpha})`).replace("rgb", "rgba").replace("#f97316", `rgba(249,115,22,${alpha})`).replace("#fbbf24", `rgba(251,191,36,${alpha})`);
          // Simpler approach
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.globalAlpha = 1;

          return true;
        });

        ctx.globalCompositeOperation = "source-over";
      } else {
        particlesRef.current = [];
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, [active, edges]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-20"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
