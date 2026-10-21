#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let displayRoot = process.cwd();

const usage = `engram

Usage:
  engram init <target-dir>
  engram graph [workspace-dir] [--no-open]
  engram <target-dir>

Examples:
  npx github:ClaudiusMa/engram init ~/Engram
  npx github:ClaudiusMa/engram init .
  npm run graph
`;

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

if (args[0] === "graph") {
  const { openGraph } = await import("./engram-graph.mjs");
  const options = args.slice(1);
  const workspace = options.find((value) => !value.startsWith("--")) ?? ".";
  console.log(await openGraph(path.resolve(expandHome(workspace)), { open: !options.includes("--no-open") }));
} else {
  const targetArg = resolveTargetArg(args);
  const targetDir = path.resolve(expandHome(targetArg));

  await initializeVault(targetDir);
}

function resolveTargetArg(inputArgs) {
  if (inputArgs.length === 0) {
    return ".";
  }

  if (inputArgs[0] === "init") {
    return inputArgs[1] ?? ".";
  }

  return inputArgs[0];
}

function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

async function initializeVault(destination) {
  displayRoot = destination;

  const created = [];
  const skipped = [];

  await fs.mkdir(destination, { recursive: true });

  await copyFileIfMissing("README.md", path.join(destination, "README.md"), created, skipped);
  await copyCanonicalInstructions(destination, created, skipped);
  await copyFileIfMissing("LICENSE", path.join(destination, "LICENSE"), created, skipped);
  await copyFileIfMissing("package.json", path.join(destination, "package.json"), created, skipped);
  await copyTreeIfMissing(path.join(packageRoot, "bin"), path.join(destination, "bin"), created, skipped);
  await copyTreeIfMissing(path.join(packageRoot, "schema"), path.join(destination, "schema"), created, skipped);
  await copyFileIfMissing("schema/gitignore.template", path.join(destination, ".gitignore"), created, skipped);
  if (process.platform === "darwin") {
    await copyTreeIfMissing(
      path.join(packageRoot, "schema", "apps", "Engram Graph.app"),
      path.join(destination, "Engram Graph.app"),
      created,
      skipped,
    );
  }

  const wikiRoot = path.join(destination, "wiki", "main");
  for (const subdir of ["raw", "sources", "notes", "human-skills", "entities", "concepts", "positions", "questions", "projects"]) {
    await mkdirIfMissing(path.join(wikiRoot, subdir), created, skipped);
  }

  await mkdirIfMissing(path.join(destination, "artifact"), created, skipped);

  await copyFileIfMissing("schema/templates/index.template.md", path.join(wikiRoot, "index.md"), created, skipped);
  await copyFileIfMissing("schema/templates/log.template.md", path.join(wikiRoot, "log.md"), created, skipped);
  await copyFileIfMissing(
    "schema/templates/human-skills-index.template.md",
    path.join(wikiRoot, "human-skills", "index.md"),
    created,
    skipped,
  );

  await copyFileIfMissing("schema/obsidian/app.json", path.join(destination, ".obsidian", "app.json"), created, skipped);
  await copyFileIfMissing(
    "schema/obsidian/graph.json",
    path.join(destination, ".obsidian", "graph.json"),
    created,
    skipped,
  );
  await copyFileIfMissing(
    "schema/obsidian/types.json",
    path.join(destination, ".obsidian", "types.json"),
    created,
    skipped,
  );

  const gitDir = path.join(destination, ".git");
  if (!(await exists(gitDir))) {
    const result = spawnSync("git", ["init"], { cwd: destination, encoding: "utf8" });
    if (result.status === 0) {
      created.push(".git/");
    } else {
      skipped.push("git init failed; run it manually if you want version control");
    }
  } else {
    skipped.push(".git/");
  }

  console.log(`Initialized Engram at ${destination}`);
  printList("Created", created);
  printList("Skipped existing", skipped);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Open this folder as an Obsidian vault. On a Mac, double-click Engram Graph to see a map of it.");
  console.log("  2. Point your LLM agent at the vault and tell it to follow AGENTS.md.");
  console.log("  3. Run git status and confirm only public structure is trackable.");
}

async function copyFileIfMissing(sourceRelativePath, destinationPath, created, skipped) {
  if (await exists(destinationPath)) {
    skipped.push(relativeToCwd(destinationPath));
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(path.join(packageRoot, sourceRelativePath), destinationPath);
  created.push(relativeToCwd(destinationPath));
}

async function copyCanonicalInstructions(destination, created, skipped) {
  const canonicalPath = path.join(destination, "AGENTS.md");
  const legacyPath = path.join(destination, "CLAUDE.md");

  if (!(await exists(canonicalPath)) && (await exists(legacyPath))) {
    skipped.push("AGENTS.md (legacy CLAUDE.md found; merge it manually before rerunning init)");
    return;
  }

  await copyFileIfMissing("AGENTS.md", canonicalPath, created, skipped);
}

async function copyTreeIfMissing(sourceDir, destinationDir, created, skipped) {
  await fs.mkdir(destinationDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyTreeIfMissing(sourcePath, destinationPath, created, skipped);
      continue;
    }

    if (entry.isFile()) {
      if (await exists(destinationPath)) {
        skipped.push(relativeToCwd(destinationPath));
        continue;
      }

      await fs.copyFile(sourcePath, destinationPath);
      await fs.chmod(destinationPath, (await fs.stat(sourcePath)).mode);
      created.push(relativeToCwd(destinationPath));
    }
  }
}

async function mkdirIfMissing(directoryPath, created, skipped) {
  if (await exists(directoryPath)) {
    skipped.push(`${relativeToCwd(directoryPath)}/`);
    return;
  }

  await fs.mkdir(directoryPath, { recursive: true });
  created.push(`${relativeToCwd(directoryPath)}/`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function relativeToCwd(filePath) {
  return path.relative(displayRoot, filePath) || ".";
}

function printList(label, items) {
  if (items.length === 0) {
    return;
  }

  console.log("");
  console.log(`${label}:`);
  for (const item of items) {
    console.log(`  - ${item}`);
  }
}
