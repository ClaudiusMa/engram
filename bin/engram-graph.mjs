// Knowledge graph for an Engram workspace.
// Each open rescans wiki/main and writes a fresh snapshot page to the system temp folder,
// so the view always matches the Markdown on disk. Nothing is written to the workspace.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Folders shown in the graph. raw/ holds originals and human-skills/ stays behind its own gate.
export const PAGE_TYPES = ["concepts", "entities", "positions", "questions", "projects", "sources", "notes"];
const SKIPPED_FILES = new Set(["index.md", "log.md"]);
const LINK_PATTERN = /\[\[([^\]\n]+?)\]\]/g;

export async function buildGraph(root) {
  const wikiRoot = path.join(root, "wiki", "main");
  const pages = [];

  for (const type of PAGE_TYPES) {
    for (const file of await listMarkdown(path.join(wikiRoot, type))) {
      const text = await fs.readFile(file, "utf8");
      pages.push(parsePage(wikiRoot, type, file, text));
    }
  }

  const byPath = new Map(pages.map((page) => [page.id, page]));
  const byName = new Map();
  for (const page of pages) {
    for (const key of [page.basename, page.title, ...page.aliases]) {
      const normalized = normalize(key);
      if (normalized && !byName.has(normalized)) byName.set(normalized, page);
    }
  }

  const edgeKeys = new Set();
  const links = [];
  for (const page of pages) {
    for (const target of page.rawLinks) {
      const resolved = resolveLink(page, target, byPath, byName);
      if (!resolved || resolved === page) continue;
      const key = [page.id, resolved.id].sort().join("\u0000");
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      links.push({ source: page.id, target: resolved.id });
    }
  }

  const degree = new Map();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  return {
    generated: new Date().toISOString(),
    nodes: pages.map(({ rawLinks, basename, aliases, ...node }) => ({ ...node, degree: degree.get(node.id) ?? 0 })),
    links,
  };
}

async function listMarkdown(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdown(full)));
    else if (entry.isFile() && entry.name.endsWith(".md") && !SKIPPED_FILES.has(entry.name)) files.push(full);
  }
  return files;
}

function parsePage(wikiRoot, type, file, text) {
  const { data, body } = splitFrontmatter(text);
  const basename = path.basename(file, ".md");
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();

  return {
    id: path.relative(wikiRoot, file).split(path.sep).join("/").replace(/\.md$/, ""),
    type,
    title: scalar(data.title) || heading || basename,
    tags: list(data.tags),
    status: scalar(data.status),
    updated: scalar(data.updated) || scalar(data.created),
    summary: summarize(body),
    basename,
    aliases: list(data.aliases),
    rawLinks: [...text.matchAll(LINK_PATTERN)].map((match) => match[1]),
  };
}

function splitFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: text };

  const data = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(item[1]);
      continue;
    }
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (pair) {
      currentKey = pair[1];
      data[currentKey] = pair[2];
    }
  }
  return { data, body: text.slice(match[0].length) };
}

function scalar(value) {
  if (typeof value !== "string") return "";
  return unquote(value.trim());
}

function list(value) {
  if (Array.isArray(value)) return value.map(unquote).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  const inline = value.trim().replace(/^\[|\]$/g, "");
  return inline.split(",").map(unquote).filter(Boolean);
}

