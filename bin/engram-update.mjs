// Engram updates: find out when a new version is published and install it only after the user agrees.
//
//   node bin/engram-update.mjs check [workspace] [--json] [--force]   tell the user when an update is ready
//   node bin/engram-update.mjs apply [workspace]                      install it (only after the user says yes)
//   node bin/engram-update.mjs later [workspace]                      stop asking about this update for 3 days
//
// Structure files the user never edited are replaced. Edited files are kept, and the new
// version is saved beside them as <file>.engram-new. Knowledge (wiki/, artifact/) is never touched.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const UPSTREAM = "ClaudiusMa/engram";
const STATE_FILE = path.join(".engram", "installed.json");
const CHECK_EVERY_MS = 20 * 60 * 60 * 1000;
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const APP_SOURCE = "schema/apps/Engram Graph.app";
const APP_TARGET = "Engram Graph.app";

// Every structure file the package ships, keyed by where it lives in a workspace.
export function structureFiles(packageRoot) {
  const files = new Map();
  for (const name of ["AGENTS.md", "README.md", "LICENSE", "package.json"]) {
    if (fs.existsSync(path.join(packageRoot, name))) files.set(name, path.join(packageRoot, name));
  }
  for (const dir of ["bin", "schema"]) {
    for (const rel of walk(packageRoot, dir)) {
      if (rel === "schema/CHANGELOG.md" || rel.endsWith(".engram-new")) continue;
      files.set(rel, path.join(packageRoot, rel));
    }
  }
  if (process.platform === "darwin") {
    for (const rel of walk(packageRoot, APP_SOURCE)) files.set(APP_TARGET + rel.slice(APP_SOURCE.length), path.join(packageRoot, rel));
  }
  return files;
}

function walk(base, rel) {
  const full = path.join(base, rel);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(base, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

const hashFile = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), "utf8"));
  } catch {
    return {};
  }
}

function writeState(root, state) {
  fs.mkdirSync(path.join(root, ".engram"), { recursive: true });
  fs.writeFileSync(path.join(root, STATE_FILE), JSON.stringify(state, null, 2) + "\n");
}

// The workspace that publishes Engram is where updates come from; it never updates itself.
export function isUpstreamSource(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ".engram", "private.json"), "utf8")).publicRepo === UPSTREAM;
  } catch {
    return false;
  }
}

export async function latestCommit() {
  if (process.env.ENGRAM_NO_NETWORK) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${UPSTREAM}/commits/main`, {
      headers: { accept: "application/vnd.github.sha", "user-agent": "engram-update" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const sha = (await response.text()).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

// Records what was installed so later updates can tell user edits from untouched files.
// A workspace counts as current only when every shipped file matched; otherwise the next check offers an update.
export function recordInstall(packageRoot, root, commit) {
  if (readState(root).files) return;
  const files = {};
  let complete = true;
  for (const [rel, source] of structureFiles(packageRoot)) {
    const target = path.join(root, rel);
    if (fs.existsSync(target) && hashFile(target) === hashFile(source)) files[rel] = hashFile(source);
    else complete = false;
  }
  writeState(root, { ...readState(root), commit: complete ? commit ?? null : null, files });
}

// Brings the workspace's structure files up to the version in packageRoot.
export function applyUpdate(packageRoot, root, commit) {
  const state = readState(root);
  const installed = state.files ?? null;
  const next = {};
  const report = { updated: [], added: [], kept: [], removed: [] };
  const shipped = structureFiles(packageRoot);

  for (const [rel, source] of shipped) {
    const target = path.join(root, rel);
    const wanted = hashFile(source);
    const current = fs.existsSync(target) ? hashFile(target) : null;
    const before = installed?.[rel];
    if (current === wanted) {
      next[rel] = wanted;
      continue;
    }
    if (current === null) {
      if (before) continue; // the user deleted it on purpose
      copy(source, target);
      report.added.push(rel);
      next[rel] = wanted;
      continue;
    }
    // Without an install record, only program files are known to be safe to replace.
    const untouched = before ? current === before : rel.startsWith("bin/") || rel.startsWith(`${APP_TARGET}/`);
    if (untouched || rel.startsWith(`${APP_TARGET}/`)) {
      copy(source, target);
      report.updated.push(rel);
    } else {
      copy(source, `${target}.engram-new`);
      report.kept.push(rel);
    }
    next[rel] = wanted;
  }

  for (const [rel, hash] of Object.entries(installed ?? {})) {
    if (shipped.has(rel)) continue;
    const target = path.join(root, rel);
    if (fs.existsSync(target) && hashFile(target) === hash) {
      fs.rmSync(target);
      report.removed.push(rel);
    }
  }

  writeState(root, { ...state, commit: commit ?? state.commit ?? null, files: next, snoozed: undefined });
  return report;
}

// Write beside the target, then rename, so a running Engram Graph app is never overwritten mid-read.
function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.engram-tmp`;
  fs.copyFileSync(source, temp);
  fs.chmodSync(temp, fs.statSync(source).mode);
  fs.renameSync(temp, target);
}

