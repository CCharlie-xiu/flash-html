#!/usr/bin/env node
/**
 * flash-html — free Markdown + one-line @layout → wuch-ai-ui page.
 * Usage: node render.mjs <answer.md> [out.html] [--open]
 *
 * v2 新增指令（仍是一行一行写，不用 JSON）：
 *   @layout answer|report|split|compare|cards   版式（原有）
 *   @chip 文本                                   题头小标签（原有）
 *   @band 键|值                                  指标带（原有）
 *   @skeleton 段落|表格|步骤|图表                骨架屏（行高块严格匹配真实排版）
 *   @chart 类型|标题|数据                        图表（bar|line|donut|stack）
 *   @flow 步骤1|步骤2|步骤3                      单向流程条（视线只向右）
 *   @field 标签|占位符|校验提示                  行内实时校验字段
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const wantOpen = argv.includes("--open") || process.env.FLASH_HTML_OPEN === "1";
const args = argv.filter((a) => a !== "--open");

if (!args[0]) {
  console.error("Usage: node render.mjs <answer.md> [out.html] [--open]");
  process.exit(1);
}

const inPath = path.resolve(args[0]);
const base = path.basename(inPath, path.extname(inPath)) || "answer";
const outPath = path.resolve(args[1] || path.join(process.cwd(), ".flash-html", `${base}.html`));

const LAYOUTS = {
  answer: { label: "回答页", graphic: "orb" },
  report: { label: "汇报页", graphic: "bars" },
  split: { label: "图文页", graphic: "frame" },
  compare: { label: "对比页", graphic: "split" },
  cards: { label: "卡片页", graphic: "grid" },
};

const SVGS = {
  orb: `<svg viewBox="0 0 132 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="12" width="116" height="72" rx="16" fill="#edf2f0" stroke="#ccd8d2"/>
  <circle cx="92" cy="36" r="22" fill="#223d36"/>
  <circle cx="84" cy="30" r="7" fill="#fff" opacity=".88"/>
  <rect x="22" y="28" width="42" height="6" rx="3" fill="#ccd8d2"/>
  <rect x="22" y="42" width="34" height="6" rx="3" fill="#e6e8eb"/>
  <rect x="22" y="56" width="48" height="6" rx="3" fill="#e6e8eb"/>
</svg>`,
  bars: `<svg viewBox="0 0 132 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="14" width="112" height="68" rx="12" fill="#fff" stroke="#e6e8eb"/>
  <rect x="28" y="58" width="14" height="14" rx="3" fill="#a6adb8"/>
  <rect x="50" y="46" width="14" height="26" rx="3" fill="#5b6470"/>
  <rect x="72" y="34" width="14" height="38" rx="3" fill="#2b5548"/>
  <rect x="94" y="26" width="14" height="46" rx="3" fill="#223d36"/>
</svg>`,
  frame: `<svg viewBox="0 0 132 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="16" width="50" height="64" rx="10" fill="#edf2f0" stroke="#ccd8d2"/>
  <rect x="70" y="22" width="50" height="8" rx="4" fill="#17191d"/>
  <rect x="70" y="38" width="44" height="6" rx="3" fill="#e6e8eb"/>
  <rect x="70" y="50" width="40" height="6" rx="3" fill="#e6e8eb"/>
  <rect x="70" y="62" width="36" height="6" rx="3" fill="#e6e8eb"/>
</svg>`,
  split: `<svg viewBox="0 0 132 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="16" width="50" height="64" rx="10" fill="#edf2f0" stroke="#ccd8d2"/>
  <rect x="72" y="16" width="50" height="64" rx="10" fill="#fff" stroke="#e6e8eb"/>
  <path d="M66 28v40" stroke="#d8dce1" stroke-width="2" stroke-dasharray="3 4"/>
  <circle cx="35" cy="48" r="12" fill="#223d36"/>
  <rect x="82" y="36" width="28" height="6" rx="3" fill="#e6e8eb"/>
  <rect x="82" y="50" width="22" height="6" rx="3" fill="#e6e8eb"/>
</svg>`,
  grid: `<svg viewBox="0 0 132 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="18" width="48" height="28" rx="8" fill="#fff" stroke="#e6e8eb"/>
  <rect x="72" y="18" width="48" height="28" rx="8" fill="#edf2f0" stroke="#ccd8d2"/>
  <rect x="12" y="54" width="48" height="28" rx="8" fill="#edf2f0" stroke="#ccd8d2"/>
  <rect x="72" y="54" width="48" height="28" rx="8" fill="#fff" stroke="#e6e8eb"/>
</svg>`,
  heroBig: `<svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="16" y="20" width="188" height="140" rx="20" fill="#fff" stroke="#ccd8d2"/>
  <circle cx="110" cy="78" r="36" fill="#223d36"/>
  <circle cx="98" cy="68" r="10" fill="#fff" opacity=".9"/>
  <rect x="54" y="128" width="112" height="10" rx="5" fill="#e6e8eb"/>
  <rect x="70" y="146" width="80" height="8" rx="4" fill="#edf2f0"/>
</svg>`,
};

/* ============================================================
   图表引擎
   ------------------------------------------------------------
   分类用 --chart-1..6（色相分离 + 明度交替，实测全部 ≥5.16:1 on 白底）；
   单序列优先用 --ramp-1..8（pine 单色明度阶梯），避免同屏多序列色相难分。
   数字标签一律等宽（tabular-nums），不跳字。
   ============================================================ */
