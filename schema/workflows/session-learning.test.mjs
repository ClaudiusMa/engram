import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initialize, collect, status, markReflected } from './session-learning.mjs';

const script = fileURLToPath(new URL('./session-learning.mjs', import.meta.url));
const start = '2026-09-01T00:00:00Z';
const end = '2026-09-15T00:00:00Z';
const at = value => new Date(value);
function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'engram-learning-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'repo'), home = path.join(temp, 'codex');
  fs.mkdirSync(root); fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(home, 'archived_sessions'));
  return { temp, root, home, runtime: path.join(root, '.local/session-learning') };
}
function setup(f, exclusions = []) {
  initialize(f.root, { 'codex-home': f.home, start, end, 'exclude-session': exclusions });
  return JSON.parse(fs.readFileSync(path.join(f.runtime, 'config.json'), 'utf8'));
}
function transcript(f, id, cwd, records, meta = {}, archived = false) {
  const dir = path.join(f.home, archived ? 'archived_sessions' : 'sessions', '2026', '09');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, [{ type: 'session_meta', payload: { id, cwd, ...meta } }, ...records].map(JSON.stringify).join('\n') + '\n');
  return file;
}
const event = (timestamp, payload) => ({ type: 'event_msg', timestamp, payload });
const item = (timestamp, turn, id, type, text, phase) => event(timestamp, {
  type: 'item_completed', turn_id: turn,
  item: { id, type, phase, content: [{ type: 'Text', text }] },
});
const events = (f, id) => JSON.parse(fs.readFileSync(path.join(f.runtime, 'sessions', `${id}.json`), 'utf8')).events;
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('indexes only eligible root and descendant turns, including archived sessions', async t => {
  const f = fixture(t), nested = path.join(f.root, 'nested'); fs.mkdirSync(nested);
  transcript(f, 'root', f.root, [item('2026-09-02T00:00:00Z', 'r', 'a', 'UserMessage', 'Root ask')]);
  transcript(f, 'child', nested, [item('2026-09-02T00:00:00Z', 'c', 'a', 'UserMessage', 'Child ask')], {}, true);
  transcript(f, 'sibling', `${f.root}-other`, [item('2026-09-02T00:00:00Z', 's', 'a', 'UserMessage', 'Sibling secret')]);
  transcript(f, 'sub', f.root, [item('2026-09-02T00:00:00Z', 's', 'a', 'UserMessage', 'Worker')], { source: { subagent: { role: 'worker' } } });
  transcript(f, 'fork', f.root, [item('2026-09-02T00:00:00Z', 's', 'a', 'UserMessage', 'Fork')], { forked_from_id: 'root' });
  transcript(f, 'excluded', f.root, [item('2026-09-02T00:00:00Z', 's', 'a', 'UserMessage', 'Maintenance')]);
  transcript(f, 'prompt', f.root, [item('2026-09-02T00:00:00Z', 's', 'a', 'UserMessage', '[engram-learning-maintenance] run collector'), item('2026-09-02T00:01:00Z', 's', 'b', 'AgentMessage', 'Finished maintenance', 'final')]);
  const c = setup(f, ['excluded']); const result = await collect(f.root, c, at('2026-09-03T00:00:00Z'));
  assert.equal(result.events_total, 2); assert.equal(result.skipped_subagents, 1); assert.equal(result.skipped_forks, 1);
  assert.deepEqual([events(f, 'root')[0].text, events(f, 'child')[0].text], ['Root ask', 'Child ask']);
  assert.deepEqual(fs.readdirSync(path.join(f.runtime, 'sessions')).sort(), ['child.json', 'root.json']);
});

