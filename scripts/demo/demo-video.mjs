// LAB GALAXY 演示视频录制脚本(ui-demo 三阶段之 Rehearse + Record)
// 用法:
//   node scripts/demo/demo-video.mjs --rehearse   (快速验证选择器,无录制、无写库、无 API 调用)
//   node scripts/demo/demo-video.mjs              (正式录制,输出 WebM 至 data/demo/recordings/)
// 必须在 frontend/ 目录下运行;需 dev server 于 :3000、data/demo-session.token 存在
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require2 = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const { chromium } = require2("playwright");

const MODE = process.argv.includes("--rehearse") ? "rehearse" : "record";
const BASE = "http://localhost:3000";
const TOKEN = readFileSync(resolve(process.cwd(), "..", "data", "demo-session.token"), "utf8").trim();
const DEMO_PDF = resolve(process.cwd(), "..", "data", "demo", "assets", "Bluetooth_Communication_Experiment_Supplement.pdf");
const BLUETOOTH_NODE = "d0fb8d3f-0f81-46b8-bfc0-59e761a6ff4c";
const W = MODE === "record" ? 1900 : 1900, H = 1060; // 略小于视口,避免滚动条入镜
const VP = { width: 1920, height: 1080 };
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const wait = (page, ms) => page.waitForTimeout(MODE === "rehearse" ? Math.min(ms, 350) : ms);

// ---------- 覆盖层 ----------
async function injectOverlays(page) {
  await page.evaluate(() => {
    if (!document.getElementById("demo-cursor")) {
      const c = document.createElement("div");
      c.id = "demo-cursor";
      c.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      c.style.cssText = "position:fixed;z-index:999999;pointer-events:none;width:26px;height:26px;transition:left .09s,top .09s;filter:drop-shadow(1px 1px 2px rgba(0,0,0,.35));left:0;top:0";
      document.body.appendChild(c);
      document.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; });
    }
    if (!document.getElementById("demo-subtitle")) {
      const s = document.createElement("div");
      s.id = "demo-subtitle";
      s.style.cssText = "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:999998;background:rgba(30,25,19,.84);color:#f6efe3;font:500 21px/1.5 'Noto Serif SC','SimSun',serif;padding:10px 28px;border-radius:6px;letter-spacing:1.5px;opacity:0;transition:opacity .35s;pointer-events:none;max-width:80vw;text-align:center";
      s.textContent = "";
      document.body.appendChild(s);
    }
    if (!document.getElementById("demo-nameplate")) {
      const n = document.createElement("div");
      n.id = "demo-nameplate";
      n.style.cssText = "position:fixed;left:66px;bottom:110px;z-index:999997;pointer-events:none;opacity:0;transition:opacity .45s,transform .45s;transform:translateY(10px)";
      n.innerHTML = `<div id="demo-np-kicker" style="font:600 14px/1 'Noto Serif SC','SimSun',serif;letter-spacing:5px;color:#8a6a45;border-left:3px solid #b08d57;padding-left:12px;margin-bottom:10px"></div><div id="demo-np-title" style="font:700 42px/1.25 'Noto Serif SC','SimSun',serif;color:#2f2a24;text-shadow:0 1px 0 rgba(255,250,240,.7)"></div>`;
      document.body.appendChild(n);
    }
  });
}
async function subtitle(page, text, hold = 0) {
  await page.evaluate((t) => {
    const b = document.getElementById("demo-subtitle");
    if (!b) return;
    if (t) { b.textContent = t; b.style.opacity = "1"; } else b.style.opacity = "0";
  }, text);
  if (text && hold) await wait(page, hold);
}
async function nameplate(page, kicker, title, ms = 2400) {
  await page.evaluate(([k, t]) => {
    const n = document.getElementById("demo-nameplate");
    document.getElementById("demo-np-kicker").textContent = k;
    document.getElementById("demo-np-title").textContent = t;
    n.style.opacity = "1"; n.style.transform = "translateY(0)";
  }, [kicker, title]);
  await wait(page, ms);
  await page.evaluate(() => {
    const n = document.getElementById("demo-nameplate");
    n.style.opacity = "0"; n.style.transform = "translateY(10px)";
  });
  await wait(page, 500);
}

