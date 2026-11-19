// Discover 第二轮:交互后子面板 + 图谱画布交互验证
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require2 = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const { chromium } = require2("playwright");
const BASE = "http://localhost:3000";
const token = readFileSync(resolve(process.cwd(), "..", "data", "demo-session.token"), "utf8").trim();
mkdirSync(resolve(process.cwd(), "..", "data", "demo", "shots"), { recursive: true });

const dump = () => {
  const els = [];
  document.querySelectorAll("input, select, textarea, button, [contenteditable], a[href]").forEach((el) => {
    if (el.offsetParent !== null || el.tagName === "INPUT") {
      els.push([el.tagName.toLowerCase(), el.type || "", (el.getAttribute("placeholder") || "").slice(0, 28), (el.textContent || "").trim().slice(0, 24), (el.title || el.getAttribute("aria-label") || "").slice(0, 20), el.id ? "#" + el.id : (typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/)[0] : "")].join("|"));
    }
  });
  return els;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addCookies([{ name: "lab_galaxy_session", value: token, url: BASE }]);
const page = await context.newPage();
const shot = (n) => page.screenshot({ path: resolve(process.cwd(), "..", "data", "demo", "shots", n + ".png") });

// ---- assistant ----
await page.goto(BASE + "/assistant", { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(3000);
console.log("===== assistant =====");
console.log((await page.evaluate(dump)).slice(0, 22).join("\n"));
// 试 @ 提及
const ask = page.locator('textarea, input[placeholder*="询问"], input[placeholder*="提问"]').first();
await ask.click();
await ask.pressSequentially("@Wi", { delay: 60 });
await page.waitForTimeout(1200);
console.log("--- @mention dropdown ---");
console.log((await page.evaluate(dump)).filter((l) => /mention|option|listbox|Wireshark|节点/.test(l)).slice(0, 10).join("\n") || "(no dropdown captured)");
await shot("assistant-mention");

// ---- team ----
await page.goto(BASE + "/team", { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(2000);
console.log("\n===== team =====");
console.log((await page.evaluate(dump)).slice(0, 16).join("\n"));

// ---- documents: 上传面板 ----
await page.goto(BASE + "/documents", { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(2500);
await page.locator('button:has-text("导入新文档")').click();
await page.waitForTimeout(800);
console.log("\n===== documents upload panel =====");
console.log((await page.evaluate(dump)).slice(0, 34).join("\n"));
await shot("documents-upload-panel");

// ---- documents: 抽取面板(选第一张标本卡 → 展开抽取) ----
await page.locator("button.specimen-card").first().click();
await page.waitForTimeout(1200);
await page.locator("button.knowledge-extraction-toggle").click().catch(async () => {});
await page.waitForTimeout(1000);
console.log("\n===== documents extraction panel =====");
console.log((await page.evaluate(dump)).slice(0, 40).join("\n"));
await shot("documents-extraction-panel");

// ---- graph: 工具栏 title + hover 预览 + 右键菜单 ----
await page.goto(BASE + "/graph?node=d0fb8d3f-0f81-46b8-bfc0-59e761a6ff4c", { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(4000);
console.log("\n===== graph toolbar buttons (title/aria) =====");
console.log(await page.evaluate(() => Array.from(document.querySelectorAll("button")).length ? "" : ""));
console.log(await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("button").forEach((b) => {
    const t = (b.title || b.getAttribute("aria-label") || "").trim();
    if (t && b.offsetParent !== null) out.push(`title="${t}" text="${b.textContent.trim().slice(0, 14)}"`);
  });
  return out.join("\n");
}));
// 画布中心 hover(深链后目标节点在中心附近)
const box = await page.locator(".graph-canvas").boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy, { steps: 12 });
await page.waitForTimeout(1400);
console.log("--- after hover center: preview card? ---");
console.log(await page.evaluate(() => {
  const p = document.querySelector("[class*=preview], [class*=Preview]");
  return p ? `preview: .${String(p.className).split(/\s+/)[0]} text="${p.textContent.trim().slice(0, 40)}"` : "(none)";
}).catch((e) => "ERR " + e.message.slice(0, 60)));
await shot("graph-hover-center");
// 右键菜单
await page.mouse.click(cx, cy, { button: "right" });
await page.waitForTimeout(900);
console.log("--- context menu items ---");
console.log((await page.evaluate(dump)).filter((l) => /探索|固定|居中|关联文档|menu|Menu/.test(l)).slice(0, 8).join("\n") || "(none captured)");
await shot("graph-context-menu");
await page.keyboard.press("Escape");

await browser.close();
