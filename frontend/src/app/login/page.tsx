"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { login as loginApi, getProfile } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { gsap } from "gsap";
import { Draggable } from "gsap/Draggable";

gsap.registerPlugin(Draggable);

// ── Brand ──
const BRAND = "#da7756";
const BRAND_DARK = "#b05e3f";
const BRAND_LIGHT = "#e08a6c";

// ── Sound ──
function playClick() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(820, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch { /* audio blocked */ }
}

export default function LoginPage() {
  const [isOn, setIsOn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [headAngle, setHeadAngle] = useState(-10);

  const svgRef = useRef<SVGSVGElement>(null);
  const ropePathRef = useRef<SVGPathElement>(null);
  const cordHandleRef = useRef<SVGCircleElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const beamRef = useRef<SVGPolygonElement>(null);
  const floorGlowRef = useRef<SVGEllipseElement>(null);

  const isOnRef = useRef(false);
  isOnRef.current = isOn;

  // Rope state
  const ropeRef = useRef({ bendX: 0, controlY: 218, handleY: 254 });

  const [, setRopeTick] = useState(0);

  // ── Cord drag ──
  useEffect(() => {
    const handle = cordHandleRef.current;
    const path = ropePathRef.current;
    if (!handle || !path) return;

    const instance = Draggable.create(handle, {
      type: "y",
      bounds: { minY: 0, maxY: 96 },
      onDrag() {
        const currentY = Math.max(0, this.y);
        ropeRef.current.handleY = 254 + currentY;
        ropeRef.current.controlY = 218 + currentY * 0.42;
        ropeRef.current.bendX = Math.sin(currentY / 18) * 14;
        setRopeTick((t) => t + 1);
      },
      onRelease() {
        const shouldToggle = this.y > 50;
        gsap.set(handle, { x: 0, y: 0 });
        gsap.to(ropeRef.current, {
          bendX: 0,
          controlY: 218,
          handleY: 254,
          duration: 0.72,
          ease: "elastic.out(1, 0.42)",
          onUpdate() {
            setRopeTick((t) => t + 1);
          },
        });
        if (shouldToggle) {
          toggleLamp();
        }
      },
    })[0];

    return () => {
      instance.kill();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toggle lamp ──
  const toggleLamp = useCallback(() => {
    playClick();
    const wasOn = isOnRef.current;
    setIsOn(!wasOn);
    setHeadAngle(wasOn ? -10 : 0);
  }, []);

  // ── Form submission ──
  const router = useRouter();
  const { setUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await loginApi(username, password);
      localStorage.setItem("token", res.access_token);
      const profile = await getProfile();
      setUser(profile);
      router.push("/documents");
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-8"
      style={{
        background: `
          radial-gradient(circle at 30% 20%, rgba(218,119,86,0.15), transparent 35%),
          radial-gradient(circle at 75% 70%, rgba(218,119,86,0.08), transparent 30%),
          linear-gradient(180deg, #1a1512 0%, #141413 50%, #1a1512 100%)
        `,
      }}
    >
      {/* Background warm orbs */}
      <div
        className="absolute rounded-full"
        style={{
          width: 400,
          height: 400,
          left: -80,
          top: -100,
          filter: "blur(40px)",
          background: "radial-gradient(circle, rgba(218,119,86,0.08) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 350,
          height: 350,
          right: -100,
          bottom: -80,
          filter: "blur(40px)",
          background: "radial-gradient(circle, rgba(176,94,63,0.1) 0%, transparent 70%)",
        }}
      />

      {/* Main layout */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-12 w-full max-w-6xl">
        {/* ── Lamp Panel ── */}
        <div className="flex flex-col items-center gap-6 min-w-[300px]">
          <svg ref={svgRef} width="360" height="420" viewBox="0 0 420 420" className="drop-shadow-2xl" style={{ width: "min(100%, 360px)" }}>
            <defs>
              <radialGradient id="lampGlowGrad" cx="50%" cy="40%" r="55%">
                <stop offset="0%" stopColor={BRAND} stopOpacity={isOn ? 0.9 : 0} />
                <stop offset="60%" stopColor={BRAND_LIGHT} stopOpacity={isOn ? 0.35 : 0} />
                <stop offset="100%" stopColor="#000" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="lampMetalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#5f6978" />
                <stop offset="100%" stopColor="#2a313c" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Halo glow */}
            <ellipse cx="210" cy="155" rx="118" ry="112" fill="url(#lampGlowGrad)" />

            {/* Floor glow */}
            <ellipse ref={floorGlowRef} cx="248" cy="316" rx="112" ry="30" fill={BRAND} fillOpacity={isOn ? 0.22 : 0.04} />

            {/* Base shadow */}
            <ellipse cx="214" cy="346" rx="108" ry="18" fill="#0a0a09" opacity="0.68" />

            {/* Base body */}
            <rect x="152" y="328" width="124" height="20" rx="10" fill="url(#lampMetalGrad)" />

            {/* Stem */}
            <rect x="198" y="214" width="28" height="120" rx="14" fill="url(#lampMetalGrad)" />

            {/* Curved neck */}
            <path
              d="M 186 238 C 138 222 116 196 124 154 C 130 124 160 114 186 126"
              fill="none"
              stroke="url(#lampMetalGrad)"
              strokeWidth="18"
              strokeLinecap="round"
            />
            {/* Neck highlight */}
            <path
              d="M 186 238 C 138 222 116 196 124 154 C 130 124 160 114 186 126"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="6"
              strokeLinecap="round"
            />

            {/* Joint knob */}
            <circle cx="188" cy="129" r="16" fill="#737d8f" />
            <circle cx="188" cy="129" r="8" fill="#8a94a6" />

            {/* Lamp head group */}
            <g
              style={{
                transformOrigin: "188px 129px",
                transform: `rotate(${headAngle}deg)`,
                transition: "transform 320ms ease",
              }}
            >
              {/* Head back */}
              <path d="M 128 108 C 168 68 242 66 286 104 L 258 176 C 221 194 177 194 142 176 Z" fill="#232a35" />
              {/* Head front */}
              <path d="M 138 110 C 174 76 238 76 276 108 L 252 168 C 220 182 182 182 150 168 Z" fill="#313947" />
              {/* Head bottom / light opening */}
              <path d="M 150 168 C 182 182 220 182 252 168 C 244 194 228 208 201 214 C 174 208 158 194 150 168 Z" fill={isOn ? BRAND : "#1b212b"} opacity={isOn ? 0.95 : 1} />

              {/* Eyes group */}
              <g
                style={{
                  transformOrigin: "202px 128px",
                  transform: isOn ? "rotate(0deg)" : "rotate(180deg)",
                  transition: "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <circle cx="182" cy="128" r="8" fill="#0f141d" />
                <circle cx="222" cy="128" r="8" fill="#0f141d" />
                <circle cx="179" cy="124" r="2.8" fill="#eef3ff" opacity={isOn ? 1 : 0.82} />
                <circle cx="219" cy="124" r="2.8" fill="#eef3ff" opacity={isOn ? 1 : 0.82} />
              </g>
            </g>

            {/* Light beam */}
            <polygon
              ref={beamRef}
              points="201,214 80,420 320,420"
              fill={BRAND}
              opacity={0}
            />

            {/* Rope path */}
            <path
              ref={ropePathRef}
              d={`M 128 170 C ${128 + ropeRef.current.bendX} ${ropeRef.current.controlY}, ${128 + ropeRef.current.bendX * 0.52} ${ropeRef.current.handleY - 26}, 128 ${ropeRef.current.handleY}`}
              fill="none"
              stroke="#e2d4ae"
              strokeWidth="4.5"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.28))" }}
            />

            {/* Cord handle */}
            <circle
              ref={cordHandleRef}
              cx="128"
              cy={ropeRef.current.handleY}
              r="12"
              fill={isOn ? BRAND : "#5f6978"}
              style={{
                cursor: "grab",
                filter: isOn ? `drop-shadow(0 0 10px ${BRAND}66)` : "none",
                transition: "fill 0.3s, filter 0.3s",
              }}
            />
            <circle
              cx="128"
              cy={ropeRef.current.handleY}
              r="4.5"
              fill="#fff7dc"
              opacity="0.85"
              style={{ pointerEvents: "none" }}
            />
          </svg>

          {/* Lamp copy */}
          <div className="text-center max-w-[360px]" style={{ color: "rgba(233,230,227,0.88)" }}>
            <p className="text-[11px] uppercase tracking-[0.24em] mb-2" style={{ color: "rgba(218,119,86,0.6)" }}>
              知识图谱平台
            </p>
            <h2 className="text-2xl lg:text-[30px] leading-tight font-bold" style={{ color: "#f5f0eb" }}>
              拉一下开关，登录面板亮起来
            </h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(180,170,160,0.7)" }}>
              拖动拉绳超过 50px 切换开关，赤陶色灯光为你点亮。
            </p>
          </div>
        </div>

        {/* ── Login Panel ── */}
        <div
          ref={formRef}
          className="transition-all"
          style={{
            opacity: isOn ? 1 : 0,
            transform: isOn ? "translateY(0) scale(1)" : "translateY(18px) scale(0.9)",
            pointerEvents: isOn ? "auto" : "none",
            transition: "opacity 540ms cubic-bezier(0.22, 1, 0.36, 1), transform 540ms cubic-bezier(0.18, 1.18, 0.35, 1.02)",
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="rounded-[28px] px-8 pt-8 pb-7 w-full"
            style={{
              maxWidth: "430px",
              backgroundColor: "rgba(20,20,19,0.85)",
              backdropFilter: "blur(16px)",
              border: `1px solid ${isOn ? `${BRAND}33` : "rgba(255,255,255,0.06)"}`,
              boxShadow: isOn
                ? `0 0 0 1px ${BRAND}22, 0 24px 70px ${BRAND}18`
                : "0 24px 70px rgba(0,0,0,0.4)",
              transition: "border-color 0.8s, box-shadow 0.8s",
            }}
          >
            <p
              className="text-[13px] tracking-[0.16em] uppercase mb-2.5 font-medium"
              style={{ color: isOn ? BRAND : "rgba(255,255,255,0.3)" }}
            >
              欢迎回来
            </p>
            <h1 className="text-[32px] leading-[1.18] font-bold" style={{ color: "#f5f0eb" }}>
              创新实验知识图谱平台
            </h1>
            <p className="text-[14px] leading-[1.7] mt-3 mb-6" style={{ color: "rgba(180,170,160,0.7)" }}>
              打开台灯后即可进入登录面板，继续你的实验图谱工作流。
            </p>

            {error && (
              <div className="rounded-lg p-3 text-sm mb-4" style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            <div className="space-y-4.5">
              <input
                type="text"
                placeholder="账号"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 text-sm rounded-[14px] outline-none transition-all duration-300"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#f5f0eb",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
                  minHeight: "46px",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = `${BRAND}99`;
                  e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${BRAND}99, 0 0 0 4px ${BRAND}18, 0 0 24px ${BRAND}20`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.04)";
                }}
              />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 text-sm rounded-[14px] outline-none transition-all duration-300"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#f5f0eb",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
                  minHeight: "46px",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = `${BRAND}99`;
                  e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${BRAND}99, 0 0 0 4px ${BRAND}18, 0 0 24px ${BRAND}20`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.04)";
                }}
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 text-sm font-medium rounded-[14px] mt-5 transition-all duration-300"
              style={{
                minHeight: "48px",
                background: isOn
                  ? `linear-gradient(135deg, ${BRAND_LIGHT}, ${BRAND}, ${BRAND_DARK})`
                  : `${BRAND}33`,
                color: isOn ? "#fff" : "rgba(255,255,255,0.3)",
                cursor: busy ? "not-allowed" : "pointer",
                border: "none",
                boxShadow: isOn ? `0 14px 30px ${BRAND}30` : "none",
              }}
              onMouseEnter={(e) => {
                if (!busy && isOn) {
                  e.currentTarget.style.filter = "brightness(1.1)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "";
                e.currentTarget.style.transform = "";
              }}
            >
              {busy ? "登录中..." : "登录"}
            </button>

            <div className="flex items-center justify-between mt-2">
              <a href="#" className="text-[13px] no-underline hover:underline" style={{ color: `${BRAND}99` }}>
                忘记密码？
              </a>
              <a href="/register" className="text-[13px] no-underline hover:underline" style={{ color: `${BRAND}99` }}>
                注册新账号
              </a>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div
        className="fixed bottom-4 left-0 right-0 text-center text-[12px]"
        style={{ color: "rgba(255,255,255,0.15)" }}
      >
        {today} &middot; 知识图谱平台 &middot; 共产主义接班人
      </div>
    </main>
  );
}
