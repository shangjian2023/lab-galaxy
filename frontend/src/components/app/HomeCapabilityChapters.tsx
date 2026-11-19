"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion, useMotionTemplate, useReducedMotion, useScroll, useTransform } from "framer-motion";

const chapters = [
  {
    number: "01",
    verb: "COLLECT",
    title: "每一页记录，都有来处。",
    description: "导入真实实验报告，保存来源、页码、章节与原文分块。文档不是上传后的文件名，而是一座可以持续翻阅的研究档案。",
    detail: "PDF / DOCX · 来源与权限 · 原文追溯",
    href: "/documents",
    action: "进入实验档案",
    image: "documents",
    alt: "档案夹、实验报告与放大镜组成的暖色铜版画",
  },
  {
    number: "02",
    verb: "DISTILL",
    title: "让经验，凝结成知识。",
    description: "从具体原文中抽取实验、资源与知识实体，保留证据、置信度和人工发布边界；不合格草稿不会被拿来凑数。",
    detail: "证据绑定 · 严格校验 · 人工发布",
    href: "/documents",
    action: "查看知识流水线",
    image: "knowledge",
    alt: "书页中的标本逐渐凝结为知识节点的鼠尾草绿版画",
  },
  {
    number: "03",
    verb: "CONNECT",
    title: "让隐性的联系，成为路径。",
    description: "在真实力导图谱中拖拽、缩放和探索局部关系。实验、资源与知识不再孤立，方法之间的联系可以被直接看见。",
    detail: "局部探索 · 力场调节 · 预置与本人图谱",
    href: "/graph",
    action: "进入知识星图",
    image: "graph",
    alt: "星图、轨道和知识网络组成的雾蓝与森林绿版画",
  },
  {
    number: "04",
    verb: "QUESTION",
    title: "每一次回答，都回到原文。",
    description: "沿着有权访问的原文检索和提问，也可以直接 @ 一个知识节点。证据与回答一起呈现，没有依据时明确说明。",
    detail: "@ 节点 · 原文证据 · 权限内检索",
    href: "/assistant",
    action: "向研究助手提问",
    image: "assistant",
    alt: "放大镜、证据书页与关联线索组成的陶土色版画",
  },
  {
    number: "05",
    verb: "COLLABORATE",
    title: "让研究，在共同的边界里生长。",
    description: "创建研究团队，通过一次性邀请分享协作入口。共享文档的访问范围随成员加入和退出实时变化，知识在清晰权限中流动。",
    detail: "一次性邀请 · 团队文档 · 实时权限回收",
    href: "/team",
    action: "进入协作空间",
    image: "collaboration",
    alt: "多双手围绕共同实验档案协作的烟粉与鼠尾草绿版画",
  },
] as const;

function CapabilityChapter({ chapter, index }: { chapter: (typeof chapters)[number]; index: number }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start end", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 0.5, 1], [-32, 0, 32]);
  const responsiveImageY = useMotionTemplate`clamp(calc(-1 * var(--atlas-chapter-shift, 32px)), ${imageY}px, var(--atlas-chapter-shift, 32px))`;

  return (
    <article className={`atlas-capability ${index % 2 ? "atlas-capability-reverse" : ""}`}>
      <div className="atlas-capability-copy">
        <p className="atlas-capability-number"><span>#{chapter.number}</span>{chapter.verb}</p>
        <h3>{chapter.title}</h3>
        <p className="atlas-capability-description">{chapter.description}</p>
        <p className="atlas-capability-detail">{chapter.detail}</p>
        <Link href={chapter.href} className="atlas-text-action">{chapter.action}<ArrowUpRight size={15} /></Link>
      </div>
      <div className="atlas-capability-frame" ref={frameRef} data-parallax="chapter">
        <motion.img
          src={`/images/atlas-engravings/${chapter.image}.webp`}
          alt={chapter.alt}
          width={1200}
          height={800}
          loading="lazy"
          style={{ y: reduceMotion ? 0 : responsiveImageY }}
        />
        <span className="atlas-capability-plate" aria-hidden="true">FIG. {chapter.number}</span>
      </div>
    </article>
  );
}

export function HomeCapabilityChapters() {
  return (
    <section className="atlas-capabilities" aria-labelledby="atlas-capabilities-title">
      <div className="atlas-capabilities-heading">
        <p className="atlas-kicker"><span />THE RESEARCH METHOD</p>
        <h2 id="atlas-capabilities-title">从一页档案，到一座知识馆。</h2>
        <p>五个相互衔接的真实能力，让实验经验可以被保存、理解、追问与共同建设。</p>
      </div>
      <div className="atlas-capability-list">
        {chapters.map((chapter, index) => <CapabilityChapter chapter={chapter} index={index} key={chapter.number} />)}
      </div>
    </section>
  );
}