function unquote(value) {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

// First prose paragraph, preferring a Summary section, with link syntax flattened.
function summarize(body) {
  const section = body.match(/^##\s+(?:Summary|What's in this source)\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m)?.[1] ?? body;
  const paragraph = section
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(#|!\[\[|---|\||```)/.test(block));
  if (!paragraph) return "";
  const flat = paragraph
    .replace(/\[\[([^\]|]+?)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[(?:[^\]]*\/)?([^\]#|]+)[^\]]*\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > 360 ? `${flat.slice(0, 357).trimEnd()}…` : flat;
}

function resolveLink(page, rawTarget, byPath, byName) {
  const target = rawTarget.split("|")[0].split("#")[0].trim().replace(/\.md$/, "");
  if (!target) return null;

  const pageDir = path.posix.dirname(page.id);
  const relative = path.posix.normalize(path.posix.join(pageDir, target));
  if (byPath.has(relative)) return byPath.get(relative);
  if (byPath.has(target)) return byPath.get(target);

  return byName.get(normalize(path.posix.basename(target))) ?? null;
}

function normalize(value) {
  return (value ?? "").toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

// Writes a fresh, self-contained snapshot page and returns its path.
// The page lives in the system temp folder, never in the workspace.
export async function writeGraphPage(root) {
  const graph = await buildGraph(root);
  graph.workspace = path.basename(root);
  const data = JSON.stringify(graph).replace(/</g, "\\u003c");
  const html = GRAPH_PAGE.replace("/*GRAPH_DATA*/null", data);

  const directory = path.join(os.tmpdir(), "engram-graph");
  await fs.mkdir(directory, { recursive: true });
  const id = createHash("sha1").update(root).digest("hex").slice(0, 8);
  const file = path.join(directory, `engram-graph-${id}.html`);
  await fs.writeFile(file, html);
  return file;
}

export async function openGraph(root, { open = true } = {}) {
  const file = await writeGraphPage(root);
  if (open) openInBrowser(file);
  return file;
}

function openInBrowser(target) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

// Visual references (Visor): eagle:MSP0HIXKVFTMG and eagle:MSP0HM65ISMNY for the tight
// editorial sans, italic accent and hairline grid; eagle:MOHNBFTTVSQAL for the big-number
// index and single hot accent; eagle:MKC5Z877TOWXV for dark mode as light on black.
const GRAPH_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Engram Graph</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'><style>rect{fill:%23111}%40media (prefers-color-scheme:dark){rect{fill:%23f2f2f0}}</style><rect x='126' y='126' width='68' height='68'/><rect x='126' y='252' width='68' height='68'/><rect x='252' y='60' width='68' height='260'/><rect y='60' width='68' height='260'/><rect width='320' height='64'/></svg>">
<style>
:root {
  --paper: #f1f0ec; --card: #fbfbf9; --ink: #111111; --ink-2: #4a4a47; --ink-3: #8c8b86;
  --rule: #1111111f; --grid: #11111109; --edge: #1111111c; --edge-hi: #111111b0; --halo: #f1f0ecee;
  --concepts: #f0167a; --entities: #2b54ff; --positions: #111111; --questions: #e39b00;
  --projects: #12985a; --sources: #a9a7a0; --notes: #8b5cf6;
  --glow: 0;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #050505; --card: #0e0e0e; --ink: #f2f2f0; --ink-2: #b4b3ae; --ink-3: #75746f;
    --rule: #ffffff1f; --grid: #ffffff08; --edge: #ffffff1a; --edge-hi: #ffffffb0; --halo: #050505ee;
    --concepts: #ff5aa6; --entities: #7d97ff; --positions: #f2f2f0; --questions: #ffc23d;
    --projects: #3fdc8c; --sources: #5f5e5a; --notes: #b493ff;
    --glow: 1;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--paper); color: var(--ink);
  font: 15px/1.45 "Inter Tight", "Helvetica Neue", -apple-system, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
body { background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 96px 96px; }
canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: grab; touch-action: none; }
canvas.dragging { cursor: grabbing; }
button { font: inherit; color: inherit; }
em { font-family: "Instrument Serif", "New York", ui-serif, Georgia, serif; font-style: italic; font-weight: 400; letter-spacing: -0.01em; }

.rail { position: fixed; top: 0; left: 0; bottom: 0; width: 320px; padding: 28px 24px 24px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 22px; scrollbar-width: none;
  background: linear-gradient(90deg, var(--paper) 70%, transparent); }
.rail::-webkit-scrollbar { display: none; }
.eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); display: flex; gap: 8px; align-items: center; }
.eyebrow .live { width: 6px; height: 6px; border-radius: 50%; background: var(--projects); }
.eyebrow .live.stale { background: var(--questions); }
h1 { font-size: 46px; line-height: 0.95; letter-spacing: -0.045em; font-weight: 600; margin: 10px 0 0; }
.lede { margin: 0; color: var(--ink-2); font-size: 15px; max-width: 30ch; }
.lede b { color: var(--ink); font-weight: 600; }
.stale-note { font-size: 13px; color: var(--ink-2); border-left: 2px solid var(--questions); padding-left: 10px; display: none; }
.stale-note.show { display: block; }

.search .field { position: relative; }
.search input::-webkit-search-cancel-button { -webkit-appearance: none; }
.search input { width: 100%; padding: 10px 0 10px 26px; border: 0; border-bottom: 1px solid var(--rule); background: transparent;
  font: inherit; font-size: 16px; color: var(--ink); outline: none; border-radius: 0; }
.search input::placeholder { color: var(--ink-3); }
.search input:focus { border-bottom-color: var(--ink); }
.search svg { position: absolute; left: 0; top: 50%; transform: translateY(-50%); color: var(--ink-3); }
.results { list-style: none; margin: 6px 0 0; padding: 0; }
.results:empty { display: none; }

.section-label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 4px; }
.index { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
.index li { border-bottom: 1px solid var(--rule); }
.index button { all: unset; box-sizing: border-box; width: 100%; display: grid; grid-template-columns: 48px 1fr auto; align-items: baseline;
  padding: 7px 0; cursor: pointer; }
.index .num { font-size: 24px; font-weight: 600; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
.index .name { font-size: 15px; }
.index .swatch { width: 9px; height: 9px; border-radius: 50%; background: var(--c); align-self: center; }
.index .off { color: var(--ink-3); }
.index .off .swatch { background: transparent; box-shadow: inset 0 0 0 1.5px var(--c); }
.index button:hover .name { text-decoration: underline; text-underline-offset: 3px; }
.index button:focus-visible, .list button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.list { list-style: none; margin: 0; padding: 0; }
.list button { all: unset; box-sizing: border-box; width: 100%; display: flex; gap: 12px; align-items: baseline; padding: 5px 0; cursor: pointer; }
.list .rank { font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; width: 18px; flex: none; }
.list .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; align-self: center; }
.list .t { flex: 1; min-width: 0; }
.list .n { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.list button:hover .t { text-decoration: underline; text-underline-offset: 3px; }

.panel { position: fixed; top: 16px; right: 16px; bottom: 16px; width: 380px; max-width: calc(100vw - 32px); overflow-y: auto;
  background: var(--card); border: 1px solid var(--rule); border-radius: 4px; padding: 26px 26px 30px;
  transform: translateX(calc(100% + 24px)); transition: transform 280ms cubic-bezier(.2,.8,.2,1); }
.panel.show { transform: none; }
.panel .close { all: unset; position: absolute; top: 14px; right: 16px; cursor: pointer; color: var(--ink-3); font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; }
.panel .close:hover { color: var(--ink); }
.panel .kind { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--c); font-weight: 600; display: flex; gap: 8px; align-items: center; }
.panel .kind i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.panel h2 { font-size: 32px; line-height: 1.02; letter-spacing: -0.035em; font-weight: 600; margin: 14px 0 16px; }
.panel .summary { font-size: 16px; line-height: 1.5; color: var(--ink-2); margin: 0 0 18px; }
.panel .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; }
.panel .tags span { font-size: 12px; padding: 2px 9px; border: 1px solid var(--rule); border-radius: 99px; color: var(--ink-2); }
.panel .meta { font: 12px/1.5 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink-3); padding: 12px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); overflow-wrap: anywhere; }
.panel .meta a { color: var(--ink); }
.panel h3 { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); font-weight: 500; margin: 22px 0 6px; display: flex; justify-content: space-between; }

