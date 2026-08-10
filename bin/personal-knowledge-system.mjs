#!/usr/bin/env node

// Personal Knowledge System — CLI initializer
// Usage: npx github:ClaudiusMa/Personal-Knowledge-System init
//
// Scaffolds the wiki directory structure, seeds index.md and log.md from
// templates, copies CLAUDE.md, schema/, and .gitignore into the current
// working directory. Safe to re-run — never overwrites existing files.

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PKG_ROOT   = resolve(__dirname, '..');   // repo root (where package.json lives)
const TARGET     = process.cwd();              // user's working directory

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a directory (and parents) if it doesn't exist. Returns true if created. */
function ensureDir(dir) {
  if (existsSync(dir)) return false;
  mkdirSync(dir, { recursive: true });
  return true;
}

/** Copy a single file if it doesn't already exist at the destination. Returns true if copied. */
function seedFile(src, dest) {
  if (existsSync(dest)) return false;
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  return true;
}

/** Recursively copy a directory tree — only seeds files that don't already exist. */
function seedDir(srcDir, destDir) {
  const created = [];
  if (!existsSync(srcDir)) return created;

  for (const entry of readdirSync(srcDir)) {
    // Skip .DS_Store and other dotfiles
    if (entry.startsWith('.')) continue;

    const srcPath  = join(srcDir, entry);
    const destPath = join(destDir, entry);

    if (statSync(srcPath).isDirectory()) {
      created.push(...seedDir(srcPath, destPath));
    } else {
      if (seedFile(srcPath, destPath)) {
        created.push(destPath);
      }
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Init command
// ---------------------------------------------------------------------------

function init() {
  console.log('\n  Personal Knowledge System — init\n');

  // Guard: don't init inside the repo itself
  if (resolve(TARGET) === resolve(PKG_ROOT)) {
    console.log('  ⚠  You are inside the PKS repo itself.');
    console.log('     cd into (or create) the folder you want as your knowledge system,');
    console.log('     then re-run this command.\n');
    process.exit(1);
  }

  const actions = [];

  // 1. Wiki directory structure
  const wikiDirs = [
    'wiki/main/raw',
    'wiki/main/sources',
    'wiki/main/entities',
    'wiki/main/concepts',
    'wiki/main/positions',
    'wiki/main/questions',
    'wiki/main/notes',
    'wiki/main/projects',
  ];

  for (const dir of wikiDirs) {
    const full = join(TARGET, dir);
    if (ensureDir(full)) {
      actions.push(`  ✓ Created ${dir}/`);
    }
  }

  // 2. Seed wiki/main/index.md from template
  const indexSrc  = join(PKG_ROOT, 'schema', 'templates', 'index.template.md');
  const indexDest = join(TARGET, 'wiki', 'main', 'index.md');
  if (seedFile(indexSrc, indexDest)) {
    actions.push('  ✓ Seeded wiki/main/index.md');
  }

  // 3. Seed wiki/main/log.md — header only (template contains an example entry)
  const logDest = join(TARGET, 'wiki', 'main', 'log.md');
  if (!existsSync(logDest)) {
    writeFileSync(logDest, '# Log\n\nAppend-only chronological record.\n');
    actions.push('  ✓ Seeded wiki/main/log.md');
  }

  // 4. Copy CLAUDE.md
  const claudeSrc  = join(PKG_ROOT, 'CLAUDE.md');
  const claudeDest = join(TARGET, 'CLAUDE.md');
  if (seedFile(claudeSrc, claudeDest)) {
    actions.push('  ✓ Copied CLAUDE.md');
  }

  // 5. Copy schema/ (templates, workflows)
  const schemaSrc  = join(PKG_ROOT, 'schema');
  const schemaDest = join(TARGET, 'schema');
  const schemaFiles = seedDir(schemaSrc, schemaDest);
  if (schemaFiles.length > 0) {
    actions.push(`  ✓ Copied schema/ (${schemaFiles.length} file${schemaFiles.length === 1 ? '' : 's'})`);
  }

  // 6. Seed .gitignore
  let giSrc  = join(PKG_ROOT, '.gitignore');
  if (!existsSync(giSrc)) {
    giSrc = join(PKG_ROOT, '.npmignore');
  }
  const giDest = join(TARGET, '.gitignore');
  if (seedFile(giSrc, giDest)) {
    actions.push('  ✓ Seeded .gitignore');
  }

  // Summary
  if (actions.length === 0) {
    console.log('  Everything is already set up. Nothing to do.\n');
  } else {
    for (const a of actions) console.log(a);
    console.log(`\n  Done — ${actions.length} action${actions.length === 1 ? '' : 's'}.`);
    console.log('  Point your LLM agent at this directory and tell it to follow CLAUDE.md.\n');
  }
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

const command = process.argv[2];

if (command === 'init') {
  init();
} else {
  console.log('\n  Personal Knowledge System\n');
  console.log('  Usage:');
  console.log('    npx github:ClaudiusMa/Personal-Knowledge-System init\n');
  console.log('  Commands:');
  console.log('    init    Scaffold wiki structure and seed templates\n');
  if (command) {
    console.log(`  Unknown command: "${command}"\n`);
    process.exit(1);
  }
}
