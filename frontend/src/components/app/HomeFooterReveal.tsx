"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Network } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

export function HomeFooterReveal() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end end"] });
  const backgroundY = useTransform(scrollYProgress, [0, 1], [80, 0]);
  const backgroundOpacity = useTransform(scrollYProgress, [0, 0.75, 1], [0.35, 0.78, 1]);
  const ghostY = useTransform(scrollYProgress, [0, 1], ["45%", "0%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], [70, 0]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.65, 1], [0, 0.55, 1]);

  return (
    <section className="atlas-home-reveal" ref={sectionRef} aria-labelledby="atlas-home-reveal-title">
      <div className="atlas-home-reveal-sticky">
        <motion.img
          className="atlas-home-reveal-background"
          src="/images/atlas-engravings/footer.webp"
          alt=""
          width={1536}
          height={1024}
          loading="lazy"
          style={reduceMotion ? undefined : { y: backgroundY, opacity: backgroundOpacity }}
        />
        <div className="atlas-home-reveal-shade" aria-hidden="true" />
        <motion.span className="atlas-home-reveal-ghost" aria-hidden="true" style={reduceMotion ? undefined : { y: ghostY }}>ATLAS</motion.span>
        <motion.div className="atlas-home-reveal-content" style={reduceMotion ? undefined : { y: contentY, opacity: contentOpacity }}>
          <p className="atlas-kicker"><span />THE NEXT DISCOVERY</p>
          <h2 id="atlas-home-reveal-title">让下一次发现，<br />从已有知识开始。</h2>
          <p>沿着真实文档与证据继续探索，让每一次实验都成为下一次研究的路径。</p>
          <div><Link href="/graph" className="btn btn-primary"><Network size={16} />进入知识星图<ArrowRight size={15} /></Link><Link href="/documents" className="atlas-home-reveal-link">翻阅研究档案<ArrowRight size={15} /></Link></div>
        </motion.div>
        <span className="atlas-home-reveal-credit">ORIGINAL ATLAS ENGRAVING · IMAGE 2.6</span>
      </div>
    </section>
  );
}