.hint { position: fixed; right: 20px; bottom: 16px; font-size: 12px; color: var(--ink-3); pointer-events: none; transition: opacity 200ms; }
.zoom { position: fixed; right: 16px; bottom: 40px; display: flex; flex-direction: column; border: 1px solid var(--rule); background: var(--card); border-radius: 4px; }
.zoom button { all: unset; width: 34px; height: 34px; display: grid; place-items: center; cursor: pointer; color: var(--ink-2); font-size: 18px; }
.zoom button + button { border-top: 1px solid var(--rule); }
.zoom button:hover { color: var(--ink); }
body.panel-open .zoom, body.panel-open .hint { opacity: 0; pointer-events: none; }

.empty { position: fixed; inset: 0 0 0 320px; display: none; place-items: center; padding: 24px; }
.empty.show { display: grid; }
.empty div { max-width: 34ch; }
.empty p { font-size: 28px; line-height: 1.1; letter-spacing: -0.03em; font-weight: 600; margin: 0 0 10px; }
.empty span { color: var(--ink-2); }

@media (max-width: 760px) {
  .rail { width: 100%; bottom: auto; max-height: 46vh; padding: 20px 16px 12px; background: var(--paper); border-bottom: 1px solid var(--rule); gap: 16px; }
  h1 { font-size: 34px; }
  .panel { top: auto; left: 16px; height: 62vh; width: auto; transform: translateY(calc(100% + 24px)); }
  .hint { display: none; }
  .empty { inset: 46vh 0 0 0; }
}
</style>
</head>
<body>
<canvas id="graph" aria-label="Map of pages and the links between them"></canvas>

