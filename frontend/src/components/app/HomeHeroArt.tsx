"use client";

import { useRef } from "react";
import { motion, useMotionTemplate, useReducedMotion, useScroll, useTransform } from "framer-motion";

export function HomeHeroArt() {
  const frameRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start start", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 1], [0, 240]);
  const responsiveImageY = useMotionTemplate`min(${imageY}px, var(--atlas-hero-shift, 240px))`;

  return (
    <figure className="atlas-hero-art" ref={frameRef} data-parallax="hero">
      <motion.img
        src="/images/atlas-engravings/frontispiece.webp"
        alt="打开的书籍、知识节点和实验仪器组成的森林绿卷首版画"
        width={1024}
        height={1024}
        fetchPriority="high"
        style={{ y: reduceMotion ? 0 : responsiveImageY }}
      />
      <figcaption><span>PLATE 001</span><span>THE KNOWLEDGE HERBARIUM</span></figcaption>
    </figure>
  );
}
