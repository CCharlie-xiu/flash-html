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
      const pct = (r.value / rows.reduce((a, b) => a + (b.value || 0), 0)) * 100;
      const color = RAMP[Math.min(7, Math.round((r.value / max) * 7))];
      parts.push(
        `<rect class="bar" data-idx="${i}" data-w="${w.toFixed(1)}" data-w-pct="${((pct / 100) * plotW).toFixed(1)}"
          data-note="${esc(r.label)}：${fmtNum(r.value)} 个仓库，占全部 ${pct.toFixed(1)}%"
          x="${plotX}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}"><title>${esc(
          r.label
        )}：${fmtNum(r.value)}</title></rect>`
      );
      parts.push(
        `<text class="lbl num" data-val="${fmtNum(r.value)}" data-pct="${pct.toFixed(1)}" x="${plotX + w + 8}" y="${y + barH / 2 + 4}">${fmtNum(r.value)}</text>`
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
      `<path class="bar" data-idx="${i}" data-value="${fmtNum(row.value)}" data-name="${esc(row.label)}" data-pct="${fmtNum(frac * 100)}"
        d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${
        CHART_COLORS[i % CHART_COLORS.length]
      }" stroke-width="${sw}"><title>${esc(row.label)}：${fmtNum(row.value)}（${fmtNum(
        frac * 100
      )}%）</title></path>`
    );
    angle = a2;
  });
  parts.push(
    `<text class="donut-center-num" data-idx="-1" x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="var(--font-mono)" font-size="19" font-weight="600" fill="var(--ink-900)">${fmtNum(
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
      `<rect data-idx="${i}" data-value="${fmtNum(row.value)}" data-name="${esc(row.label)}" data-pct="${fmtNum((row.value / total) * 100)}" x="${lx}" y="${y - 9}" width="9" height="9" rx="2" fill="${
        CHART_COLORS[i % CHART_COLORS.length]
      }"/>`
    );
    parts.push(`<text class="series-label" data-idx="${i}" data-value="${fmtNum(row.value)}" data-name="${esc(row.label)}" data-pct="${fmtNum((row.value / total) * 100)}" x="${lx + 17}" y="${y}">${esc(row.label)}</text>`);
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

  const total = rows.reduce((a, b) => a + (b.value || 0), 0);
  const attrs = type === "donut"
    ? `data-donut data-total="${total}" data-label="${esc(title)}" data-insight="（悬停查看明细）"`
    : `data-bar data-insight="${esc(title)} · 点击柱条查看说明"`;
  const segHtml = type === "donut" ? "" : `<div class="seg" role="tablist">
    <button type="button" data-mode="num" aria-selected="true">数量</button>
    <button type="button" data-mode="pct" aria-selected="false">占比 %</button>
  </div>`;
  const extra = type === "donut"
    ? `<div class="insight"><span class="k">${esc(title)}</span><b>${fmtNum(total)}</b><span class="k">（悬停查看明细）</span></div>`
    : `<div class="bar-note">${esc(title)} · 点击柱条查看说明</div>`;
  return `<div class="block"><div class="chart" ${attrs}>${
    title ? `<div class="chart-title">${esc(title)}</div>` : ""
  }${segHtml}${svg}${legend}${extra}</div></div>`;
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
  const steps = spec.split("|").map((s) => s.trim()).filter(Boolean);
  if (!steps.length) return "";
  const items = steps
    .map((s, i) => {
      const [main, ...tail] = s.split("｜");
      const [t, ...rest] = main.split(/[：:]/);
      const body = rest.join(":").trim();
      const extra = tail.join("|").trim();
      // extra 格式：标签1,标签2 详情正文（用第一个空格切；标签不含空格）
      var sp = extra.indexOf(" ");
      const tags = sp > 0 ? extra.slice(0, sp) : extra;
      const detail = sp > 0 ? extra.slice(sp + 1) : "";
      const state = i === 0 ? "current" : "pending";
      return `<li data-state="${state}" data-nav
        data-title="${esc(t)}"
        data-body="${esc(body)}"
        data-tags="${esc(tags || "")}"
        data-detail="${esc(detail || body)}">
        <span class="fnode">${i + 1}</span>
        <span class="ftitle">${esc(t)}</span>
        ${body ? `<span class="fbody">${esc(body)}</span>` : ""}
      </li>`;
    })
    .join("");
  return `<div class="block"><div class="flow-wrap" data-flow-wrap>
    <ol class="flow" data-flow>${items}</ol>
    <div class="flow-ctrl">
      <button type="button" class="btn" data-step="prev">← 上一步</button>
      <button type="button" class="btn primary" data-step="next">下一步 →</button>
      <span class="pos">1 / ${items.length}</span>
    </div>
    <div class="flow-detail">
      <div class="fd-title"></div>
      <div class="fd-body"></div>
      <div class="fd-tags"></div>
    </div>
  </div></div>`;
}

