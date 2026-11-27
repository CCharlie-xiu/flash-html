#!/usr/bin/env node
/**
 * flash-html v2 · 骨架屏精度回归测试
 *
 * 验收标准：骨架块与真实内容的渲染高度必须逐项相等（±0.05px）。
 * 这是「加载完成时零布局跳动」这一体验承诺的量化守卫。
 *
 * 用法：node scripts/skeleton-precision.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const kit = fs.readFileSync(path.join(ROOT, "templates", "kit.css"), "utf8");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${kit}
</style></head><body>
<div class="block" id="real"><p class="p">第一行真实文字内容用于测量行高占位</p><p class="p">第二行真实文字内容用于测量行高占位</p><p class="p">第三行真实文字内容用于测量行高占位</p></div>
<div class="block" id="sk"><div class="sk-para"><div class="sk sk-text" data-lh="p" style="width:96%"></div><div class="sk sk-text" data-lh="p" style="width:96%"></div><div class="sk sk-text" data-lh="p" style="width:96%"></div></div></div>
<div class="block" id="realstep"><ol class="steps"><li><div><div class="step-title">步骤标题</div><div class="step-body">步骤说明文字</div></div></li></ol></div>
<div class="block" id="skstep"><div class="sk-row"><div class="sk sk-circle"></div><div class="sk-lines"><div class="sk sk-text" data-lh="title" style="width:38%"></div><div class="sk sk-text" data-lh="stepb" style="width:72%"></div></div></div></div>
<div class="block" id="realbullet"><ul class="bullets"><li>条目文字内容用于测量</li></ul></div>
<div class="block" id="skbullet"><div class="sk-row" data-variant="bullet"><div class="sk sk-dot"></div><div class="sk-lines"><div class="sk sk-text" data-lh="p" style="width:60%"></div></div></div></div>
<div class="block" id="realtable"><div class="table-wrap"><table><thead><tr><th>列A</th><th>列B</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table></div></div>
<div class="block" id="sktable"><div class="sk-table"><div class="sk-th"><div class="sk sk-cell"></div><div class="sk sk-cell"></div></div><div class="sk-tr"><div class="sk sk-cell"></div><div class="sk sk-cell"></div></div></div></div>
<div id="out"></div>
<script>
var out=[];
function go(){
  function d(a,b){return (document.getElementById(b).getBoundingClientRect().height-document.getElementById(a).getBoundingClientRect().height).toFixed(2);}
  out.push('para='+d('real','sk'));
  out.push('step='+d('realstep','skstep'));
  out.push('bullet='+d('realbullet','skbullet'));
  out.push('table='+d('realtable','sktable'));
  document.getElementById('out').textContent=out.join('|');
}
if(document.readyState==='complete')go();else window.addEventListener('load',go);
</script></body></html>`;

const tmp = path.join(os.tmpdir(), `flash-sk-test-${Date.now()}.html`);
fs.writeFileSync(tmp, html, "utf8");

let raw = "";
try {
  raw = execFileSync(
    CHROME,
    ["--headless", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=3000", "--dump-dom", `file://${tmp}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
} catch (e) {
  raw = e.stdout || "";
}
fs.unlinkSync(tmp);

const m = raw.match(/<div id="out">([\s\S]*?)<\/div>/);
if (!m || !m[1].trim()) {
  console.error("✗ 无法从 Chrome 取到测量结果（Chrome 路径或 headless 不可用）");
  process.exit(2);
}

const results = m[1].trim().split("|").map((s) => s.trim());
const TOL = 0.05;
const NAMES = { para: "段落", step: "步骤", bullet: "条目", table: "表格" };

console.log("flash-html v2 · 骨架屏精度回归");
console.log("──────────────────────────────");
let failed = 0;
for (const r of results) {
  const [k, v] = r.split("=");
  const diff = Math.abs(Number(v));
  const ok = diff <= TOL;
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${NAMES[k] || k}：高度差 ${v}px ${ok ? "" : `（超出 ±${TOL}px 容差）`}`);
}
console.log("──────────────────────────────");
if (failed) {
  console.error(`✗ ${failed} 项未达标`);
  process.exit(1);
}
console.log("✓ 全部达标：加载完成时零布局跳动");
