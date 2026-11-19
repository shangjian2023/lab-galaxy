// 补充镜头:发布后的新实体(HC-05)深链飞入图谱 — 用于拼接 S4 结尾
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const require2 = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const { chromium } = require2("playwright");
const BASE = "http://localhost:3000";
const TOKEN = readFileSync(resolve(process.cwd(), "..", "data", "demo-session.token"), "utf8").trim();
const NODE = process.env.FLYIN_NODE || "cada2c01-15b5-48f8-aa7f-16ed7579aeac"; // HC-05 Bluetooth module (take 7)

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: resolve(process.cwd(), "..", "data", "demo", "recordings"), size: { width: 1920, height: 1080 } },
});
await context.addCookies([{ name: "lab_galaxy_session", value: TOKEN, url: BASE }]);
const page = await context.newPage();

await page.goto(`${BASE}/graph?node=${NODE}`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const c = document.createElement("div");
  c.id = "demo-cursor";
  c.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  c.style.cssText = "position:fixed;z-index:999999;pointer-events:none;width:26px;height:26px;transition:left .09s,top .09s;left:960px;top:540px";
  document.body.appendChild(c);
  document.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; });
  const s = document.createElement("div");
  s.id = "demo-subtitle";
  s.style.cssText = "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:999998;background:rgba(30,25,19,.84);color:#f6efe3;font:500 21px/1.5 'Noto Serif SC','SimSun',serif;padding:10px 28px;border-radius:6px;letter-spacing:1.5px;opacity:0;transition:opacity .35s;pointer-events:none";
  s.textContent = "新知识,落进星图";
  document.body.appendChild(s);
  requestAnimationFrame(() => { s.style.opacity = "1"; });
});
await page.waitForTimeout(2600); // 相机缓动 + 检查器呈现
// 光标划向检查器关联路径
const panel = page.locator("aside.node-inspector");
if (await panel.isVisible().catch(() => false)) {
  const b = await panel.boundingBox();
  if (b) { await page.mouse.move(b.x + b.width * 0.5, b.y + 160, { steps: 14 }); }
}
await page.waitForTimeout(1400);
await page.evaluate(() => { document.getElementById("demo-subtitle").style.opacity = "0"; });
await page.waitForTimeout(900);

await context.close();
const src = await page.video().path();
const dest = resolve(process.cwd(), "..", "data", "demo", "recordings", "supp-graph-flyin.webm");
copyFileSync(src, dest);
console.log("supp saved:", dest);
await browser.close();
