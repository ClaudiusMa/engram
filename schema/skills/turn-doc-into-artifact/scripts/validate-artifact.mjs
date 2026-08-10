#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const options = parseArgs(process.argv.slice(2));
if (!options.artifact) usage("Missing --artifact <directory>");

const artifactDir = path.resolve(options.artifact);
const errors = [];
const warnings = [];
const html = await readRequired(path.join(artifactDir, "index.html"), "index.html");
const agents = await readRequired(path.join(artifactDir, "AGENTS.md"), "AGENTS.md");
await requirePath(path.join(artifactDir, "branding", "logo.svg"), "branding/logo.svg");

check(/<!doctype html>/i.test(html), "index.html must declare an HTML doctype");
check(/<meta\s+[^>]*name=["']viewport["']/i.test(html), "missing viewport meta tag");
check(/<body\s+[^>]*data-view=["']human["']/i.test(html), "body must default to data-view=\"human\"");
for (const id of ["view-switch", "human-view", "agent-view"]) check(hasId(html, id), `missing #${id}`);
check(/data-set-view=["']human["']/i.test(html), "missing Human view control");
check(/data-set-view=["']agent["']/i.test(html), "missing Agent view control");
check(/aria-pressed=/i.test(html), "view controls must expose aria-pressed");
check(/dataset\.view|setAttribute\(\s*["']data-view["']/i.test(html), "view script must update data-view");
check(/prefers-color-scheme/i.test(html), "artifact must honor the system color scheme");
check(!/\b(?:TODO|TBD|lorem ipsum)\b/i.test(html), "artifact contains placeholder text");
check(!/<script\s+[^>]*src=/i.test(html), "artifact must not depend on external JavaScript");

const sourceMeta = getMeta(html, "artifact-source");
const colorMeta = getMeta(html, "artifact-color-meaning");
check(Boolean(sourceMeta), "missing artifact-source metadata");
check(Boolean(colorMeta), "missing artifact-color-meaning metadata");

const manifest = getManifest(html);
if (!manifest) {
  errors.push("missing or invalid #artifact-source-manifest JSON");
} else {
  check(typeof manifest.source === "string" && manifest.source.trim(), "manifest.source must be non-empty");
  for (const field of ["sourceSections", "agentSectionsRendered", "humanSections", "unresolvedItems"]) {
    check(Array.isArray(manifest[field]), `manifest.${field} must be an array`);
  }
  if (Array.isArray(manifest.sourceSections) && Array.isArray(manifest.agentSectionsRendered)) {
    check(
      isSubsequence(manifest.sourceSections.map(normalize), manifest.agentSectionsRendered.map(normalize)),
      "Agent manifest must contain every source section in source order",
    );
  }
}

if (options.source) {
  const sourcePath = path.resolve(options.source);
  const source = await readRequired(sourcePath, "source file");
  check(normalize(sourceMeta).includes(normalize(path.basename(sourcePath))), "artifact-source does not name the source file");
  check(normalize(agents).includes(normalize(path.basename(sourcePath))), "AGENTS.md does not name the source file");
  if (manifest) {
    const headings = markdownHeadings(source);
    const listed = Array.isArray(manifest.sourceSections) ? manifest.sourceSections.map(normalize) : [];
    check(
      JSON.stringify(listed) === JSON.stringify(headings.map(normalize)),
      "sourceSections must match every Markdown level 2–6 heading in source order",
    );
    if (!headings.length) warnings.push("source has no Markdown level 2–6 headings; verify structure manually");
  }
}

const accents = [...html.matchAll(/--(blue|red|amber|green|teal|purple|pink)(?:[-_:]|\b)/gi)]
  .map((match) => match[1].toLowerCase())
  .filter((value, index, all) => all.indexOf(value) === index);
if (colorMeta && colorMeta.trim().toLowerCase() !== "none") {
  for (const accent of accents) {
    check(new RegExp(`\\b${accent}\\s*=`).test(colorMeta.toLowerCase()), `color metadata does not explain ${accent}`);
  }
}
if (accents.length > 3) warnings.push(`artifact declares ${accents.length} accent families; verify each is necessary`);
if (/\b(?:linear|radial)-gradient\(/i.test(html)) warnings.push("artifact uses gradients; verify they are neutral and necessary");

if (errors.length) {
  console.error(`Artifact validation failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  for (const warning of warnings) console.error(`  ! ${warning}`);
  process.exit(1);
}

console.log("Artifact validation passed");
console.log(`  artifact: ${artifactDir}`);
console.log(`  human sections: ${manifest?.humanSections?.length ?? "unknown"}`);
console.log(`  agent source sections: ${manifest?.agentSectionsRendered?.length ?? "unknown"}`);
console.log(`  unresolved items preserved: ${manifest?.unresolvedItems?.length ?? "unknown"}`);
for (const warning of warnings) console.log(`  ! ${warning}`);

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--artifact" || arg === "--source") {
      parsed[arg.slice(2)] = args[++index];
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function usage(error) {
  if (error) console.error(error);
  console.error("Usage: validate-artifact.mjs --artifact <directory> [--source <file>]");
  process.exit(error ? 1 : 0);
}

async function readRequired(filePath, label) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    errors.push(`missing or unreadable ${label}: ${filePath}`);
    return "";
  }
}

async function requirePath(filePath, label) {
  try {
    await fs.lstat(filePath);
  } catch {
    errors.push(`missing ${label}: ${filePath}`);
  }
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function hasId(text, id) {
  return new RegExp(`id=["']${id}["']`, "i").test(text);
}

function getMeta(text, name) {
  const tag = (text.match(/<meta\s+[^>]*>/gi) || []).find((item) => new RegExp(`name=["']${name}["']`, "i").test(item));
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] || "";
}

function getManifest(text) {
  const match = text.match(/<script\s+[^>]*id=["']artifact-source-manifest["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function markdownHeadings(source) {
  return source.split(/\r?\n/).map((line) => line.match(/^#{2,6}\s+(.+?)\s*#*$/)?.[1]).filter(Boolean);
}

function isSubsequence(expected, actual) {
  let cursor = 0;
  for (const value of actual) {
    if (value === expected[cursor]) cursor += 1;
  }
  return cursor === expected.length;
}

function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/[’‘]/g, "'").replace(/[—–]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}
