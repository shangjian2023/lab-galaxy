"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import PixelCharacter from "./PixelCharacter";

const STORAGE_KEY = "pixel-char-position";
const CLICK_THRESHOLD = 5;
const SCARED_RADIUS = 250;
const SCARED_THRESHOLD_SQ = SCARED_RADIUS * SCARED_RADIUS;

interface Props {
  isFullscreen: boolean;
  onToggle: () => void;
}

function loadPosition(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return { x: parsed.x, y: parsed.y };
      }
    }
  } catch { /* ignore */ }
  return { x: 16, y: 112 };
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
  } catch { /* ignore */ }
}

export default function DraggablePixelChar({ isFullscreen, onToggle }: Props) {
  const [pos, setPos] = useState(loadPosition);
  const [scared, setScared] = useState(false);
  const dragRef = useRef<{
    originX: number;
    originY: number;
    startX: number;
    startY: number;
    moved: number;
  } | null>(null);
  const rafRef = useRef(0);
  const charRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const scaredRafRef = useRef(0);

  // Clamp on resize
  useEffect(() => {
    const clamp = () => {
      setPos((p) => ({
        x: Math.min(Math.max(0, p.x), window.innerWidth - 80),
        y: Math.min(Math.max(0, p.y), window.innerHeight - 100),
      }));
    };
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  // Global mouse tracking for scared detection
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (scaredRafRef.current) return;
      scaredRafRef.current = requestAnimationFrame(() => {
        scaredRafRef.current = 0;
        const m = mouseRef.current;
        const rect = charRef.current?.getBoundingClientRect();
        if (!m || !rect) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = m.x - cx;
        const dy = m.y - cy;
        setScared(dx * dx + dy * dy < SCARED_THRESHOLD_SQ);
      });
    };
    window.addEventListener("mousemove", handleMouse, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouse);
      if (scaredRafRef.current) cancelAnimationFrame(scaredRafRef.current);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      originX: pos.x,
      originY: pos.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: 0,
    };
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }, [pos]);

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.moved = Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY);

    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    });
  }, []);

  const handleWindowMouseUp = useCallback((e: MouseEvent) => {
    window.removeEventListener("mousemove", handleWindowMouseMove);
    window.removeEventListener("mouseup", handleWindowMouseUp);

    const d = dragRef.current;
    dragRef.current = null;

    setPos((current) => {
      const clamped = {
        x: Math.min(Math.max(0, current.x), window.innerWidth - 80),
        y: Math.min(Math.max(0, current.y), window.innerHeight - 100),
      };
      savePosition(clamped.x, clamped.y);
      return clamped;
    });

    if (d && d.moved < CLICK_THRESHOLD) {
      onToggle();
    }
  }, [onToggle, handleWindowMouseMove]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      savePosition(pos.x, pos.y);
    };
  }, [handleWindowMouseMove, handleWindowMouseUp, pos]);

  return (
    <div
      ref={charRef}
      className="fixed z-50 select-none"
      style={{ left: pos.x, top: pos.y, touchAction: "none", cursor: "grab" }}
      onMouseDown={handleMouseDown}
    >
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1">
          <PixelCharacter isFullscreen={isFullscreen} onToggle={() => {}} scared={scared} />
          <span className="whitespace-nowrap rounded-md bg-gradient-to-r from-amber-400/80 to-orange-400/80 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm pointer-events-none">
            拖拽我
          </span>
        </div>
        <span className="whitespace-nowrap rounded-md bg-gradient-to-r from-orange-500 to-amber-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-md shadow-orange-400/30 pointer-events-none">
          {isFullscreen ? "点击还原" : "点击全屏"}
        </span>
      </div>
    </div>
  );
}
