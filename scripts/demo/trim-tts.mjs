// 裁掉 minimax TTS mp3 尾部的结束蜂音:保留到最后语音结束点 +150ms,转 44.1k 立体声 wav
// 用法: node scripts/demo/trim-tts.mjs  (cwd = frontend/ 或仓库根均可,内部按仓库根解析)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd(), "..", "..") && process.cwd().includes("frontend")
  ? resolve(process.cwd(), "..")
  : process.cwd();
const SRC = resolve(ROOT, "data", "demo", "tts");
const OUT = resolve(SRC, "trim");
mkdirSync(OUT, { recursive: true });

// 旁白段 → 源文件名(全篇 happy:④/⑧/⑫ 沿用既有 happy 版)
const FILES = [
  "tts-h01.mp3", "tts-h02.mp3", "tts-h03.mp3", "tts-s4-zhuda01-happy.mp3", "tts-h05.mp3",
  "tts-h06.mp3", "tts-h07.mp3", "tts-n08.mp3", "tts-h09.mp3",
  "tts-h10.mp3", "tts-h11.mp3", "tts-n12.mp3", "tts-h13.mp3",
  "tts-h14.mp3", "tts-h15.mp3", "tts-h16.mp3",
];

function run(args) {
  // ffmpeg 把 silencedetect 打到 stderr,这里必须接住 stderr
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0 && !/silence/.test(r.stderr)) throw new Error(`ffmpeg failed: ${r.stderr.slice(-300)}`);
  return r.stderr;
}
function probeDur(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return parseFloat(out.trim());
}

for (const name of FILES) {
  const src = resolve(SRC, name);
  if (!existsSync(src)) { console.error(`MISSING ${name}`); process.exitCode = 1; continue; }
  const dur = probeDur(src);
  const det = run(["-hide_banner", "-i", src, "-af", "silencedetect=n=-40dB:d=0.1", "-f", "null", "-"]);
  const starts = [...det.matchAll(/silence_start: ([0-9.]+)/g)].map(m => parseFloat(m[1]));
  // 最后一次语音的自然结束点 = 最后一个 silence_start;cut = 该点 + 150ms 余韵
  const lastSpeechEnd = starts.length ? starts[starts.length - 1] : dur;
  const cut = Math.min(dur, lastSpeechEnd + 0.15);
  const outName = name.replace(/\.mp3$/, ".wav");
  run(["-y", "-loglevel", "error", "-i", src, "-af", `atrim=end=${cut.toFixed(3)},aresample=44100,aformat=channel_layouts=stereo`, resolve(OUT, outName)]);
  const nd = probeDur(resolve(OUT, outName));
  console.log(`${name} ${dur.toFixed(2)}s -> trim/${outName} ${nd.toFixed(2)}s (speech end ${lastSpeechEnd.toFixed(2)})`);
}
console.log("done");