// ---------- 交互助手 ----------
async function ensureVisible(page, selector, label) {
  const el = page.locator(selector).first();
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    log(`REHEARSAL FAIL: ${label} -> ${selector}`);
    const found = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button,input,select,textarea,a"))
        .filter((e) => e.offsetParent !== null)
        .map((e) => `${e.tagName}"${(e.textContent || e.placeholder || e.title || "").trim().slice(0, 24)}"`)
        .slice(0, 30).join(" "));
    log("  visible:", found);
    return false;
  }
  log(`REHEARSAL OK: ${label}`);
  return true;
}
async function moveAndClick(page, selector, label, opts = {}) {
  const { postClickDelay = 800, ...clickOpts } = opts;
  const el = typeof selector === "string" ? page.locator(selector).first() : selector;
  if (!(await el.isVisible().catch(() => false))) { log(`WARN skip click: ${label}`); return false; }
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await wait(page, 300);
    const box = await el.boundingBox();
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 }); await wait(page, 380); }
    await el.click(clickOpts);
  } catch (e) { log(`WARN click failed ${label}: ${e.message.slice(0, 70)}`); return false; }
  await wait(page, postClickDelay);
  return true;
}
async function typeSlowly(page, selector, text, label, charDelay = 55) {
  const el = typeof selector === "string" ? page.locator(selector).first() : selector;
  if (!(await el.isVisible().catch(() => false))) { log(`WARN skip type: ${label}`); return false; }
  await moveAndClick(page, el, label, { postClickDelay: 250 });
  await el.click({ timeout: 3000 }).catch(() => {});
  await el.pressSequentially(text, { delay: MODE === "rehearse" ? 12 : charDelay });
  await wait(page, 450);
  return true;
}
async function smoothScroll(page, top, ms = 1600) {
  await page.evaluate((t) => window.scrollTo({ top: t, behavior: "smooth" }), top);
  await wait(page, ms);
}
// 慢速连续滚轮:视差/滚动显影类动效必须慢滚才可见(约 350px/s)
async function slowWheel(page, totalPx, stepPx = 32, tickMs = 90) {
  let done = 0;
  while (done < totalPx) {
    await page.mouse.wheel(0, stepPx);
    done += stepPx;
    await wait(page, tickMs);
  }
}
async function canvasCenter(page) {
  const box = await page.locator(".graph-canvas").boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}