export function describeReport(report) {
  const lines = [];
  const changed = report.updated.length + report.added.length + report.removed.length;
  lines.push(changed || report.kept.length ? "Engram is updated." : "Engram was already up to date.");
  if (report.kept.length) {
    lines.push("");
    lines.push("You had changed these files, so they were kept as they are:");
    for (const rel of report.kept) lines.push(`  ${rel}  (new version saved as ${rel}.engram-new)`);
    lines.push("Ask your AI agent to merge each .engram-new file into your version, then delete it.");
  }
  return lines.join("\n");
}

export async function checkForUpdate(root, { force = false } = {}) {
  if (isUpstreamSource(root)) return { available: false, reason: "source" };
  const state = readState(root);
  const now = Date.now();
  let latest = state.latest;
  if (force || !state.lastCheck || now - state.lastCheck > CHECK_EVERY_MS || !latest) {
    const fetched = await latestCommit();
    if (!fetched) return { available: false, reason: "offline" };
    latest = fetched;
    writeState(root, { ...state, latest, lastCheck: now });
  }
  const available = latest !== state.commit;
  const snoozed = available && state.snoozed?.commit === latest && now < state.snoozed.until;
  return { available: available && !snoozed, latest, installed: state.commit ?? null };
}

async function main() {
  const [command = "check", ...rest] = process.argv.slice(2);
  const root = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");

  if (command === "check") {
    const result = await checkForUpdate(root, { force: rest.includes("--force") });
    if (rest.includes("--json")) console.log(JSON.stringify(result));
    else if (result.available) {
      console.log("An Engram update is available.");
      console.log("Tell the user in plain words and ask whether to install it. Only after they agree, run:");
      console.log("  node bin/engram-update.mjs apply");
      console.log("If they say not now, run: node bin/engram-update.mjs later");
    }
    return;
  }

  if (command === "later") {
    const state = readState(root);
    if (state.latest) writeState(root, { ...state, snoozed: { commit: state.latest, until: Date.now() + SNOOZE_MS } });
    return;
  }

  if (command === "apply") {
    if (isUpstreamSource(root)) {
      console.log("This workspace publishes Engram, so it is not updated from GitHub.");
      return;
    }
    const commit = (await latestCommit()) ?? readState(root).latest;
    const npx = path.join(path.dirname(process.execPath), process.platform === "win32" ? "npx.cmd" : "npx");
    const ref = process.env.ENGRAM_UPDATE_REF ?? commit;
    const spec = `github:${UPSTREAM}${ref ? `#${ref}` : ""}`;
    const args = ["--yes", spec, "update", root, ...(commit ? ["--commit", commit] : [])];
    const result = spawnSync(fs.existsSync(npx) ? npx : "npx", args, { stdio: "inherit", env: process.env });
    process.exitCode = result.status ?? 1;
    return;
  }

  console.error("usage: engram-update.mjs check|apply|later [workspace]");
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
