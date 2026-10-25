import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validatePackage } from './package.mjs';

// One self-contained HTML file: the reader, the save page, and the signed package, with no network requests.
// The recipient's agent imports the package the page lets them save; nothing here depends on a server.
export const PACKAGE_FILENAME = 'engram-selection.json';
const web = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hash = value => `'sha256-${createHash('sha256').update(value).digest('base64')}'`;
export function exportFilename(title) {
  const base = String(title).replace(/[/\\<>:"|?*\[\]#\r\n]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 120) || 'Engram share';
  return `${base}.html`;
}
export async function renderShareHtml(input, { fileName, exportedAt = new Date().toISOString() } = {}) {
  const selection = validatePackage(input);
  const name = fileName || exportFilename(selection.title);
  const [css, js, logo] = await Promise.all(['style.css', 'app.js', 'logo.svg'].map(name => fs.readFile(path.join(web, name), 'utf8')));
  // The embedded package is data for the page script, never executed; escape anything that could close the element.
  const embedded = JSON.stringify({ ...selection, packageName: PACKAGE_FILENAME, fileName: name, exportedAt }).replace(/</gu, '\\u003c').replace(/\u2028/gu, '\\u2028').replace(/\u2029/gu, '\\u2029');
  const policy = `default-src 'none'; script-src ${hash(js)}; style-src ${hash(css)}; base-uri 'none'; form-action 'none'`;
  const sources = selection.files.map(file => `<p class="source-file">${escape(file.name)}</p>`).join('');
  const clip = `<article class="share"><header class="masthead"><p class="from">${selection.sender ? escape(selection.sender) + ' shared this with you' : 'Shared with you'}</p></header><h1>${escape(selection.title)}</h1><section class="brief"><div class="brief-text prose">${escape(selection.preview)}</div></section><section class="source"><p class="label">${selection.files.length > 1 ? 'Sources' : 'Source'}</p>${sources}</section><noscript><p class="meta">Turn on JavaScript to download the source or save it to your Engram.</p></noscript></article>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="referrer" content="no-referrer">
<title>${escape(selection.title)} · Engram</title>
<style>${css}</style>
</head>
<body class="recipient">
<div class="shell">
<header class="identity">${logo.trim()}<span>Engram</span></header>
<main id="main">${clip}</main>
</div>
<script type="application/json" id="engram-share">${embedded}</script>
<script>${js}</script>
</body>
</html>
`;
}
