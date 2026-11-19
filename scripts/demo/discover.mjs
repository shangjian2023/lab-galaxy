// Discover 阶段:遍历演示动线页面,dump 可交互元素与关键结构
// 用法:node scripts/demo/discover.mjs   (在 frontend/ 下运行)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require2 = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const { chromium } = require2("playwright");

const BASE = "http://localhost:3000";
const token = readFileSync(resolve(process.cwd(), "..", "data", "demo-session.token"), "utf8").trim();

const dumpFields = () => {
  const els = [];
  document.querySelectorAll("input, select, textarea, button, [contenteditable], a[href]").forEach((el) => {
    if (el.offsetParent !== null || el.tagName === "INPUT") {
      els.push([
        el.tagName.toLowerCase(),
        el.type || "",
        (el.getAttribute("placeholder") || "").slice(0, 30),
        (el.textContent || "").trim().slice(0, 26),
        (el.id ? "#" + el.id : "") + (el.name ? "[name=" + el.name + "]" : ""),
        el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 2).join(".") : "",
      ].join("|"));
    }
  });
  return els;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addCookies([{ name: "lab_galaxy_session", value: token, url: BASE }]);
const page = await context.newPage();

const pages = [
  ["home", "/"],
  ["graph", "/graph"],
  ["graph-node", "/graph?node=d0fb8d3f-0f81-46b8-bfc0-59e761a6ff4c"],
  ["documents", "/documents"],
  ["assistant", "/assistant"],
  ["team", "/team"],
];

for (const [name, path] of pages) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log(name, "GOTO-ERR", e.message.slice(0, 80)));
  await page.waitForTimeout(2500);
  const fields = await page.evaluate(dumpFields);
  const canvases = await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((c) => `${c.width}x${c.height} cls=${c.className.slice(0, 30)}`));
  console.log(`\n===== ${name} (${path}) ===== canvas: ${JSON.stringify(canvases)}`);
  console.log(fields.slice(0, 40).join("\n"));
}
await browser.close();
