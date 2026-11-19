// 生成 v6 字幕滤镜:盖住原烧录字幕带,按旁白分句重建字幕(与配音同轴)
// 输出 data/demo/tts/v6-filter.txt;用法 node scripts/demo/gen-v6-filter.mjs(cwd=frontend)
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd().endsWith("frontend") ? resolve(process.cwd(), "..") : process.cwd();
const OUT = resolve(ROOT, "data", "demo", "tts", "v6-filter.txt");

// 旁白段:{ start, dur, clauses[] }(clauses 时长按字数占比切分)
const SEGS = [
  { start: 0.8, dur: 11.24, clauses: ["让知识,彼此照亮。", "这里是创新实验知识图谱", "馆藏50份真实实验报告", "全部数字,来自真实解析。"] },
  { start: 12.7, dur: 2.95, clauses: ["从一页档案,", "到一座知识馆。"] },
  { start: 41.2, dur: 7.55, clauses: ["键盘 slash,随处可搜。", "515个实体,492条关系,皆出原文。"] },
  { start: 53.2, dur: 7.09, clauses: ["主打功能一 · 知识星图", "痛点:实验报告散落各处,学过就忘。"] },
  { start: 58.3, dur: 9.03, clauses: ["演示用的515个实体,连成知识星图", "同类工具只有文件列表,我们有关系网络"] },
  { start: 67.6, dur: 8.35, clauses: ["悬停,看见它的邻域", "右键,从任意节点开始探索", "一跳、两跳、三跳"] },
  { start: 80.7, dur: 5.09, clauses: ["力场参数,实时可调", "每一次点击,都有回应"] },
  { start: 106.7, dur: 8.22, clauses: ["主打功能二 · 文档 → 知识流水线", "痛点:整理实验知识,全靠手抄誊写。"] },
  { start: 115.2, dur: 4.33, clauses: ["本地解析,PDF 变结构化分块。"] },
  { start: 125.2, dur: 6.56, clauses: ["让经验,凝结成知识。", "抽取结果,带证据与置信度。"] },
  { start: 139.2, dur: 6.91, clauses: ["同类产品上传原文档,我们将知识结构化储存", "新知识,落进星图。"] },
  { start: 154.7, dur: 10.63, clauses: ["主打功能三 · 证据问答", "痛点:问AI实验问题,答案查无出处", "通用AI有幻觉,可能胡乱回答"] },
  { start: 165.5, dur: 5.87, clauses: ["用 @,把问题锚在节点上", "提问,也要知其来源。"] },
  { start: 179.7, dur: 2.90, clauses: ["每一次回答,都回到原文。"] },
  { start: 196.2, dur: 8.92, clauses: ["让研究,在共同的边界里生长。", "上传团队可见文档,成员共享检索与问答。"] },
  { start: 232.7, dur: 6.14, clauses: ["让下一次发现,从已有知识开始。", "LAB GALAXY · RESEARCH, CONNECTED."] },
];

const lines = [];
// 视频链:遮盖原字幕带(深色暖底横带)+ 逐句 drawtext
lines.push("[0:v]drawbox=x=430:y=992:w=1060:h=68:color=0x1E1913@0.92:t=fill[v0]");
const FONT = "C\\:/Windows/Fonts/simsun.ttc";
let idx = 0;
const videoFilters = [];
for (const seg of SEGS) {
  const total = seg.clauses.reduce((s, c) => s + [...c].length, 0);
  let t = seg.start;
  for (const c0 of seg.clauses) {
    const c = c0.replace(/:/g, "："); // 半角冒号破坏 filtergraph 解析,字幕排版用全角
    const share = ([...c0].length / total) * seg.dur;
    const a = t, b = (t + share + 0.12); // +0.12s 重叠缓冲,避免句间闪空
    const end = Math.min(b, seg.start + seg.dur);
    videoFilters.push(
      `drawtext=fontfile='${FONT}':fontsize=24:fontcolor=0xF2E9DA:text='${c}':x=(w-text_w)/2:y=1012:enable='between(t,${a.toFixed(2)},${end.toFixed(2)})'`
    );
    t += share;
  }
  idx++;
}
lines.push("[v0]" + videoFilters.join(",") + "[vv]");
// 音频链(与 v5 一致:16 段 trim wav @ 同起点)
const DELAYS = [800, 12700, 41200, 53200, 58300, 67600, 80700, 106700, 115200, 125200, 139200, 154700, 165500, 179700, 196200, 232700];
lines.push("[1:a]volume=0.30,afade=t=in:st=0:d=2,afade=t=out:st=236.8:d=3[bg]");
DELAYS.forEach((d, i) => {
  lines.push(`[${i + 2}:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.5,adelay=${d}|${d}[v${i + 1}]`);
});
const refs = DELAYS.map((_, i) => `[v${i + 1}]`).join("");
lines.push(`${refs}amix=inputs=16:normalize=0[voc]`);
lines.push("[voc]asplit=2[voSC][voM]");
lines.push("[voSCp]null[voSCx]"); // 占位防误用
lines.push("[voSC]apad=whole_dur=240[voSCp2]");
lines.push("[bg][voSCp2]sidechaincompress=threshold=0.015:ratio=6:attack=25:release=350[bgd]");
lines.push("[bgd][voM]amix=inputs=2:normalize=0:dropout_transition=0,apad=whole_dur=240[aout]");
// 修掉占位行(直接删,保持链干净)
const cleaned = lines.filter(l => l !== "[voSCp]null[voSCx]");
writeFileSync(OUT, cleaned.join(";\n") + "\n", "utf8");
console.log(`written ${OUT}: ${videoFilters.length} clauses, ${SEGS.length} segments`);
