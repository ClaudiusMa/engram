#!/usr/bin/env node
// Opt-in local indexing of native Codex evidence; never modifies transcripts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const DAY = 86400000;
const REL = '.local/session-learning';
const fail = message => { throw new Error(message); };
const exists = p => { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const base = root => path.join(root, REL);
const iso = (value, name) => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${name} must be an ISO timestamp`);
  return new Date(value).toISOString();
};

function realDirectory(p) {
  const st = fs.lstatSync(p);
  if (!st.isDirectory() || st.isSymbolicLink()) fail(`expected a real directory: ${p}`);
  return fs.realpathSync(p);
}
function within(root, candidate) {
  const relative = path.relative(root, path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
// Check every runtime component, including dangling symlinks, before reading/writing.
function runtimePath(root, relative = '', createParents = false) {
  const target = path.resolve(base(root), relative);
  if (!within(base(root), target)) fail('runtime path escapes its private directory');
  const parts = path.relative(root, target).split(path.sep);
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (exists(current)) {
      const st = fs.lstatSync(current);
      if (st.isSymbolicLink()) fail(`runtime symlink refused: ${current}`);
      if (i < parts.length - 1 && !st.isDirectory()) fail(`runtime parent is not a directory: ${current}`);
    } else if (createParents && i < parts.length - 1) {
      fs.mkdirSync(current, { mode: 0o700 });
    }
  }
  return target;
}
function ensureRuntime(root) {
  for (const name of ['sessions', 'reports', 'candidates']) {
    const p = runtimePath(root, name, true);
    if (!exists(p)) fs.mkdirSync(p, { mode: 0o700 });
    if (!fs.lstatSync(p).isDirectory()) fail(`runtime directory required: ${p}`);
    fs.chmodSync(p, 0o700);
  }
  fs.chmodSync(base(root), 0o700);
}
function readJson(p) {
  const st = fs.lstatSync(p);
  if (!st.isFile() || st.isSymbolicLink()) fail(`regular JSON file required: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function optionalJson(root, name, fallback) {
  const p = runtimePath(root, name);
  return exists(p) ? readJson(p) : fallback;
}
function writeJson(root, name, value) {
  const p = runtimePath(root, name, true);
  const data = JSON.stringify(value, null, 2) + '\n';
  if (exists(p)) {
    if (!fs.lstatSync(p).isFile()) fail(`regular output file required: ${p}`);
    fs.chmodSync(p, 0o600);
    if (fs.readFileSync(p, 'utf8') === data) return;
  }
  const temp = `${p}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, data, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, p);
  } finally {
    if (exists(temp)) fs.unlinkSync(temp);
  }
}
async function withLock(root, work) {
  const lock = runtimePath(root, 'collector.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') fail('collector lock exists; verify its owner stopped before removing a stale lock'); throw e; }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
  try { return await work(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
function validateConfig(root, c) {
  if (c.version !== 1 || c.root !== root || typeof c.enabled !== 'boolean') fail('invalid pilot configuration');
  c.start = iso(c.start, 'pilot start');
  c.end = iso(c.end, 'pilot end');
  if (c.end <= c.start) fail('pilot end must follow start');
  if (!Array.isArray(c.excluded_session_ids) || c.excluded_session_ids.some(x => typeof x !== 'string')) fail('invalid session exclusions');
  if (typeof c.codex_home !== 'string') fail('invalid Codex home');
  return c;
}
function loadConfig(root) {
  const c = optionalJson(root, 'config.json', null);
  if (!c) fail('session learning is not initialized');
  return validateConfig(root, c);
}
function initialize(root, a) {
  if (exists(runtimePath(root, 'config.json'))) fail('pilot already initialized; preserve existing state');
  const c = validateConfig(root, {
    version: 1, enabled: true, root,
    codex_home: realDirectory(path.resolve(a['codex-home'] || fail('--codex-home required'))),
    start: a.start, end: a.end, excluded_session_ids: a['exclude-session'] || [],
    created_at: new Date().toISOString(),
  });
  ensureRuntime(root);
  writeJson(root, 'config.json', c);
  return { ok: true, enabled: true, pilot_start: c.start, pilot_end: c.end };
}
function *walk(dir, extension) {
  if (!exists(dir)) return;
  const st = fs.lstatSync(dir);
  if (st.isSymbolicLink()) fail(`input symlink refused: ${dir}`);
  if (!st.isDirectory()) fail(`input directory required: ${dir}`);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield *walk(p, extension);
    else if (entry.isFile() && entry.name.endsWith(extension)) yield p;
  }
}
async function firstRecord(file) {
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try { for await (const line of lines) return JSON.parse(line); }
  finally { lines.close(); stream.destroy(); }
  return null;
}
function messageText(item) {
  return (Array.isArray(item?.content) ? item.content : [])
    .filter(part => ['text', 'Text'].includes(part?.type) && typeof part.text === 'string')
    .map(part => part.text).join('\n');
}
function excludedPrompt(text) {
  const t = text.trimStart();
  return !t.trim() || t.startsWith('[engram-learning-maintenance]') || t.startsWith('# AGENTS.md instructions') || t.startsWith('<environment_context>');
}

async function extract(file, meta, c, through, warnings) {
  const sid = meta.id || meta.session_id;
  const events = new Map();
  const blockedTurns = new Set();
  let turn = null, lineNo = 0, sawWindow = false, supported = false;
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let pending = null;
  function consume(raw, number, finalLine = false) {
    let row;
    try { row = JSON.parse(raw); }
    catch {
      warnings.push({ session_id: sid, file, line: number, severity: finalLine ? 'retry' : 'error', warning: finalLine ? 'truncated final line; retry next collection' : 'malformed middle record' });
      return;
    }
    if (row.type !== 'event_msg') return;
    const p = row.payload || {};
    if (p.type === 'task_started') turn = p.turn_id || null;
    const timestamp = Date.parse(row.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < Date.parse(c.start) || timestamp > Date.parse(through)) return;
    sawWindow = true;
    const currentTurn = p.turn_id || turn;
    let kind, text, nativeId = null, sourceType;
    if (p.type === 'item_completed') {
      const item = p.item || {};
      if (['UserMessage', 'AgentMessage'].includes(item.type)) supported = true;
      if (item.type === 'UserMessage') kind = 'ask';
      else if (item.type === 'AgentMessage' && ['final', 'final_answer'].includes(item.phase)) kind = 'final';
      else return;
      text = messageText(item); nativeId = item.id || null; sourceType = 'native_item';
    } else if (p.type === 'user_message') {
      supported = true; kind = 'ask'; text = p.message; sourceType = 'legacy_event';
    } else if (p.type === 'agent_message') {
      supported = true;
      if (!['final', 'final_answer'].includes(p.phase)) return;
      kind = 'final'; text = p.message; sourceType = 'legacy_event';
    } else if (p.type === 'task_complete' && typeof p.last_agent_message === 'string') {
      supported = true; kind = 'final'; text = p.last_agent_message; sourceType = 'completion_fallback';
    } else return;
    if (typeof text !== 'string' || !text.trim()) return;
    if (kind === 'ask' && excludedPrompt(text)) {
      if (currentTurn) blockedTurns.add(currentTurn);
      return;
    }
    if (currentTurn && blockedTurns.has(currentTurn)) return;
    // Stable across mirrored event channels and retries; different turns remain distinct.
    const identity = currentTurn || nativeId || `line-${number}`;
    const id = `${sid}:${identity}:${kind}:${hash(text)}`;
    const evidence = { transcript: file, line: number, native_item_id: nativeId, source_type: sourceType };
    const event = { id, kind, text, timestamp: new Date(timestamp).toISOString(), turn_id: currentTurn, outcome: kind === 'final' ? 'agent_reported' : 'unknown', evidence };
    if (!events.has(id) || sourceType === 'native_item') events.set(id, event);
  }
  try {
    for await (const line of lines) {
      lineNo++;
      if (pending) consume(pending.text, pending.line);
      pending = { text: line, line: lineNo };
    }
    if (pending) consume(pending.text, pending.line, true);
  } finally { lines.close(); stream.destroy(); }
  if (sawWindow && !supported) warnings.push({ session_id: sid, file, severity: 'error', warning: 'no supported message schema in pilot window' });
  return [...events.values()].filter(e => !e.turn_id || !blockedTurns.has(e.turn_id));
}
function storedSessions(root) {
  const dir = runtimePath(root, 'sessions');
  return [...walk(dir, '.json')].map(file => {
    const d = readJson(file);
    if (d.version !== 1 || !Array.isArray(d.events)) fail(`invalid derived session: ${file}`);
    return { file, data: d };
  });
}
async function collect(root, c, now = new Date()) {
  validateConfig(root, c);
  if (!c.enabled) return { ok: true, skipped: true, reason: 'disabled' };
  ensureRuntime(root);
  return withLock(root, async () => {
    const through = new Date(Math.min(now.getTime(), Date.parse(c.end))).toISOString();
    const warnings = [];
    const stats = { files_scanned: 0, sessions_in_scope: 0, events_added: 0, skipped_subagents: 0, skipped_forks: 0 };
    const seenFiles = new Set();
    const home = realDirectory(c.codex_home);
    const sessionDirs = ['sessions', 'archived_sessions'].map(name => path.join(home, name));
    if (!sessionDirs.some(exists)) warnings.push({ severity: 'error', warning: 'no native transcript directories found' });
    for (const dir of sessionDirs) {
      for (const file of walk(dir, '.jsonl')) {
        if (seenFiles.has(file)) continue;
        seenFiles.add(file); stats.files_scanned++;
        // Pre-pilot threads can resume; mtime skips only files not written since the start.
        if (fs.statSync(file).mtimeMs < Date.parse(c.start)) continue;
        let row;
        try { row = await firstRecord(file); }
        catch { warnings.push({ file, severity: 'retry', warning: 'metadata unreadable; scope could not be determined' }); continue; }
        const meta = row?.payload;
        if (row?.type !== 'session_meta' || typeof meta?.cwd !== 'string') {
          warnings.push({ file, severity: 'error', warning: 'unsupported session metadata; scope could not be determined' }); continue;
        }
        // No conversation content is parsed before this scope check.
        if (!within(root, meta.cwd)) continue;
        // Resolve existing cwd aliases to prevent an in-root symlink admitting another project.
        if (exists(meta.cwd) && !within(root, fs.realpathSync(meta.cwd))) continue;
        const sid = meta.id || meta.session_id;
        if (typeof sid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sid)) {
          warnings.push({ file, severity: 'error', warning: 'unsafe or missing session ID' }); continue;
        }
        if (c.excluded_session_ids.includes(sid)) continue;
        if (typeof meta.source === 'object' && meta.source?.subagent) { stats.skipped_subagents++; continue; }
        if (meta.forked_from_id) { stats.skipped_forks++; continue; }
        stats.sessions_in_scope++;
        let incoming;
        try { incoming = await extract(file, meta, c, through, warnings); }
        catch (e) { warnings.push({ file, session_id: sid, severity: 'error', warning: `scoped transcript unreadable: ${e.message}` }); continue; }
        const name = `sessions/${sid}.json`;
        const old = optionalJson(root, name, { version: 1, events: [] });
        if (old.version !== 1 || !Array.isArray(old.events)) fail(`invalid derived session: ${sid}`);
        const merged = new Map(old.events.map(e => [e.id, e]));
        for (const event of incoming) {
          if (!merged.has(event.id)) stats.events_added++;
          merged.set(event.id, event);
        }
        if (!merged.size) continue;
        const events = [...merged.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.evidence.line - b.evidence.line);
        writeJson(root, name, { version: 1, session_id: sid, cwd: meta.cwd, source_file: file,
          first_observed_ask: events.find(e => e.kind === 'ask')?.text || null, events });
      }
    }
    const sessions = storedSessions(root);
    const ids = sessions.flatMap(s => s.data.events.map(e => e.id));
    const manifest = { version: 1, captured_at: now.toISOString(), capture_through: through, event_ids: [...new Set(ids)].sort(), warnings, ...stats };
    writeJson(root, 'manifest.json', manifest);
    return { ok: !warnings.some(w => w.severity === 'error'), ...stats, sessions: sessions.length,
      events_total: manifest.event_ids.length, capture_through: through, warnings };
  });
}
function status(root, c, now = new Date()) {
  validateConfig(root, c);
  const manifest = optionalJson(root, 'manifest.json', null);
  const checkpoints = optionalJson(root, 'reflections.json', { version: 1, reflections: [] });
  const last = checkpoints.reflections.at(-1) || null;
  const reviewed = new Set(checkpoints.reflections.flatMap(r => r.event_ids));
  const unreviewed = (manifest?.event_ids || []).filter(id => !reviewed.has(id));
  const pilotComplete = now.getTime() >= Date.parse(c.end);
  const finalComplete = !!last && last.through >= c.end && !unreviewed.length;
  const next = new Date(Math.min(Date.parse(last?.through || c.start) + 7 * DAY, Date.parse(c.end))).toISOString();
  const due = !!c.enabled && !!manifest && !finalComplete && (now.getTime() >= Date.parse(next) || pilotComplete);
  const sessions = storedSessions(root);
  return { ok: true, enabled: c.enabled, sessions: sessions.length, events: manifest?.event_ids.length || 0,
    unreviewed_events: unreviewed.length, reflection_due: due, next_reflection_at: next,
    pilot_complete: pilotComplete, final_reflection_complete: finalComplete,
    pilot_start: c.start, pilot_end: c.end, capture_through: manifest?.capture_through || null,
    last_reflected_through: last?.through || null, warnings: manifest?.warnings || [],
    session_files: sessions.map(s => s.file) };
}
async function markReflected(root, c, a) {
  if (!c.enabled) fail('pilot is disabled');
  if (!a.report || !a.through) fail('mark-reflected requires --report and --through');
  return withLock(root, async () => {
    const through = iso(a.through, '--through');
    const manifest = optionalJson(root, 'manifest.json', null);
    if (!manifest || through !== manifest.capture_through) fail('cutoff must match the latest completed collection; recollect and review before checkpointing');
    if (through < c.start || through > c.end) fail('cutoff is outside the pilot');
    const p = path.resolve(a.report);
    const reportRoot = runtimePath(root, 'reports');
    if (!within(reportRoot, p) || p === reportRoot) fail('report must be inside private reports directory');
    runtimePath(root, path.relative(base(root), p));
    const st = fs.lstatSync(p);
    if (!st.isFile() || st.size === 0) fail('report must be a nonempty regular file');
    const reportText = fs.readFileSync(p, 'utf8');
    if (!reportText.trim()) fail('report must contain substantive text');
    fs.chmodSync(p, 0o600);
    const d = optionalJson(root, 'reflections.json', { version: 1, reflections: [] });
    if (d.reflections.at(-1)?.through > through) fail('cannot move the reflection checkpoint backward');
    const checkpoint = { through, report: p, report_sha256: hash(reportText), recorded_at: new Date().toISOString(), event_ids: manifest.event_ids };
    const previous = d.reflections.at(-1);
    if (!previous || JSON.stringify(previous.event_ids) !== JSON.stringify(checkpoint.event_ids) || previous.through !== through) d.reflections.push(checkpoint);
    writeJson(root, 'reflections.json', d);
    return { ok: true, through, reviewed_events: checkpoint.event_ids.length };
  });
}
function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2), value = argv[i + 1];
    if (!argv[i]?.startsWith('--') || !value || value.startsWith('--')) fail('arguments require --name value pairs');
    if (!['root', 'codex-home', 'start', 'end', 'exclude-session', 'report', 'through'].includes(key)) fail(`unknown option: ${argv[i]}`);
    if (key === 'exclude-session') (result[key] ||= []).push(value);
    else if (result[key] !== undefined) fail(`duplicate option: ${argv[i]}`);
    else result[key] = value;
  }
  return result;
}
async function main() {
  try {
    const [command, ...rest] = process.argv.slice(2);
    const a = parseArgs(rest);
    if (!a.root) fail('--root is required');
    const root = realDirectory(path.resolve(a.root));
    let result;
    if (command === 'init') result = initialize(root, a);
    else {
      const c = loadConfig(root);
      if (command === 'collect') result = await collect(root, c);
      else if (command === 'status') result = status(root, c);
      else if (command === 'mark-reflected') result = await markReflected(root, c, a);
      else fail('expected init, collect, status, or mark-reflected');
    }
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.ok === false) process.exitCode = 2;
  } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
export { collect, status, extract, within, initialize, markReflected };
