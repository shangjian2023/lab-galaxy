"use client";

import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";

// ── Colors ──
const BODY_NORMAL = "#E3BD8D";
const BODY_FULL = "#E8C99E";
const EYE_COLOR = "#1a0e00";
const PUPIL_COLOR = "#fff";
const SCARED_WHITE = "#fff";

// ── Pixel art: 12x16 grid (pre-built rect data) ──
const BODY_PIXELS: [number, number][] = [
  [4, 0], [5, 0], [6, 0], [7, 0],
  [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
  [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2],
  [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3],
  [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
  [4, 5], [5, 5], [6, 5], [7, 5],
  [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
  [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7],
  [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8],
  [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9],
  [4, 10], [5, 10], [6, 10], [7, 10],
  [4, 11], [5, 11], [4, 12], [5, 12],
  [7, 11], [8, 11], [7, 12], [8, 12],
];

const SCARED_THRESHOLD = 1200;
const MAX_PUPIL_OFFSET = 1.0;
const MAX_PUPIL_DIST = 40;

// ── Pre-render body rects to a single path (one draw call instead of ~50) ──
const BODY_PATH = BODY_PIXELS.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("");

interface Props {
  isFullscreen: boolean;
  onToggle: () => void;
  scared?: boolean;
}

export default function PixelCharacter({ isFullscreen, onToggle, scared: externalScared }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [isScared, setIsScared] = useState(false);
  const [clipPath, setClipPath] = useState("inset(0% 0% 100% 0% round 2px)");
  const rafIdRef = useRef<number>(0);

  const scared = externalScared ?? isScared;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    mouseRef.current = { x, y };

    // Throttle to rAF to avoid setState on every pixel
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const scared = dist < SCARED_THRESHOLD;
      setIsScared(scared);
      setRenderTick((t) => t + 1);
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
    setIsScared(false);
    setRenderTick(0);
  }, []);

  // ── Pupil offset (pure calc from refs, no re-render cost) ──
  const pupilOffsets = (() => {
    if (!mouseRef.current || !wrapperRef.current) return { lx: 0, ly: 0, rx: 0, ry: 0 };
    const rect = wrapperRef.current.getBoundingClientRect();
    const scale = rect.width / 12;
    const mouse = mouseRef.current;

    function calcOffset(gridX: number): [number, number] {
      const ex = rect.left + (gridX + 0.5) * scale;
      const ey = rect.top + (2.5) * scale;
      const dx = mouse.x - ex;
      const dy = mouse.y - ey;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MAX_PUPIL_DIST) {
        const factor = (dist / MAX_PUPIL_DIST) * MAX_PUPIL_OFFSET;
        return [(dx / dist) * factor, (dy / dist) * factor];
      }
      return [0, 0];
    }

    const [ldx, ldy] = calcOffset(6);
    const [rdx, rdy] = calcOffset(8);
    return { lx: ldx, ly: ldy, rx: rdx, ry: rdy };
  })();

  // Color sweep: bottom-left to top-right
  useLayoutEffect(() => {
    if (isFullscreen) {
      setClipPath("inset(100% 0% 0% 0% round 2px)");
      const t = setTimeout(() => setClipPath("inset(0% 0% 0% 0% round 2px)"), 50);
      return () => clearTimeout(t);
    } else {
      setClipPath("inset(0% 0% 0% 0% round 2px)");
      const t = setTimeout(() => setClipPath("inset(0% 0% 100% 0% round 2px)"), 50);
      return () => clearTimeout(t);
    }
  }, [isFullscreen]);

  return (
    <div
      ref={wrapperRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onToggle}
      className="relative flex shrink-0 cursor-pointer items-center justify-center"
      style={{
        width: 48,
        height: 56,
        background: "rgba(244,241,238,0.9)",
        borderRadius: 8,
        boxShadow: "0 2px 12px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.3)",
      }}
    >
      <motion.svg
        viewBox="0 0 12 16"
        width={42}
        height={54}
        style={{
          imageRendering: "pixelated",
          shapeRendering: "crispEdges",
        }}
        animate={scared ? { x: [-1, 1, -1, 1, 0] } : {}}
        transition={scared ? { duration: 0.08, repeat: Infinity } : {}}
      >
        {/* Base body (single path = one draw call) */}
        <path d={BODY_PATH} fill={BODY_NORMAL} />

        {/* Overlay body (color sweep) */}
        <path d={BODY_PATH} fill={BODY_FULL} style={{ clipPath, transition: "clip-path 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }} />

        {/* Eyes */}
        <rect x={5} y={1} width={2} height={2} fill={scared ? SCARED_WHITE : EYE_COLOR} />
        <rect x={8} y={1} width={2} height={2} fill={scared ? SCARED_WHITE : EYE_COLOR} />

        {/* Pupils */}
        {!scared && (
          <>
            <rect x={5.5 + pupilOffsets.lx} y={1.3 + pupilOffsets.ly} width={1} height={1} fill={PUPIL_COLOR} />
            <rect x={8.5 + pupilOffsets.rx} y={1.3 + pupilOffsets.ry} width={1} height={1} fill={PUPIL_COLOR} />
          </>
        )}

        {/* Scared mouth */}
        {scared && <rect x={6} y={3} width={1} height={1} fill={SCARED_WHITE} />}
      </motion.svg>
    </div>
  );
}