test('deduplicates native and legacy mirrors, completion fallback, and retries while preserving distinct turns', async t => {
  const f = fixture(t), time = '2026-09-03T02:00:00Z';
  transcript(f, 'messages', f.root, [
    event(time, { type: 'task_started', turn_id: 'one' }),
    item(time, 'one', 'u1', 'UserMessage', 'Same ask'),
    event(time, { type: 'user_message', message: 'Same ask' }),
    { type: 'response_item', timestamp: time, payload: { type: 'message', role: 'user', content: 'Mirror only' } },
    item(time, 'one', 'a1', 'AgentMessage', 'Done', 'final'),
    event(time, { type: 'task_complete', last_agent_message: 'Done' }),
    event('2026-09-04T02:00:00Z', { type: 'task_started', turn_id: 'two' }),
    event('2026-09-04T02:00:00Z', { type: 'user_message', message: 'Same ask' }),
    event('2026-09-04T02:01:00Z', { type: 'agent_message', phase: 'final', message: 'Done again' }),
  ]);
  const c = setup(f); const first = await collect(f.root, c, at('2026-09-05T00:00:00Z'));
  assert.equal(first.events_added, 4);
  const saved = events(f, 'messages');
  assert.deepEqual(saved.map(e => [e.kind, e.turn_id, e.text]), [
    ['ask', 'one', 'Same ask'], ['final', 'one', 'Done'], ['ask', 'two', 'Same ask'], ['final', 'two', 'Done again'],
  ]);
  assert.equal(saved[0].outcome, 'unknown'); assert.equal(saved[1].outcome, 'agent_reported');
  assert.equal(saved[0].evidence.source_type, 'native_item');
  assert.equal((await collect(f.root, c, at('2026-09-05T00:00:00Z'))).events_added, 0);
});

test('recovers an appended partial final line and includes a pre-pilot chat resumed during the pilot without altering it', async t => {
  const f = fixture(t);
  const file = transcript(f, 'resumed', f.root, [
    item('2026-08-31T23:59:00Z', 'old', 'a', 'UserMessage', 'Old ask'),
    item('2026-09-05T00:00:00Z', 'new', 'b', 'UserMessage', 'New ask'),
  ]);
  fs.appendFileSync(file, '{"type":"event_msg","timestamp":"2026-09-05T01:00:00Z","payload":{"type":"user_message","turn_id":"later","message":"Later ask"');
  const original = fs.readFileSync(file, 'utf8'), c = setup(f);
  const first = await collect(f.root, c, at('2026-09-06T00:00:00Z'));
  assert.deepEqual(events(f, 'resumed').map(e => e.text), ['New ask']);
  assert.ok(first.warnings.some(w => w.severity === 'retry' && w.warning.includes('truncated')));
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  fs.appendFileSync(file, '}}\n');
  const second = await collect(f.root, c, at('2026-09-06T00:00:00Z'));
  assert.equal(second.events_added, 1);
  assert.deepEqual(events(f, 'resumed').map(e => e.text), ['New ask', 'Later ask']);
  assert.equal(fs.readFileSync(file, 'utf8'), original + '}}\n');
});

test('weekly cutoff, late evidence, final review, and disabled mode', async t => {
  const f = fixture(t), c = setup(f);
  transcript(f, 'early', f.root, [item('2026-09-02T00:00:00Z', 'e', 'a', 'UserMessage', 'First')]);
  await collect(f.root, c, at('2026-09-07T00:00:00Z'));
  assert.equal(status(f.root, c, at('2026-09-07T00:00:00Z')).reflection_due, false);
  assert.equal(status(f.root, c, at('2026-09-08T00:00:00Z')).reflection_due, true);
  const report = path.join(f.runtime, 'reports', 'week.md');
  assert.equal((fs.statSync(f.runtime).mode & 0o777), 0o700);
  assert.equal((fs.statSync(path.join(f.runtime, 'config.json')).mode & 0o777), 0o600);
  await assert.rejects(markReflected(f.root, c, { report, through: '2026-09-07T00:00:00Z' }));
  fs.writeFileSync(report, ' \n\t ');
  await assert.rejects(markReflected(f.root, c, { report, through: '2026-09-07T00:00:00Z' }), /substantive text/);
  assert.equal(status(f.root, c, at('2026-09-08T00:00:00Z')).last_reflected_through, null);
  fs.writeFileSync(report, 'Reviewed first task');
  await assert.rejects(markReflected(f.root, c, { report, through: '2026-09-06T00:00:00Z' }), /cutoff/);
  await markReflected(f.root, c, { report, through: '2026-09-07T00:00:00Z' });
  assert.equal((fs.statSync(report).mode & 0o777), 0o600);
  assert.equal(status(f.root, c, at('2026-09-08T00:00:00Z')).reflection_due, false);
  transcript(f, 'late', f.root, [item('2026-09-03T00:00:00Z', 'l', 'a', 'UserMessage', 'Arrived late')]);
  await collect(f.root, c, at('2026-09-08T00:00:00Z'));
  assert.equal(status(f.root, c, at('2026-09-08T00:00:00Z')).unreviewed_events, 1);
  await collect(f.root, c, at(end));
  assert.equal(status(f.root, c, at(end)).reflection_due, true);
  fs.writeFileSync(report, 'Final review including late evidence');
  await markReflected(f.root, c, { report, through: end });
  assert.equal(status(f.root, c, at(end)).final_reflection_complete, true);
  c.enabled = false;
  assert.deepEqual(await collect(f.root, c, at(end)), { ok: true, skipped: true, reason: 'disabled' });
  assert.equal(status(f.root, c, at(end)).reflection_due, false);
});