const CHART_COLORS = ["#223d36", "#8a5a12", "#2e4a6b", "#8a6272", "#1f6b3f", "#5b6470"];
const RAMP = ["#223d36", "#2b5548", "#3a6355", "#5b8477", "#8aa79b", "#b7c9c1", "#d3dfda", "#e7eeeb"];

function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

/** 柱状图：单序列用 ramp 阶梯，多序列用 chart 分类色板 */
function renderBar(rows, { width = 720, barH = 22, gap = 10, labelW = 96 } = {}) {
  const rowH = barH + gap;
  const height = rows.length * rowH + 8;
  const plotX = labelW + 8;
  const plotW = width - plotX - 56;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const multi = rows.some((r) => Array.isArray(r.values));

  const parts = [];
  parts.push(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="柱状图">`);
  rows.forEach((r, i) => {
    const y = i * rowH + 4;
    // 轨道：明确「容量上限」的空间语义
    parts.push(
      `<rect x="${plotX}" y="${y}" width="${plotW}" height="${barH}" rx="4" fill="var(--chart-track)"/>`
    );
    if (multi) {
      const total = r.values.reduce((a, b) => a + b, 0) || 1;
      let cx = plotX;
      r.values.forEach((v, si) => {
        const w = (v / total) * plotW;
        parts.push(
          `<rect class="bar" x="${cx}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${
            CHART_COLORS[si % CHART_COLORS.length]
          }"><title>${esc(r.label)} · ${esc(r.names?.[si] ?? `系列${si + 1}`)}：${fmtNum(v)}</title></rect>`
        );
        cx += w;
      });
      parts.push(
        `<text class="lbl num" x="${plotX + plotW + 8}" y="${y + barH / 2 + 4}">${fmtNum(total)}</text>`
      );
    } else {
      const w = (r.value / max) * plotW;
      const color = RAMP[Math.min(7, Math.round((r.value / max) * 7))];
      parts.push(
        `<rect class="bar" x="${plotX}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}"><title>${esc(
          r.label
        )}：${fmtNum(r.value)}</title></rect>`
      );
      parts.push(
        `<text class="lbl num" x="${plotX + w + 8}" y="${y + barH / 2 + 4}">${fmtNum(r.value)}</text>`
      );
    }
    parts.push(
      `<text class="lbl" x="${labelW}" y="${y + barH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>`
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

/** 折线图：单序列 */
function renderLine(rows, { width = 720, height = 200, padL = 44, padR = 16, padT = 16, padB = 30 } = {}) {
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const step = rows.length > 1 ? plotW / (rows.length - 1) : 0;
  const px = (i) => padL + i * step;
  const py = (v) => padT + plotH - (v / max) * plotH;

  const parts = [];
  parts.push(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="折线图">`);
  // 横向网格 + y 轴刻度
  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g;
    const y = py(v);
    parts.push(`<line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}"/>`);
    parts.push(
      `<text class="lbl num" x="${padL - 8}" y="${y + 4}" text-anchor="end">${fmtNum(Math.round(v))}</text>`
    );
  }
  // 面积（浅色，带透明度，不抢线）
  const area = `M ${px(0)} ${py(rows[0].value)} ` +
    rows.map((r, i) => `L ${px(i)} ${py(r.value)}`).join(" ") +
    ` L ${px(rows.length - 1)} ${padT + plotH} L ${padL} ${padT + plotH} Z`;
  parts.push(`<path d="${area}" fill="var(--ramp-2)" opacity=".10"/>`);
  // 折线
  const line = `M ${px(0)} ${py(rows[0].value)} ` +
    rows.map((r, i) => `L ${px(i)} ${py(r.value)}`).join(" ");
  parts.push(
    `<path d="${line}" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
  );
  // 数据点 + 值标签
  rows.forEach((r, i) => {
    parts.push(`<circle cx="${px(i)}" cy="${py(r.value)}" r="3.5" fill="var(--chart-1)"/>`);
    parts.push(
      `<text class="lbl num" x="${px(i)}" y="${py(r.value) - 9}" text-anchor="middle">${fmtNum(r.value)}</text>`
    );
    parts.push(
      `<text class="lbl" x="${px(i)}" y="${height - 10}" text-anchor="middle">${esc(r.label)}</text>`
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

/** 环形图：分类色板 + 中间总量 */
function renderDonut(rows, { width = 720, height = 220 } = {}) {
  const cx = 118;
  const cy = height / 2;
  const r = 74;
  const sw = 26;
  const total = rows.reduce((a, b) => a + b.value, 0) || 1;
  const parts = [];
  parts.push(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="环形图">`);
  let angle = -Math.PI / 2;
  rows.forEach((row, i) => {
    const frac = row.value / total;
    const a2 = angle + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    parts.push(
      `<path class="bar" d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${
        CHART_COLORS[i % CHART_COLORS.length]
      }" stroke-width="${sw}"><title>${esc(row.label)}：${fmtNum(row.value)}（${fmtNum(
        frac * 100
      )}%）</title></path>`
    );
    angle = a2;
  });
  parts.push(
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="var(--font-mono)" font-size="19" font-weight="600" fill="var(--ink-900)">${fmtNum(
      total
    )}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10.5" fill="var(--chart-label)">合计</text>`
  );
  // 图例：名称 + 数值 + 占比，三栏对齐
  const lx = 250;
  const ly = 46;
  rows.forEach((row, i) => {
    const y = ly + i * 30;
    parts.push(
      `<rect x="${lx}" y="${y - 9}" width="9" height="9" rx="2" fill="${
        CHART_COLORS[i % CHART_COLORS.length]
      }"/>`
    );
    parts.push(`<text class="series-label" x="${lx + 17}" y="${y}">${esc(row.label)}</text>`);
    parts.push(
      `<text class="lbl num" x="${width - 96}" y="${y}" text-anchor="end">${fmtNum(row.value)}</text>`
    );
    parts.push(
      `<text class="lbl num" x="${width - 16}" y="${y}" text-anchor="end">${fmtNum(
        (row.value / total) * 100
      )}%</text>`
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

/** 图表入口：类型|标题|标签:值,标签:值 */
function renderChart(spec) {
  const seg = spec.split("|").map((s) => s.trim());
  const type = (seg[0] || "bar").toLowerCase();
  const title = seg[1] || "";
  const dataRaw = seg[2] || "";
  const rows = [];
  for (const pair of dataRaw.split(/[,，]/)) {
    const m = pair.match(/^([^:：]+)[:：](.+)$/);
    if (!m) continue;
    const label = m[1].trim();
    const nums = m[2].split(/[,，]/).map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n));
    if (!nums.length) continue;
    rows.push(nums.length > 1 ? { label, values: nums } : { label, value: nums[0] });
  }
  if (!rows.length) return "";

  let svg = "";
  if (type === "line") svg = renderLine(rows);
  else if (type === "donut") svg = renderDonut(rows);
  else svg = renderBar(rows);

  const legend =
    rows[0]?.values
      ? `<div class="chart-legend">${rows[0].values
          .map(
            (_, i) =>
              `<span class="li"><span class="sw" style="background:${
                CHART_COLORS[i % CHART_COLORS.length]
              }"></span>系列 ${i + 1}</span>`
          )
          .join("")}</div>`
      : "";

  return `<div class="block"><div class="chart">${
    title ? `<div class="chart-title">${esc(title)}</div>` : ""
  }${svg}${legend}</div></div>`;
}

/* ============================================================
   骨架屏生成
   ------------------------------------------------------------
   关键：行高块高度取自 kit.css 的 --lh-* 变量（同一份真值），
   图标圆圈取真实图标尺寸（28 / 20 / 40），因此加载完成时零布局跳动。
   ============================================================ */
function skText(widthPct, lh = "body") {
  return `<div class="sk sk-text" data-lh="${lh}" style="width:${widthPct}%"></div>`;
}
function skCircle(size = "") {
  return `<div class="sk sk-circle"${size ? ` data-size="${size}"` : ""}></div>`;
}
function renderSkeleton(spec) {
  const kind = (spec || "段落").trim();
  if (/表格/.test(kind)) {
    const cols = 4;
    const rowsN = 4;
    let out = `<div class="sk-table"><div class="sk-th">`;
    for (let i = 0; i < cols; i++) out += `<div class="sk sk-cell" style="flex:0 0 ${i === 0 ? "22%" : "26%"}"></div>`;
    out += `</div>`;
    for (let r = 0; r < rowsN; r++) {
      out += `<div class="sk-tr">`;
      for (let i = 0; i < cols; i++)
        out += `<div class="sk sk-cell" style="flex:0 0 ${i === 0 ? "22%" : "26%"}"></div>`;
      out += `</div>`;
    }
    out += `</div>`;
    return `<div class="block">${out}</div>`;
  }
  if (/步骤/.test(kind)) {
    // 复刻真实 .steps li：28px 序号圆 + 标题行 + 正文行
    let out = "";
    const widths = [[92, 70], [88, 54], [95, 76], [80, 48]];
    for (let i = 0; i < 4; i++) {
      out += `<div class="sk-row">${skCircle()}<div class="sk-lines">${skText(widths[i][0], "title")}${skText(
        widths[i][1],
        "stepb"
      )}</div></div>`;
    }
    return `<div class="block">${out}</div>`;
  }
  if (/列表|条目/.test(kind)) {
    // 复刻真实 .bullets li：6px 圆点 + 文本行（padding 8px）
    let out = "";
    const widths = [92, 78, 86, 64];
    for (let i = 0; i < 4; i++) {
      out += `<div class="sk-row" data-variant="bullet"><div class="sk sk-dot"></div><div class="sk-lines">${skText(
        widths[i],
        "p"
      )}</div></div>`;
    }
    return `<div class="block">${out}</div>`;
  }
  if (/图/.test(kind)) {
    return `<div class="block"><div class="sk sk-figure"></div></div>`;
  }
  // 默认段落：行距与真实 .p + .p 一致
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += `<div class="sk-para">${skText("96%", "p")}${skText(i === 2 ? "62%" : "88%", "p")}</div>`;
  }
  return `<div class="block">${out}</div>`;
}

/** 单向流程条：视线只向右推进，节点表达「到哪一步」 */
function renderFlow(spec) {
  const steps = spec.split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
  if (!steps.length) return "";
  const items = steps
    .map((s, i) => {
      const [t, ...rest] = s.split(/[：:]/);
      const body = rest.join(":").trim();
      const state = i === 0 ? "current" : "pending";
      return `<li data-state="${state}">
        <span class="fnode">${i + 1}</span>
        <span class="ftitle">${esc(t)}</span>
        ${body ? `<span class="fbody">${esc(body)}</span>` : ""}
      </li>`;
    })
    .join("");
  return `<div class="block"><ol class="flow">${items}</ol></div>`;
}

/** 行内实时校验字段：标签|占位符|提示 */
function renderField(spec) {
  const seg = spec.split("|").map((s) => s.trim());
  const label = seg[0] || "";
  const ph = seg[1] || "";
  const hint = seg[2] || "";
  return `<div class="block"><div class="field" data-state="idle">
    <label>${esc(label)}</label>
    <div class="control"><input type="text" placeholder="${esc(ph)}" aria-label="${esc(label)}"></div>
    <div class="hint"><span class="mk">·</span><span class="ht">${esc(hint)}</span></div>
  </div></div>`;
}

let src = fs.readFileSync(inPath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const css = fs.readFileSync(path.join(ROOT, "templates", "kit.css"), "utf8");
const shell = fs.readFileSync(path.join(ROOT, "templates", "shell.html"), "utf8");

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function isTableSep(line) {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line);
}
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function mdToBlocks(md, { asCards = false } = {}) {
  const lines = md.split("\n");
  const blocks = [];
  let i = 0;
  let cardOpen = false;

  const closeCard = () => {
    if (cardOpen) {
      blocks.push("</div>");
      cardOpen = false;
    }
  };
  const openCard = (title) => {
    closeCard();
    blocks.push(`<div class="card-block"><h3>${inline(title)}</h3>`);
    cardOpen = true;
  };

  const pushP = (buf) => {
    const t = buf.join(" ").trim();
    if (t) blocks.push(`<div class="block"><p class="p">${inline(t)}</p></div>`);
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim() || "text";
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        `<div class="block"><pre class="pre"><span class="lang">${esc(lang)}</span>${esc(
          code.join("\n")
        )}</pre></div>`
      );
      continue;
    }

    if (/^@\s*(skeleton|chart|flow|field)\b/i.test(line)) {
      // 内容级指令：可在正文任意位置出现，输出顺序即视觉顺序
      const m = line.match(/^@\s*(skeleton|chart|flow|field)\s*[:：]?\s*(.+?)\s*$/i);
      const kind = m[1].toLowerCase();
      const spec = m[2].trim();
      if (kind === "skeleton") blocks.push(renderSkeleton(spec));
      else if (kind === "chart") blocks.push(renderChart(spec));
      else if (kind === "flow") blocks.push(renderFlow(spec));
      else if (kind === "field") blocks.push(renderField(spec));
      i++;
      continue;
    }

    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2].trim();
      if (asCards && level <= 2) {
        openCard(text);
      } else if (level === 1) {
        blocks.push(`<div class="block"><p class="p"><strong>${inline(text)}</strong></p></div>`);
      } else {
        blocks.push(`<div class="block"><div class="sec-title">${inline(text)}</div></div>`);
      }
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const parts = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        parts.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const text = parts.join(" ").trim();
      let tone = "info";
      if (/^(注意|警告|warn)/i.test(text)) tone = "warn";
      else if (/^(结论|OK|ok|好消息)/i.test(text)) tone = "ok";
      blocks.push(
        `<div class="block"><div class="callout ${tone}"><strong>${
          tone === "warn" ? "注意" : tone === "ok" ? "结论" : "说明"
        }</strong>${inline(text)}</div></div>`
      );
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      // 数字列识别：整列内容均为纯数字 → 右对齐 + 等宽（时间/计数不跳字）
      const isNumCol = headers.map((_, ci) =>
        rows.length > 0 &&
        rows.every((r) => {
          const c = (r[ci] ?? "").trim();
          return c !== "" && /^[-+]?[\d,.]+\s*[%‰]?$/.test(c);
        })
      );
      blocks.push(
        `<div class="block"><div class="table-wrap"><table><thead><tr>${headers
          .map((h, ci) => `<th${isNumCol[ci] ? ' class="num"' : ""}>${esc(h)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr>${r
                .map(
                  (c, ci) =>
                    `<td${isNumCol[ci] ? ' class="num"' : ""}>${inline(c)}</td>`
                )
                .join("")}</tr>`
          )
          .join("")}</tbody></table></div></div>`
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        `<div class="block"><ul class="bullets">${items
          .map((it) => `<li>${inline(it)}</li>`)
          .join("")}</ul></div>`
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        `<div class="block"><ol class="steps">${items
          .map((it) => {
            const [t, ...rest] = it.split(/[：:]/);
            if (rest.length) {
              return `<li><div><div class="step-title">${inline(t)}</div><div class="step-body">${inline(
                rest.join(":")
              )}</div></div></li>`;
            }
            return `<li><div><div class="step-title">${inline(it)}</div></div></li>`;
          })
          .join("")}</ol></div>`
      );
      continue;
    }

    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^@\s*(skeleton|chart|flow|field)\b/i.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    pushP(buf);
  }

  closeCard();
  if (asCards && !blocks.some((b) => b.includes("card-block"))) {
    return `<div class="card-block">${blocks.join("\n") || `<div class="block"><p class="p">${inline(md)}</p></div>`}</div>`;
  }
  return blocks.join("\n") || `<div class="block"><p class="p">${inline(md)}</p></div>`;
}

// —— parse directives (1–3 lines, not JSON) ——
// 注意：只有 layout / chip / band 是「头部指令」，会在正文前被剥离。
// skeleton / chart / flow / field 是「内容级指令」，留在正文里按出现位置渲染。
let layout = "answer";
const chips = [];
const band = [];

while (true) {
  const m = src.match(/^\s*@(layout|chip|band)\s*[:：]?\s*(.+)\s*\n+/i);
  if (!m) break;
  const key = m[1].toLowerCase();
  const val = m[2].trim();
  if (key === "layout") layout = val.toLowerCase();
  else if (key === "chip") chips.push(val);
  else if (key === "band") {
    const [k, ...rest] = val.split(/[|｜]/);
    band.push({ k: (k || "").trim(), v: rest.join("|").trim() || "—" });
  }
  src = src.slice(m[0].length);
}

if (!LAYOUTS[layout]) layout = "answer";
const layoutMeta = LAYOUTS[layout];

let title = base;
let bodyMd = src;
const titleMatch = src.match(/^#\s+(.+)\n?/);
if (titleMatch) {
  title = titleMatch[1].trim();
  bodyMd = src.slice(titleMatch[0].length).replace(/^\n+/, "");
}

let lede = "";
const ledeMatch = bodyMd.match(/^>\s*(?:lede|sub)\s*[:：]\s*(.+)\n+/i);
if (ledeMatch) {
  lede = `<p class="lede">${inline(ledeMatch[1].trim())}</p>`;
  bodyMd = bodyMd.slice(ledeMatch[0].length);
} else {
  // first short quote as lede
  const q = bodyMd.match(/^>\s*(?!注意|警告|结论|warn|ok)(.+)\n+/i);
  if (q && q[1].length <= 80) {
    lede = `<p class="lede">${inline(q[1].trim())}</p>`;
    bodyMd = bodyMd.slice(q[0].length);
  }
}

let body;
if (layout === "compare" || layout === "split") {
  const parts = bodyMd.split(/\n---\n/);
  if (layout === "split") {
    if (parts[1]) {
      body = `<div class="col col-visual">${SVGS.heroBig}<div style="margin-top:12px;max-width:220px">${mdToBlocks(
        parts[0]
      )}</div></div><div class="col">${mdToBlocks(parts[1])}</div>`;
    } else {
      body = `<div class="col col-visual">${SVGS.heroBig}</div><div class="col">${mdToBlocks(
        bodyMd
      )}</div>`;
    }
  } else {
    const left = mdToBlocks(parts[0] || "");
    const right = mdToBlocks(parts[1] || parts[0] || "");
    body = `<div class="col">${left}</div><div class="col">${right}</div>`;
  }
} else if (layout === "cards") {
  body = mdToBlocks(bodyMd, { asCards: true });
} else {
  body = mdToBlocks(bodyMd);
}

// 内容级指令（skeleton / chart / flow / field）已在 mdToBlocks 内按出现位置渲染，
// 因此此处不再追加 —— 避免同一指令被渲染两次。

const bandHtml = band.length
  ? `<div class="band">${band
      .map((b) => `<div class="cell"><div class="k">${esc(b.k)}</div><div class="v">${esc(b.v)}</div></div>`)
      .join("")}</div>`
  : "";

const chipsHtml = chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("");
const now = new Date();
const stamp = now.toLocaleString("zh-CN", { hour12: false });
const stampIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
  now.getDate()
).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
  now.getSeconds()
).padStart(2, "0")}`;
const stampHtml = `<time datetime="${stampIso}">${esc(stamp)}</time>`;

const html = shell
  .replaceAll("{{TITLE}}", esc(title))
  .replaceAll("{{LAYOUT}}", esc(layout))
  .replaceAll("{{LAYOUT_LABEL}}", esc(layoutMeta.label))
  .replaceAll("{{CHIPS}}", chipsHtml)
  .replaceAll("{{LEDE}}", lede)
  .replaceAll("{{MAST_SVG}}", SVGS[layoutMeta.graphic] || SVGS.orb)
  .replaceAll("{{BAND}}", bandHtml)
  .replaceAll("{{BODY}}", body)
  .replaceAll("{{CSS}}", css)
  .replaceAll("{{STAMP}}", stampHtml);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log(outPath);

if (wantOpen) {
  if (process.platform === "darwin") spawn("open", [outPath], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "win32")
    spawn("cmd", ["/c", "start", "", outPath], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [outPath], { detached: true, stdio: "ignore" }).unref();
}