/** 可展开详情：标题|正文（正文内可用「；」分段，支持 **加粗**） */
function renderExpand(spec) {
  const seg = spec.split("|").map((s) => s.trim());
  const title = seg[0] || "详情";
  const body = seg.slice(1).join("|").trim();
  const paras = body.split(/[；;]\s+/).filter(Boolean).map((p) => `<p>${inline(p)}</p>`).join("");
  return `<div class="block"><details class="expand">
    <summary><svg class="caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>${inline(title)}</summary>
    <div class="xbody">${paras || `<p>${inline(body)}</p>`}</div>
  </details></div>`;
}

/** 锚点导航条：JS 自动映射正文 h2 */
function renderNav() {
  return `<div class="section-nav" aria-label="快速导航"></div>`;
}

/** 可筛选详情卡片区：@cards 标签1,标签2 / @card 名称|标签|摘要|详情|预览标题:内容;标题:内容 */
function renderCards(spec) {
  const tags = spec.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  return `<div class="block" data-cardset><div class="filter-bar" data-filter>
    <button type="button" class="pill" data-tag="all" aria-pressed="true">全部</button>
    ${tags.map((t) => `<button type="button" class="pill" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join("")}
    <span class="cnt">—</span>
  </div><div class="proj-grid"></div></div>`;
}

/** 单张卡片：名称|标签逗号分隔|摘要|详情|预览组（标题:内容;标题:内容） */
function renderCardSpec(spec) {
  const seg = spec.split("|").map((x) => x.trim());
  const name = seg[0] || "项目";
  const tags = (seg[1] || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  const desc = seg[2] || "";
  const detail = seg[3] || "";
  const miniRaw = seg[4] || "";
  let mini = "";
  if (miniRaw) {
    const views = miniRaw.split(/[；;]/).filter(Boolean).map((v, i) => {
      const p = v.split(/[:：]/);
      const t = p[0] || "视图" + (i + 1);
      const body = p.slice(1).join(":") || "";
      return `<div class="mini-view" data-view="${i}" data-on="${i === 0 ? "true" : "false"}"><pre>${esc(body)}</pre></div>`;
    });
    mini = `<div class="mini"><div class="mini-tabs">${miniRaw.split(/[；;]/).filter(Boolean).map((v, i) => {
      const t = v.split(/[:：]/)[0] || "视图" + (i + 1);
      return `<button type="button" data-view="${i}" aria-selected="${i === 0 ? "true" : "false"}">${esc(t)}</button>`;
    }).join("")}</div>${views.join("")}</div>`;
  }
  return `<details class="proj-card" data-tags="${esc(tags.join(","))}">
    <summary><span><span class="pc-name">${esc(name)}</span>
      <span class="pc-desc">${inline(desc)}</span>
      ${tags.length ? `<span class="pc-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span>` : ""}
    </span><span class="pc-more">›</span></summary>
    <div class="pc-body">${detail ? inline(detail) : ""}${mini}</div>
  </details>`;
}

/** 可检索目录：@catalog 标题|条目:分类,条目:分类;分类2:... （实际用 @cat 行） */
function renderCatalog(spec) {
  const seg = spec.split("|").map((x) => x.trim());
  const title = seg[0] || "目录";
  return `<div class="block"><div class="catalog" data-catalog>
    <div class="cat-head"><span class="cat-title">${esc(title)}</span><span class="cat-count">匹配 —</span></div>
    <label class="search"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
      <input type="search" placeholder="输入关键词实时检索…" aria-label="检索条目" /></label>
    <div class="cat-pills"></div>
    <div class="cat-items"></div>
    <div class="empty" hidden>没有匹配的条目</div>
  </div></div>`;
}

/** @cat 分类名|条目1,条目2,条目3 —— 填充最近的 catalog */
function renderCatLine(spec) {
  const seg = spec.split("|").map((x) => x.trim());
  const cat = seg[0] || "其他";
  const items = (seg[1] || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  return `<div data-cat-line data-cat="${esc(cat)}" data-items="${esc(items.join(","))}" hidden></div>`;
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

const srcForCopy = fs.readFileSync(inPath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
let src = srcForCopy;
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
  s = s.replace(/==([^=]+)==/g, '<mark class="hl">$1</mark>');
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

    if (/^@\s*(skeleton|chart|flow|field|expand|nav|cards|card|catalog|cat)\b/i.test(line)) {
      // 内容级指令：可在正文任意位置出现，输出顺序即视觉顺序
      const m = line.match(/^@\s*(skeleton|chart|flow|field|expand|nav|cards|card|catalog|cat)\s*[:：]?\s*(.*?)\s*$/i);
      const kind = m[1].toLowerCase();
      const spec = (m[2] || "").trim();
      if (kind === "skeleton") blocks.push(renderSkeleton(spec));
      else if (kind === "chart") blocks.push(renderChart(spec));
      else if (kind === "flow") blocks.push(renderFlow(spec));
      else if (kind === "expand") blocks.push(renderExpand(spec));
      else if (kind === "field") blocks.push(renderField(spec));
      else if (kind === "nav") blocks.push(renderNav());
      else if (kind === "cards") blocks.push(renderCards(spec));
      else if (kind === "card") blocks.push(renderCardSpec(spec));
      else if (kind === "catalog") blocks.push(renderCatalog(spec));
      else if (kind === "cat") blocks.push(renderCatLine(spec));
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
        const sid = "sec-" + text.replace(/[^\w\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
        blocks.push(`<div class="block"><h2 id="${sid}" class="sec-title">${inline(text)}</h2></div>`);
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
      let body = text;
      if (/^(注意|警告|warn)/i.test(text)) { tone = "warn"; body = text.replace(/^(注意|警告|warn)\s*[:：]?\s*/i, ""); }
      else if (/^(结论|OK|ok|好消息)/i.test(text)) { tone = "ok"; body = text.replace(/^(结论|OK|ok|好消息)\s*[:：]?\s*/i, ""); }
      blocks.push(
        `<div class="block"><div class="callout ${tone}"><strong>${
          tone === "warn" ? "注意" : tone === "ok" ? "结论" : "说明"
        }</strong>${inline(body)}</div></div>`
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
      !/^@\s*(skeleton|chart|flow|field|expand|nav|cards|card|catalog|cat)\b/i.test(lines[i]) &&
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
    const seg = val.split(/[|｜]/).map((x) => x.trim());
    band.push({ k: seg[0] || "", v: seg[1] || "—", jump: seg[2] || "", count: seg[3] === "count" });
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
      .map((b) => {
        const jump = b.jump ? ` data-jump="${esc(b.jump)}"` : "";
        const vHtml = b.count
          ? `<div class="v count" data-to="${esc(String(b.v).replace(/[^0-9.]/g, ""))}">${esc(b.v)}</div>`
          : `<div class="v">${esc(b.v)}</div>`;
        return `<div class="cell"${jump}><div class="k">${esc(b.k)}</div>${vHtml}</div>`;
      })
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
  .replaceAll("{{STAMP}}", stampHtml)
  .replaceAll("{{SOURCE_MD}}", srcForCopy.replace(/<\/script/gi, "<\\/script"));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log(outPath);

if (wantOpen) {
  if (process.platform === "darwin") spawn("open", [outPath], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "win32")
    spawn("cmd", ["/c", "start", "", outPath], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [outPath], { detached: true, stdio: "ignore" }).unref();
}