test('final review becomes due even when no event was captured', async t => {
  const f = fixture(t), c = setup(f);
  await collect(f.root, c, at(end));
  assert.equal(status(f.root, c, at(end)).reflection_due, true);
  const report = path.join(f.runtime, 'reports', 'final.md'); fs.writeFileSync(report, 'No events; coverage reviewed.');
  await markReflected(f.root, c, { report, through: end });
  assert.equal(status(f.root, c, at(end)).final_reflection_complete, true);
});

test('CLI rejects overwrite, traversal and runtime symlinks, and lock collision preserves owner lock', async t => {
  const f = fixture(t); let r = cli('init', '--root', f.root, '--codex-home', f.home, '--start', start, '--end', end);
  assert.equal(r.status, 0, r.stderr); const config = fs.readFileSync(path.join(f.runtime, 'config.json'), 'utf8');
  r = cli('init', '--root', f.root, '--codex-home', f.home, '--start', start, '--end', end);
  assert.equal(r.status, 1); assert.equal(fs.readFileSync(path.join(f.runtime, 'config.json'), 'utf8'), config);
  const outside = path.join(f.temp, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.runtime, 'sessions', 'linked'));
  r = cli('collect', '--root', f.root); assert.equal(r.status, 0, r.stderr);
  fs.symlinkSync(outside, path.join(f.runtime, 'reports', 'linked'));
  r = cli('mark-reflected', '--root', f.root, '--report', path.join(f.runtime, 'reports', 'linked', 'report.md'), '--through', end);
  assert.equal(r.status, 1); assert.match(r.stderr, /runtime symlink refused/);
  transcript(f, 'unsafe', f.root, [item('2026-09-02T00:00:00Z', 'a', 'u', 'UserMessage', 'Unsafe')], { id: '../outside' });
  r = cli('collect', '--root', f.root); assert.equal(r.status, 2); assert.ok(r.stdout.includes('unsafe or missing session ID'));
  assert.ok(!fs.existsSync(path.join(f.runtime, 'outside.json')));
  const lock = path.join(f.runtime, 'collector.lock'); fs.writeFileSync(lock, 'owned');
  r = cli('collect', '--root', f.root); assert.equal(r.status, 1); assert.match(r.stderr, /collector lock exists/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'owned');
});

test('input symlinks are skipped without reading external transcript content', async t => {
  const f = fixture(t), c = setup(f), external = path.join(f.temp, 'external.jsonl');
  fs.writeFileSync(external, 'not valid json');
  fs.symlinkSync(external, path.join(f.home, 'sessions', 'external.jsonl'));
  const out = await collect(f.root, c, at('2026-09-03T00:00:00Z'));
  assert.equal(out.files_scanned, 0); assert.equal(out.events_total, 0); assert.deepEqual(out.warnings, []);
});

test('unsupported in-window transcript schema reports a coverage error', async t => {
  const f = fixture(t), c = setup(f);
  transcript(f, 'changed-schema', f.root, [event('2026-09-02T00:00:00Z', { type: 'future_message', text: 'Unknown format' })]);
  const out = await collect(f.root, c, at('2026-09-03T00:00:00Z'));
  assert.equal(out.ok, false);
  assert.equal(out.events_total, 0);
  assert.ok(out.warnings.some(w => w.severity === 'error' && /no supported message schema/.test(w.warning)));
  assert.equal(status(f.root, c, at('2026-09-03T00:00:00Z')).warnings.length, 1);
});

test('runtime directory symlink is refused before collection writes', async t => {
  const f = fixture(t), c = setup(f), original = path.join(f.runtime, 'sessions');
  fs.rmdirSync(original); fs.symlinkSync(f.temp, original);
  await assert.rejects(collect(f.root, c, at('2026-09-03T00:00:00Z')), /runtime symlink refused/);
  assert.ok(!fs.existsSync(path.join(f.temp, 'manifest.json')));
});
