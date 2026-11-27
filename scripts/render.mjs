#!/usr/bin/env node
/**
 * flash-html — free Markdown + one-line @layout → openui page.
 * Usage: node render.mjs <answer.md> [out.html] [--open]
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
      blocks.push(
        `<div class="block"><div class="table-wrap"><table><thead><tr>${headers
          .map((h) => `<th>${esc(h)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
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
let layout = "answer";
const chips = [];
const band = [];

const dirRe = /^@(layout|chip|band)\s*[:：]?\s*(.+)\s*$/i;
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

const bandHtml = band.length
  ? `<div class="band">${band
      .map((b) => `<div class="cell"><div class="k">${esc(b.k)}</div><div class="v">${esc(b.v)}</div></div>`)
      .join("")}</div>`
  : "";

const chipsHtml = chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("");
const stamp = new Date().toLocaleString("zh-CN", { hour12: false });

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
  .replaceAll("{{STAMP}}", esc(stamp));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log(outPath);

if (wantOpen) {
  if (process.platform === "darwin") spawn("open", [outPath], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "win32")
    spawn("cmd", ["/c", "start", "", outPath], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [outPath], { detached: true, stdio: "ignore" }).unref();
}