<aside class="rail">
  <div>
    <div class="eyebrow"><span class="live" id="live"></span><span id="freshness"></span></div>
    <h1>What’s <em>in</em> your Engram</h1>
  </div>
  <p class="lede" id="lede"></p>
  <p class="stale-note" id="stale">This map is a snapshot. Open <b>Engram Graph</b> again to see your latest pages.</p>
  <div class="search">
    <div class="field">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>
      <input id="search" type="search" placeholder="Find a page or topic" autocomplete="off" aria-label="Find a page or topic">
    </div>
    <ul class="list results" id="results"></ul>
  </div>
  <div>
    <p class="section-label">Show on the map</p>
    <ul class="index" id="index"></ul>
  </div>
  <div id="top-wrap">
    <p class="section-label">Most connected ideas</p>
    <ul class="list" id="top"></ul>
  </div>
</aside>

<aside class="panel" id="panel" aria-live="polite"></aside>
<div class="zoom"><button id="zin" aria-label="Zoom in">+</button><button id="zout" aria-label="Zoom out">−</button><button id="zfit" aria-label="Show everything" style="font-size:13px">⤢</button></div>
<div class="hint">Click a dot to read about it · drag to move · pinch or scroll to zoom</div>
<div class="empty" id="empty"><div><p>Nothing here <em>yet</em>.</p><span>As you add sources and notes, they appear here as a map. Open Engram Graph again afterwards to see them.</span></div></div>

<script>
const GRAPH = /*GRAPH_DATA*/null;
const TYPES = {
  concepts:  { one: "Idea",           many: "Ideas" },
  entities:  { one: "Person or thing", many: "People & things" },
  positions: { one: "Stance",         many: "Stances" },
  questions: { one: "Open question",  many: "Open questions" },
  projects:  { one: "Project",        many: "Projects" },
  sources:   { one: "Source",         many: "Sources" },
  notes:     { one: "My note",        many: "My notes" },
};
const ORDER = Object.keys(TYPES);
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const panel = document.getElementById("panel");
const searchBox = document.getElementById("search");
const rootStyle = getComputedStyle(document.documentElement);
const css = (name) => rootStyle.getPropertyValue(name).trim();
const color = Object.fromEntries(ORDER.map((t) => [t, css("--" + t)]));
const glow = css("--glow") === "1";
const fmt = new Intl.NumberFormat();

let enabled = new Set(ORDER.filter((t) => t !== "notes"));
try { const saved = JSON.parse(localStorage.getItem("engram-graph-types")); if (Array.isArray(saved)) enabled = new Set(saved); } catch {}