async function poll(page, fn, label, timeoutMs = 180000, intervalMs = 2000) {
  const t0 = Date.now();
  while (Date.now() - t0 < (MODE === "rehearse" ? Math.min(timeoutMs, 8000) : timeoutMs)) {
    if (await fn().catch(() => false)) { log(`POLL HIT: ${label} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); return true; }
    await wait(page, intervalMs);
  }
  log(`POLL MISS: ${label}`);
  return false;
}

// ---------- 主流程 ----------
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    MODE === "record"
      ? { viewport: VP, recordVideo: { dir: resolve(process.cwd(), "..", "data", "demo", "recordings"), size: VP } }
      : { viewport: VP }
  );
  await context.addCookies([{ name: "lab_galaxy_session", value: TOKEN, url: BASE }]);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => {});
  const page = await context.newPage();
  log("VIDEO_T0_EPOCH", Date.now()); // 视频时间轴原点(供后期修剪定位)
  page.setDefaultTimeout(45000);
  const failures = [];
  const check = async (sel, label) => { if (!(await ensureVisible(page, sel, label))) failures.push(label); };
  const goto = async (path, settle = 2500) => {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
    await wait(page, settle);
    await injectOverlays(page);
  };

  try {
    // ========== S0 首页 ==========
    log("S0 home");
    await goto("/", 3200);
    await check('a.btn.btn-primary:has-text("进入知识星图")', "首页 CTA");
    await subtitle(page, "创新实验知识图谱", 2600);
    const H = await page.evaluate(() => document.body.scrollHeight);
    await page.mouse.move(960, 540, { steps: 6 });
    await subtitle(page, "全部数字,来自真实解析");
    await slowWheel(page, 1150); // 英雄区 → 语料账本,视差慢滚展开
    await wait(page, 1800);
    await subtitle(page, "从一页档案,到一座知识馆");
    for (let i = 0; i < 5; i++) { // 能力五章:逐章慢滚 + 停顿,让版画视差被看清
      await slowWheel(page, 640);
      await wait(page, 1700);
    }
    await slowWheel(page, 800); // 新近入馆档案
    await wait(page, 1500);
    await subtitle(page, "");
    await smoothScroll(page, 0, 1500);
    await wait(page, 700);
    await moveAndClick(page, 'a.btn.btn-primary:has-text("进入知识星图")', "CTA 进入知识星图", { postClickDelay: 3200 });

    // ========== S1 全局搜索 ==========
    log("S1 search");
    await check('input[placeholder="检索知识档案"]', "全局搜索框");
    await subtitle(page, "键盘 / ,随处可搜");
    await page.keyboard.press("/");
    await wait(page, 700);
    await typeSlowly(page, 'input[placeholder="检索知识档案"]', "Wireshark", "搜索输入");
    await subtitle(page, "演示语料 515 实体 · 492 关系,皆出原文");
    await page.keyboard.press("Enter");
    await wait(page, 2800);
    // 清空过滤,回到全图
    await moveAndClick(page, 'input[placeholder="搜索实体、方法或结论"]', "图谱过滤输入", { postClickDelay: 300 });
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await wait(page, 2000);
    await subtitle(page, "");

    // ========== S2 知识星图 ==========
    log("S2 graph");
    await nameplate(page, "主打功能 01", "知识星图");
    await subtitle(page, "痛点:实验报告散落各处,学过就忘", 2400);
    await check(".graph-canvas", "图谱画布");
    const c0 = await canvasCenter(page);
    await subtitle(page, "演示用的 515 个实体,连成知识星图");
    await page.mouse.move(c0.x, c0.y, { steps: 15 });
    await wait(page, 1800);
    await subtitle(page, "拖拽、滚轮缩放、双击固定");
    await page.mouse.move(c0.x, c0.y, { steps: 5 });
    await page.mouse.down();
    await page.mouse.move(c0.x + 280, c0.y + 170, { steps: 20 });
    await page.mouse.up();
    await wait(page, 1400);
    await page.mouse.wheel(0, -420); await wait(page, 900);
    await page.mouse.wheel(0, -260); await wait(page, 1300);
    await page.mouse.wheel(0, 620); await wait(page, 1100);
    await subtitle(page, "右键,从任意节点开始探索");
    const c1 = await canvasCenter(page);
    await page.mouse.click(c1.x, c1.y, { button: "right" });
    await wait(page, 800);
    await moveAndClick(page, 'button:has-text("从这里探索")', "右键菜单·从这里探索", { postClickDelay: 1600 });
    const depthSel = page.locator("select:visible").nth(2);
    if (await depthSel.isVisible().catch(() => false)) {
      await subtitle(page, "一跳、两跳、三跳");
      for (const d of ["2", "3"]) { await depthSel.selectOption(d).catch(() => {}); await wait(page, 1300); }
    } else log("WARN depth select 不可见");
    await moveAndClick(page, 'button[aria-label="返回全局图谱"]', "退出局部探索", { postClickDelay: 1500 });
    await subtitle(page, "");
    // 深链定位 + 检查器
    await goto(`/graph?node=${BLUETOOTH_NODE}`, 3400);
    await check('button:has-text("固定节点")', "检查器·固定节点");
    await subtitle(page, "每一次分享,都能直达节点");
    await wait(page, 1600);
    await moveAndClick(page, 'button:has-text("力场")', "检查器·力场页签", { postClickDelay: 700 });
    const slider = page.locator('input[type=range]').first();
    if (await slider.isVisible().catch(() => false)) {
      await subtitle(page, "力场参数,实时可调");
      const sb = await slider.boundingBox();
      await page.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height / 2, { steps: 8 });
      await page.mouse.down();
      await page.mouse.move(sb.x + sb.width * 0.62, sb.y + sb.height / 2, { steps: 12 });
      await page.mouse.up();
      await wait(page, 1200);
    }
    await moveAndClick(page, 'button[aria-label="全屏图谱"]', "全屏", { postClickDelay: 2300 });
    await page.keyboard.press("Escape"); await wait(page, 900);
    await subtitle(page, "Rust / WASM 力导引擎", 1500);
    await subtitle(page, "每一次点击,都有回应");
    for (const t of ["放大", "适应全部节点", "重新布局"]) {
      await moveAndClick(page, `button[aria-label="${t}"]`, `工具栏·${t}`, { postClickDelay: 650 });
    }
    await wait(page, 800);
    await subtitle(page, "同类工具只有文件列表,我们有关系网络", 2400);
    await subtitle(page, "");

    // ========== S3 文档上传解析 ==========
    log("S3 documents");
    await moveAndClick(page, 'a:has-text("实验档案")', "导航·实验档案", { postClickDelay: 2600 });
    await nameplate(page, "主打功能 02", "文档 → 知识流水线");
    await subtitle(page, "痛点:整理实验知识,全靠手抄誊写", 2400);
    await check('button:has-text("导入新文档")', "导入新文档按钮");
    await subtitle(page, "每一页记录,都有来处");
    await moveAndClick(page, 'button:has-text("导入新文档")', "展开导入面板", { postClickDelay: 900 });
    if ((await page.locator('input[type=file]').count()) === 0) { log("REHEARSAL FAIL: 文件输入不存在"); failures.push("文件输入"); } else log("REHEARSAL OK: 文件输入(存在性)");
    if (MODE === "record") {
      await subtitle(page, "上传即解析:分块、实体、关系全自动");
      await page.locator('input[type=file]').setInputFiles(DEMO_PDF);
      await wait(page, 800);
      await subtitle(page, "本地解析,PDF → 结构化分块");
      await moveAndClick(page, 'button:has-text("上传并解析")', "上传并解析", { postClickDelay: 1500 });
      await poll(page, () => page.locator('button.specimen-card:has-text("Bluetooth")').first().isVisible(), "新文档标本卡出现", 200000, 2500);
      await wait(page, 1200);
    }
    await moveAndClick(page, 'button:has-text("收起导入面板")', "收起导入面板", { postClickDelay: 800 });
    if (MODE === "record") {
      await moveAndClick(page, 'button.specimen-card:has-text("Bluetooth")', "新标本卡", { postClickDelay: 1600 });
      await subtitle(page, "原文分块,全文可检索");
      await moveAndClick(page, 'button:has-text("展开解析原文")', "展开解析原文", { postClickDelay: 1300 });
      await wait(page, 1200);
    } else {
      await moveAndClick(page, "button.specimen-card", "标本卡(第一张)", { postClickDelay: 900 });
    }
    await subtitle(page, "");

    // ========== S4 抽取发布 ==========
    log("S4 extraction");
    await check(".knowledge-extraction-toggle", "抽取面板开关");
    await moveAndClick(page, ".knowledge-extraction-toggle", "展开抽取面板", { postClickDelay: 900 });
    await check('input[type=checkbox]', "确认调用复选框");
    if (MODE === "record") {
      await subtitle(page, "让经验,凝结成知识");
      await page.locator('input[type=checkbox]').first().check();
      await wait(page, 500);
      await moveAndClick(page, 'button:has-text("开始一次抽取")', "开始一次抽取", { postClickDelay: 1200 });
      await subtitle(page, "抽取结果,带证据与置信度");
      await poll(page, () => page.locator("button.knowledge-publish").first().isVisible(), "抽取完成可发布", 300000, 3000);
      await wait(page, 2200);
      await moveAndClick(page, "button.knowledge-publish", "发布到星图", { postClickDelay: 1800 });
      await subtitle(page, "别家停在存文件,我们直达发布知识", 2400);
      await subtitle(page, "新知识,落进星图");
      await moveAndClick(page, "a.knowledge-publish", "在真实星图中查看", { postClickDelay: 3000 });
    } else {
      await check('button:has-text("开始一次抽取")', "开始一次抽取按钮");
    }
    await subtitle(page, "");

    // ========== S5 证据问答 ==========
    log("S5 assistant");
    await moveAndClick(page, 'a:has-text("研究助手")', "导航·研究助手", { postClickDelay: 2600 });
    await nameplate(page, "主打功能 03", "证据问答");
    await subtitle(page, "痛点:问 AI 实验问题,答案查无出处", 2400);
    const askInput = page.locator('input[placeholder*="询问"]').first();
    await check('input[placeholder*="询问"]', "提问输入框");
    await moveAndClick(page, 'button:has-text("新建研究会话")', "新建会话", { postClickDelay: 800 });
    if (MODE === "record") {
      await subtitle(page, "用 @ ,把问题锚在节点上");
      await typeSlowly(page, askInput, "@Wireshark", "@提及输入", 70);
      await wait(page, 1100);
      const opt = page.locator('button.node-mention-option:has-text("Wireshark")').first();
      if (await opt.isVisible().catch(() => false)) await moveAndClick(page, opt, "选择 Wireshark 节点", { postClickDelay: 500 });
      await askInput.pressSequentially(" 能分析哪些网络问题?请给出原文依据。", { delay: 50 });
      await wait(page, 600);
      await subtitle(page, "提问,也要知其来源");
      const composer = page.locator("form").filter({ has: page.locator('input[placeholder*="询问"]') }).first();
      const send = composer.locator('button[type=submit]').last();
      if (await send.isVisible().catch(() => false)) await moveAndClick(page, send, "发送", { postClickDelay: 1000 });
      else await askInput.press("Enter");
      // 等流式回答真正完成("回答中"徽章/检索提示消失),让观众看完整段逐字输出
      await wait(page, 2500);
      await poll(page, async () => {
        const t = await page.evaluate(() => document.body.innerText);
        return !t.includes("回答中") && !t.includes("正在检索");
      }, "流式回答完成", 300000, 2000);
      await wait(page, 4000); // 定格读结论
      await subtitle(page, "通用 AI 有幻觉,可能胡乱回答", 2400);
      await subtitle(page, "每一次回答,都回到原文");
      for (const i of [0, 1]) {
        const d = page.locator("details summary").nth(i);
        if (await d.isVisible().catch(() => false)) { await moveAndClick(page, d, `展开证据卡${i + 1}`, { postClickDelay: 1400 }); }
      }
      const evLink = page.locator('a:has-text("在文档中心查看")').first();
      if (await evLink.isVisible().catch(() => false)) await moveAndClick(page, evLink, "证据外链", { postClickDelay: 2000 });
      await subtitle(page, "");
    }

    // ========== S6 团队 ==========
    log("S6 team");
    await moveAndClick(page, 'a:has-text("协作空间")', "导航·协作空间", { postClickDelay: 2400 });
    await subtitle(page, "油画氛围,随页面流转", 1600);
    await moveAndClick(page, 'button[title="调整油画背景"]', "油画氛围按钮", { postClickDelay: 800 });
    const opSlider = page.locator('input[type=range]').first();
    if (await opSlider.isVisible().catch(() => false)) {
      const ob = await opSlider.boundingBox();
      await page.mouse.move(ob.x + ob.width * 0.2, ob.y + ob.height / 2, { steps: 6 });
      await page.mouse.down();
      await page.mouse.move(ob.x + ob.width * 0.6, ob.y + ob.height / 2, { steps: 10 });
      await page.mouse.up();
      await wait(page, 900);
    }
    await page.keyboard.press("Escape");
    await wait(page, 500);
    await check("#team-name", "团队名称输入");
    await subtitle(page, "让研究,在共同的边界里生长");
    if (MODE === "record") {
      await typeSlowly(page, "#team-name", "知识星图研究组", "团队名称");
      await moveAndClick(page, 'button:has-text("创建团队")', "创建团队", { postClickDelay: 2800 });
      // 团队内部空间:详情页停留,光标缓扫成员区
      await subtitle(page, "让研究,在共同的边界里生长");
      await page.mouse.move(1250, 380, { steps: 10 });
      await wait(page, 900);
      await page.mouse.move(1250, 640, { steps: 10 });
      await wait(page, 1200);
      await moveAndClick(page, 'button:has-text("生成邀请令牌")', "生成邀请令牌", { postClickDelay: 1600 });
      await moveAndClick(page, 'button:has-text("复制令牌")', "复制令牌", { postClickDelay: 1400 });
      await subtitle(page, "一次性邀请,过期作废", 1600);
    }
    await subtitle(page, "");

    // ========== S7 收尾 ==========
    log("S7 footer");
    await moveAndClick(page, 'a:has-text("研究概览")', "导航·研究概览", { postClickDelay: 2800 });
    const H2 = await page.evaluate(() => document.body.scrollHeight);
    await page.mouse.move(960, 540, { steps: 4 });
    await slowWheel(page, Math.max(800, H2 - 1080)); // 慢滚到底,页脚 ATLAS 显影逐步呈现
    await subtitle(page, "让下一次发现,从已有知识开始。", 2800);
    await subtitle(page, "");
    await wait(page, 1200);

    log(MODE === "record" ? "RECORD DONE" : "REHEARSAL DONE", failures.length ? `failures: ${failures.join(", ")}` : "all steps ok");
  } catch (err) {
    log("DEMO ERROR:", err.message.slice(0, 200));
    failures.push("EXCEPTION:" + err.message.slice(0, 80));
  } finally {
    await context.close().catch(() => {});
    if (MODE === "record") {
      try {
        const src = await page.video().path();
        const dest = resolve(process.cwd(), "..", "data", "demo", "recordings", `lab-galaxy-demo-${Date.now()}.webm`);
        mkdirSync(resolve(process.cwd(), "..", "data", "demo", "recordings"), { recursive: true });
        copyFileSync(src, dest);
        log("Video saved:", dest);
      } catch (e) { log("video copy error:", e.message); }
    }
    await browser.close();
    if (failures.length) process.exitCode = 1;
  }
})();
