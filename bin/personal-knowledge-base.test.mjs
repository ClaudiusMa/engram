import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const initializer = path.join(repoRoot, "bin", "personal-knowledge-base.mjs");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

test("initializer creates the complete private knowledge-system skeleton without overwriting files", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "personal-knowledge-base-init-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const target = path.join(tempRoot, "vault");

  const firstRun = run(process.execPath, [initializer, "init", target], repoRoot);
  assert.equal(firstRun.status, 0, failureMessage(firstRun));

  const requiredPaths = [
    "AGENTS.md",
    "README.md",
    "LICENSE",
    "package.json",
    "artifact/workshop",
    "wiki/main/index.md",
    "wiki/main/log.md",
    "wiki/main/raw",
    "wiki/main/sources",
    "wiki/main/notes",
    "wiki/main/entities",
    "wiki/main/concepts",
    "wiki/main/positions",
    "wiki/main/questions",
    "wiki/main/projects",
    ".obsidian/app.json",
    ".obsidian/graph.json",
    ".obsidian/types.json",
    "schema/templates/source.template.md",
    "schema/templates/note.template.md",
    "schema/templates/project.template.md",
    "schema/skills/turn-doc-into-artifact/SKILL.md",
    "schema/skills/turn-doc-into-artifact/references/artifact-contract.md",
    "schema/skills/turn-doc-into-artifact/scripts/validate-artifact.mjs",
    "schema/workflows/archive/artifact-humanize-v1.js",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(await exists(path.join(target, relativePath)), true, `missing ${relativePath}`);
  }
  assert.equal(await exists(path.join(target, "CLAUDE.md")), false, "legacy CLAUDE.md should not be created");
  assert.deepEqual(await findNamed(target, ".DS_Store"), [], "initializer should not copy Finder metadata");

  const agentsPath = path.join(target, "AGENTS.md");
  assert.match(
    await fs.readFile(agentsPath, "utf8"),
    /schema\/skills\/turn-doc-into-artifact\/SKILL\.md/,
    "PKS router must point artifact requests to the portable skill",
  );
  assert.equal(
    await exists(path.join(target, "schema/skills/turn-doc-into-artifact/agents/openai.yaml")),
    false,
    "portable skill must not ship product-specific metadata",
  );
  const sentinel = "\n<!-- initializer-preserves-existing-files -->\n";
  await fs.appendFile(agentsPath, sentinel);

  const secondRun = run(process.execPath, [initializer, "init", target], repoRoot);
  assert.equal(secondRun.status, 0, failureMessage(secondRun));
  assert.match(await fs.readFile(agentsPath, "utf8"), /initializer-preserves-existing-files/);

  const legacyTarget = path.join(tempRoot, "legacy-vault");
  await fs.mkdir(legacyTarget);
  await fs.writeFile(path.join(legacyTarget, "CLAUDE.md"), "legacy instructions\n");
  const legacyRun = run(process.execPath, [initializer, "init", legacyTarget], repoRoot);
  assert.equal(legacyRun.status, 0, failureMessage(legacyRun));
  assert.equal(await exists(path.join(legacyTarget, "AGENTS.md")), false, "initializer must not create competing instructions");
  assert.equal(await fs.readFile(path.join(legacyTarget, "CLAUDE.md"), "utf8"), "legacy instructions\n");
  assert.match(legacyRun.stdout, /merge it manually/);
});