const nodes = GRAPH.nodes.map((n, i) => {
  const a = i * 2.399963, r = 14 * Math.sqrt(i + 1);
  return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, r: 3 + Math.sqrt(n.degree) * 1.7 };
});
const byId = new Map(nodes.map((n) => [n.id, n]));
const links = GRAPH.links.map((l) => ({ source: byId.get(l.source), target: byId.get(l.target) }));
const neighbors = new Map(nodes.map((n) => [n, new Set()]));
for (const l of links) { neighbors.get(l.source).add(l.target); neighbors.get(l.target).add(l.source); }

let view = { x: 0, y: 0, k: 1 }, hover = null, selected = null, query = "", alpha = 1, dpr = 1;
let dragNode = null, panning = null, moved = false, userMoved = false;
const visible = (n) => enabled.has(n.type);

// ---------- rail ----------
function renderFreshness() {
  const made = new Date(GRAPH.generated), mins = Math.round((Date.now() - made) / 60000);
  const time = made.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const label = mins < 1 ? "Updated just now" : mins < 60 ? "Updated " + mins + " min ago" : "Updated " + made.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + time;
  document.getElementById("freshness").textContent = label;
  const stale = mins >= 30;
  document.getElementById("live").classList.toggle("stale", stale);
  document.getElementById("stale").classList.toggle("show", stale);
}

function renderLede() {
  const shown = nodes.filter(visible), set = new Set(shown);
  const edges = links.filter((l) => set.has(l.source) && set.has(l.target)).length;
  document.getElementById("lede").innerHTML = nodes.length
    ? "<b>" + fmt.format(shown.length) + " pages</b> joined by <b>" + fmt.format(edges) + " links</b>. Bigger dots connect to more. Click any dot to read about it."
    : "Your map will grow as you add to Engram.";
}

function renderIndex() {
  const holder = document.getElementById("index");
  holder.innerHTML = "";
  for (const type of ORDER) {
    const count = nodes.filter((n) => n.type === type).length;
    if (!count) continue;
    const li = document.createElement("li");
    const on = enabled.has(type);
    li.innerHTML = '<button class="' + (on ? "" : "off") + '" style="--c:' + color[type] + '" aria-pressed="' + on + '" title="' + (on ? "Hide " : "Show ") + TYPES[type].many.toLowerCase() + '">' +
      '<span class="num">' + count + '</span><span class="name">' + TYPES[type].many + '</span><span class="swatch"></span></button>';
    li.firstChild.onclick = () => {
      on ? enabled.delete(type) : enabled.add(type);
      try { localStorage.setItem("engram-graph-types", JSON.stringify([...enabled])); } catch {}
      if (selected && !visible(selected)) select(null);
      renderIndex(); renderLede(); alpha = Math.max(alpha, 0.4);
    };
    holder.appendChild(li);
  }
}

function itemButton(n, extra) {
  return '<li><button data-id="' + esc(n.id) + '" style="--c:' + color[n.type] + '">' + (extra ?? "") +
    '<i class="dot"></i><span class="t">' + esc(n.title) + '</span><span class="n">' + n.degree + "</span></button></li>";
}
function wireList(el) {
  el.querySelectorAll("button[data-id]").forEach((b) => b.onclick = () => {
    const n = byId.get(b.dataset.id);
    if (!visible(n)) { enabled.add(n.type); renderIndex(); renderLede(); }
    select(n); flyTo(n);
  });
}

function renderTop() {
  const top = nodes.filter((n) => n.type === "concepts").sort((a, b) => b.degree - a.degree).slice(0, 8);
  document.getElementById("top-wrap").style.display = top.length ? "" : "none";
  const el = document.getElementById("top");
  el.innerHTML = top.map((n, i) => itemButton(n, '<span class="rank">' + String(i + 1).padStart(2, "0") + "</span>")).join("");
  wireList(el);
}

function renderResults() {
  const el = document.getElementById("results");
  if (!query) { el.innerHTML = ""; return; }
  const found = nodes.filter((n) => matches(n)).sort((a, b) => b.degree - a.degree).slice(0, 8);
  el.innerHTML = found.length ? found.map((n) => itemButton(n)).join("") : '<li style="color:var(--ink-3);font-size:14px;padding:6px 0">Nothing matches “' + esc(query) + "”.</li>";
  wireList(el);
}