test("privacy boundary and package contents expose structure only", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "personal-knowledge-base-privacy-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const target = path.join(tempRoot, "vault");

  const init = run(process.execPath, [initializer, "init", target], repoRoot);
  assert.equal(init.status, 0, failureMessage(init));

  const privateProbes = [
    "wiki/main/raw/private.md",
    ".obsidian/private.json",
    "artifact/workshop/example/private.md",
    "private.md",
    "schema/.DS_Store",
  ];
  for (const relativePath of privateProbes) {
    const absolutePath = path.join(target, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "private probe\n");
    const ignored = run("git", ["check-ignore", "-q", "--", relativePath], target);
    assert.equal(ignored.status, 0, `${relativePath} should be ignored`);
  }

  for (const relativePath of ["AGENTS.md", "README.md", "package.json", "bin/personal-knowledge-base.mjs"] ) {
    const ignored = run("git", ["check-ignore", "-q", "--", relativePath], target);
    assert.equal(ignored.status, 1, `${relativePath} should remain trackable`);
  }

  const pack = run(
    npmCommand,
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    repoRoot,
    { npm_config_cache: path.join(tempRoot, "npm-cache") },
  );
  assert.equal(pack.status, 0, failureMessage(pack));
  const packedFiles = JSON.parse(pack.stdout)[0].files.map(({ path: filePath }) => filePath.replaceAll("\\", "/"));
  assert.equal(packedFiles.includes("AGENTS.md"), true, "package should include AGENTS.md");
  assert.equal(packedFiles.includes("CLAUDE.md"), false, "package should exclude CLAUDE.md");
  assert.equal(packedFiles.includes("schema/obsidian/types.json"), true, "package should include property types");
  assert.equal(packedFiles.includes("schema/templates/project.template.md"), true, "package should include project template");
  assert.equal(packedFiles.includes("schema/skills/turn-doc-into-artifact/SKILL.md"), true, "package should include artifact skill");
  assert.equal(packedFiles.includes("schema/skills/turn-doc-into-artifact/agents/openai.yaml"), false, "artifact skill must stay vendor-neutral");
  assert.equal(packedFiles.includes("schema/workflows/artifact-humanize.js"), false, "package should not expose the retired Humanizer as active");
  assert.equal(packedFiles.some((filePath) => filePath.startsWith("wiki/")), false, "package must exclude wiki content");
  assert.equal(packedFiles.some((filePath) => filePath.startsWith(".obsidian/")), false, "package must exclude live settings");
  const allowedPackageRoots = new Set(["AGENTS.md", "README.md", "LICENSE", "package.json", "bin", "schema"]);
  for (const filePath of packedFiles) {
    const packageRoot = filePath.includes("/") ? filePath.slice(0, filePath.indexOf("/")) : filePath;
    assert.equal(allowedPackageRoots.has(packageRoot), true, `unexpected packaged path: ${filePath}`);
  }

  const staleReferenceFiles = [
    "README.md",
    ".gitignore",
    "artifact/README.md",
    "package.json",
    "schema/gitignore.template",
    "schema/obsidian/app.json",
  ];
  for (const relativePath of staleReferenceFiles) {
    const contents = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(contents, /CLAUDE\.md/, `${relativePath} still references CLAUDE.md`);
  }

  const initializerContents = await fs.readFile(initializer, "utf8");
  assert.doesNotMatch(initializerContents, /copyFileIfMissing\("CLAUDE\.md"/, "initializer must not copy CLAUDE.md");
  assert.doesNotMatch(initializerContents, /follow CLAUDE\.md/, "initializer must not recommend CLAUDE.md");
});

test("artifact validator accepts the portable two-view contract and rejects an Agent-default page", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pks-artifact-validator-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const artifactDir = path.join(tempRoot, "Example Artifact");
  const sourcePath = path.join(tempRoot, "Research.md");
  const validator = path.join(repoRoot, "schema", "skills", "turn-doc-into-artifact", "scripts", "validate-artifact.mjs");

  await fs.mkdir(path.join(artifactDir, "branding"), { recursive: true });
  await fs.writeFile(sourcePath, "# Research\n\n## Purpose\n\nA complete source.\n\n## Step 1 — Orient\n\nA confirmed step.\n");
  await fs.writeFile(path.join(artifactDir, "AGENTS.md"), `Source: ${sourcePath}\nPreserve Human and Agent views.\n`);
  await fs.writeFile(path.join(artifactDir, "branding", "logo.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
  const html = `<!doctype html>
<html lang="en"><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="artifact-source" content="${sourcePath}">
<meta name="artifact-color-meaning" content="blue=links, focus, and selected controls">
<style>@media (prefers-color-scheme: dark) { body { background: #000; } } :root { --blue-700: #06f; }</style>
</head><body data-view="human">
<nav id="view-switch"><button data-set-view="human" aria-pressed="true">Human</button><button data-set-view="agent" aria-pressed="false">Agent</button></nav>
<section id="human-view"><h1>Research</h1></section><main id="agent-view"><h2>Purpose</h2><h2>Step 1 — Orient</h2></main>
<script>document.querySelectorAll('[data-set-view]').forEach((button) => button.addEventListener('click', () => { document.body.dataset.view = button.dataset.setView; }));</script>
<script type="application/json" id="artifact-source-manifest">{"source":"${sourcePath}","sourceSections":["Purpose","Step 1 — Orient"],"agentSectionsRendered":["Purpose","Step 1 — Orient"],"humanSections":["Orient"],"unresolvedItems":[]}</script>
</body></html>`;
  const indexPath = path.join(artifactDir, "index.html");
  await fs.writeFile(indexPath, html);

  const valid = run(process.execPath, [validator, "--artifact", artifactDir, "--source", sourcePath], repoRoot);
  assert.equal(valid.status, 0, failureMessage(valid));
  assert.match(valid.stdout, /Artifact validation passed/);

  await fs.writeFile(indexPath, html.replace('data-view="human"', 'data-view="agent"'));
  const invalid = run(process.execPath, [validator, "--artifact", artifactDir, "--source", sourcePath], repoRoot);
  assert.equal(invalid.status, 1, "validator should reject an Agent-default artifact");
  assert.match(invalid.stderr, /body must default to data-view="human"/);
});

function run(command, args, cwd, env = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function failureMessage(result) {
  return [result.stderr, result.stdout].filter(Boolean).join("\n");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findNamed(root, name) {
  const matches = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.name === name) {
      matches.push(entryPath);
    }
    if (entry.isDirectory() && entry.name !== ".git") {
      matches.push(...(await findNamed(entryPath, name)));
    }
  }
  return matches;
}