searchBox.addEventListener("input", () => { query = searchBox.value.trim().toLowerCase(); renderResults(); });
searchBox.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") { searchBox.value = ""; query = ""; renderResults(); return; }
  if (ev.key !== "Enter") return;
  const first = document.querySelector("#results button");
  if (first) first.click();
});
function matches(n) {
  if (!query) return true;
  return (n.title + " " + n.tags.join(" ")).toLowerCase().includes(query);
}

// ---------- physics ----------
function tick() {
  const shown = nodes.filter(visible), set = new Set(shown);
  for (let i = 0; i < shown.length; i++) {
    const a = shown[i];
    for (let j = i + 1; j < shown.length; j++) {
      const b = shown[j];
      const dx = b.x - a.x, dy = b.y - a.y, d2 = Math.max(dx * dx + dy * dy, 16);
      if (d2 > 250000) continue;
      const f = (90 * alpha) / d2;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
  }
  for (const l of links) {
    if (!set.has(l.source) || !set.has(l.target)) continue;
    const dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
    const s = 0.5 / Math.min(l.source.degree || 1, l.target.degree || 1);
    const d = Math.sqrt(dx * dx + dy * dy) || 1, f = ((d - 64) / d) * s * alpha;
    l.source.vx += dx * f; l.source.vy += dy * f; l.target.vx -= dx * f; l.target.vy -= dy * f;
  }
  for (const n of shown) {
    if (n === dragNode) { n.vx = n.vy = 0; continue; }
    n.vx -= n.x * 0.005 * alpha; n.vy -= n.y * 0.005 * alpha;
    n.vx *= 0.6; n.vy *= 0.6;
    const sp = Math.hypot(n.vx, n.vy);
    if (sp > 12) { n.vx *= 12 / sp; n.vy *= 12 / sp; }
    n.x += n.vx; n.y += n.vy;
  }
  alpha = Math.max(alpha * 0.985, dragNode ? 0.25 : 0);
}

// ---------- drawing ----------
function railWidth() { return innerWidth > 760 ? 320 : 0; }
function railHeight() { return innerWidth > 760 ? 0 : innerHeight * 0.46; }
function screen(n) { return { x: innerWidth / 2 + view.x + n.x * view.k, y: innerHeight / 2 + view.y + n.y * view.k }; }

function draw() {
  const w = innerWidth, h = innerHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 + view.x, h / 2 + view.y);
  ctx.scale(view.k, view.k);

  const anchor = hover || selected;
  const focus = anchor ? new Set([anchor, ...neighbors.get(anchor)]) : null;
  const searching = !!query;

  ctx.lineWidth = 1 / view.k;
  ctx.strokeStyle = css("--edge");
  ctx.beginPath();
  for (const l of links) {
    if (!visible(l.source) || !visible(l.target)) continue;
    if (anchor && (l.source === anchor || l.target === anchor)) continue;
    ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y);
  }
  ctx.globalAlpha = focus || searching ? 0.35 : 1;
  ctx.stroke();
  if (anchor) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css("--edge-hi");
    ctx.lineWidth = 1.2 / view.k;
    ctx.beginPath();
    for (const m of neighbors.get(anchor)) if (visible(m)) { ctx.moveTo(anchor.x, anchor.y); ctx.lineTo(m.x, m.y); }
    ctx.stroke();
  }

  for (const n of nodes) {
    if (!visible(n)) continue;
    const dim = (focus && !focus.has(n)) || (searching && !matches(n));
    ctx.globalAlpha = dim ? 0.14 : 1;
    ctx.fillStyle = color[n.type];
    if (glow && !dim && n.type !== "sources") { ctx.shadowColor = color[n.type]; ctx.shadowBlur = (n === anchor ? 22 : 8) * Math.min(view.k, 1.5); }
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (n === selected) {
      ctx.globalAlpha = 1; ctx.lineWidth = 1.5 / view.k; ctx.strokeStyle = css("--ink");
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4 / view.k, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
  drawLabels(anchor, focus, searching);
}

// Labels are drawn in screen space, most-connected first, skipping any that would overlap.
function drawLabels(anchor, focus, searching) {
  const placed = [];
  const candidates = nodes.filter((n) => {
    if (!visible(n)) return false;
    if (focus) return focus.has(n);
    if (searching) return matches(n);
    if (n.type === "sources" || n.type === "notes") return view.k > 2.2 && n.r * view.k > 6;
    return n.r * view.k > 5.5 || view.k > 1.4;
  }).sort((a, b) => (b === anchor) - (a === anchor) || b.degree - a.degree);

  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  const halo = css("--halo"), ink = css("--ink"), ink2 = css("--ink-2");
  for (const n of candidates) {
    const p = screen(n);
    if (p.x < -100 || p.x > innerWidth + 100 || p.y < -40 || p.y > innerHeight + 40) continue;
    const big = n === anchor || n.degree >= 12;
    ctx.font = (big ? "600 13px " : "500 12px ") + '"Inter Tight","Helvetica Neue",-apple-system,system-ui,sans-serif';
    const text = n.title.length > 42 ? n.title.slice(0, 40) + "…" : n.title;
    const tw = ctx.measureText(text).width;
    const y = p.y + n.r * view.k + 4;
    const box = { x: p.x - tw / 2 - 3, y: y - 1, w: tw + 6, h: 16 };
    if (n !== anchor && placed.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) continue;
    placed.push(box);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4; ctx.strokeStyle = halo; ctx.strokeText(text, p.x, y);
    ctx.fillStyle = n === anchor || big ? ink : ink2; ctx.fillText(text, p.x, y);
  }
  ctx.globalAlpha = 1;
}

function frame() {
  if (alpha > 0.003) tick();
  if (!userMoved && alpha > 0.003) fit(false);
  draw();
  requestAnimationFrame(frame);
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
}

function fit(animate) {
  const shown = nodes.filter(visible);
  if (!shown.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of shown) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
  const left = railWidth(), top = railHeight();
  const availW = innerWidth - left - 48, availH = innerHeight - top - 64;
  const k = Math.min(2.2, Math.max(0.12, Math.min(availW / (maxX - minX + 80), availH / (maxY - minY + 80))));
  const cx = left + availW / 2 + 24 - innerWidth / 2, cy = top + availH / 2 + 24 - innerHeight / 2;
  const target = { k, x: cx - ((minX + maxX) / 2) * k, y: cy - ((minY + maxY) / 2) * k };
  animate ? animateView(target) : (view = target);
}

let anim = null;
function animateView(target) {
  const from = { ...view }, start = performance.now();
  cancelAnimationFrame(anim);
  const step = (t) => {
    const p = Math.min(1, (t - start) / 450), e = 1 - Math.pow(1 - p, 3);
    view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
    if (p < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function flyTo(n) {
  userMoved = true;
  const k = Math.max(view.k, 1.3);
  const panelW = panel.classList.contains("show") && innerWidth > 760 ? 400 : 0;
  const cx = (railWidth() - panelW) / 2, cy = innerWidth > 760 ? 0 : -innerHeight * 0.2;
  animateView({ k, x: cx - n.x * k, y: cy - n.y * k });
}
function zoomBy(f) {
  userMoved = true;
  animateView({ k: Math.min(6, Math.max(0.08, view.k * f)), x: view.x * f, y: view.y * f });
}

// ---------- input ----------
function toWorld(ev) { return { x: (ev.clientX - innerWidth / 2 - view.x) / view.k, y: (ev.clientY - innerHeight / 2 - view.y) / view.k }; }
function hit(ev) {
  const p = toWorld(ev);
  let best = null, bestD = Infinity;
  for (const n of nodes) {
    if (!visible(n)) continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < Math.max(n.r + 2, 8 / view.k) && d < bestD) { best = n; bestD = d; }
  }
  return best;
}

canvas.addEventListener("pointerdown", (ev) => {
  canvas.setPointerCapture(ev.pointerId); moved = false;
  const n = hit(ev);
  if (n) dragNode = n; else panning = { x: ev.clientX - view.x, y: ev.clientY - view.y, sx: ev.clientX, sy: ev.clientY };
  canvas.classList.add("dragging");
});
canvas.addEventListener("pointermove", (ev) => {
  if (dragNode) { const p = toWorld(ev); if (Math.hypot(p.x - dragNode.x, p.y - dragNode.y) > 2 / view.k) { moved = true; alpha = Math.max(alpha, 0.25); } if (moved) { dragNode.x = p.x; dragNode.y = p.y; } return; }
  if (panning) { if (Math.hypot(ev.clientX - panning.sx, ev.clientY - panning.sy) > 3) { moved = true; userMoved = true; } view.x = ev.clientX - panning.x; view.y = ev.clientY - panning.y; return; }
  hover = hit(ev);
  canvas.style.cursor = hover ? "pointer" : "grab";
});
canvas.addEventListener("pointerup", (ev) => {
  canvas.classList.remove("dragging");
  if (!moved) select(hit(ev));
  dragNode = null; panning = null;
});
canvas.addEventListener("pointerleave", () => { hover = null; });
canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault(); userMoved = true; cancelAnimationFrame(anim);
  const before = toWorld(ev);
  view.k = Math.min(6, Math.max(0.08, view.k * Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015))));
  view.x = ev.clientX - innerWidth / 2 - before.x * view.k;
  view.y = ev.clientY - innerHeight / 2 - before.y * view.k;
}, { passive: false });
document.getElementById("zin").onclick = () => zoomBy(1.4);
document.getElementById("zout").onclick = () => zoomBy(1 / 1.4);
document.getElementById("zfit").onclick = () => fit(true);
addEventListener("keydown", (ev) => { if (ev.key === "Escape") select(null); });
addEventListener("resize", () => { resize(); if (!userMoved) fit(false); });

// ---------- detail panel ----------
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function select(n) {
  selected = n;
  document.body.classList.toggle("panel-open", !!n);
  if (!n) { panel.classList.remove("show"); return; }
  const linked = [...neighbors.get(n)].sort((a, b) => b.degree - a.degree);
  const groups = ORDER.map((t) => [t, linked.filter((m) => m.type === t)]).filter(([, l]) => l.length);
  panel.style.setProperty("--c", color[n.type]);
  panel.innerHTML =
    '<button class="close">Close</button>' +
    '<div class="kind"><i></i>' + TYPES[n.type].one + (n.status && n.status !== "active" ? " · " + esc(n.status) : "") + "</div>" +
    "<h2>" + esc(n.title) + "</h2>" +
    (n.summary ? '<p class="summary">' + esc(n.summary) + "</p>" : "") +
    (n.tags.length ? '<div class="tags">' + n.tags.map((t) => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") +
    '<div class="meta">' + esc("wiki/main/" + n.id + ".md") + (n.updated ? "<br>Last updated " + esc(n.updated) : "") + "</div>" +
    (groups.length ? groups.map(([t, l]) => "<h3><span>" + TYPES[t].many + "</span><span>" + l.length + '</span></h3><ul class="list">' + l.map((m) => itemButton(m)).join("") + "</ul>").join("")
      : '<h3>Connections</h3><p class="summary">Not linked to anything yet.</p>');
  panel.querySelector(".close").onclick = () => select(null);
  wireList(panel);
  panel.classList.add("show");
  panel.scrollTop = 0;
}

// ---------- start ----------
resize();
renderFreshness(); setInterval(renderFreshness, 30000);
renderLede(); renderIndex(); renderTop();
document.getElementById("empty").classList.toggle("show", nodes.length === 0);
for (let i = 0; i < 250; i++) tick();
fit(false);
const linked = byId.get(decodeURIComponent(location.hash.replace(/^#page=/, "")));
if (linked) { select(linked); flyTo(linked); }
requestAnimationFrame(frame);
</script>
</body>
</html>`;

// Run directly by the Engram Graph launcher: node engram-graph.mjs <workspace>
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? ".");
  const file = await openGraph(root, { open: !process.argv.includes("--no-open") });
  console.log(file);
}
