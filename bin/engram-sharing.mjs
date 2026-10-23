#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePackage, readPackage, ShareError, noSymlinks, MAX_BYTES } from './sharing/package.mjs';
import { createSharingServer } from './sharing/server.mjs';
import { importSelection } from './sharing/import.mjs';
import { createRelay } from './sharing/relay.mjs';
import { readPrivateJSON, removePrivateFile } from './sharing/storage.mjs';

export const usage = `Engram sharing (local, no email sent by default)

  node bin/engram-sharing.mjs prepare --manifest <reviewed.json> --root <originals-dir>
  node bin/engram-sharing.mjs serve [--prepared <package.json>] [--port 4318]
  node bin/engram-sharing.mjs import --url <share-url> --target <engram-dir> [--init]
  node bin/engram-sharing.mjs import --package <download.json> --target <engram-dir> [--init]
  node bin/engram-sharing.mjs serve --demo [--port 4318]
  node bin/engram-sharing.mjs serve --delivery relay --local-setup [--state <private-dir>]
  node bin/engram-sharing.mjs relay-next --state <private-dir> [--wait-ms 0..45000]
  node bin/engram-sharing.mjs relay-complete --state <private-dir> --receipt <private-result.json>
  node bin/engram-sharing.mjs relay-fail --state <private-dir> --receipt <private-result.json>

Runtime state defaults to .local/engram-sharing. --state must be beneath a .local directory.
Prepare packages only explicitly selected files. Import --init requires a chosen new or empty target.
An importer result is a save receipt and discussion handoff; My take requires your confirmation.
`;
function options(args) {
  const result = {};
  const allowed = new Set(['manifest', 'root', 'prepared', 'port', 'url', 'target', 'package', 'state', 'public-url', 'init', 'demo', 'delivery', 'local-setup', 'wait-ms', 'receipt']);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--') || !allowed.has(arg.slice(2))) throw new ShareError('Unknown sharing option. Use --help.');
    const key = arg.slice(2);
    if (Object.hasOwn(result, key)) throw new ShareError('Duplicate sharing option.');
    if (key === 'init' || key === 'demo' || key === 'local-setup') result[key] = true;
    else { if (!args[index + 1] || args[index + 1].startsWith('--')) throw new ShareError('Sharing option needs a value.'); result[key] = args[++index]; }
  }
  return result;
}
async function demoSelection(stateDir) {
  const root = path.join(stateDir, 'demo-originals');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const filename = path.join(root, 'Project Checkpoints.txt');
  const content = 'Project Checkpoints\n\nA synthetic project team keeps a checkpoint after each experiment. Each checkpoint records the question, observation, decision, and next check. Decisions name the evidence used and any unresolved uncertainty.\n\nThis fixture demonstrates sharing only. It is not a report about a real project.\n';
  try { await fs.writeFile(filename, content, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  return preparePackage({ version: 1, title: 'Project Checkpoints', sender: 'Demo sender', author: 'Synthetic fixture', previewReviewed: true, preview: 'A synthetic project team uses a checkpoint after each experiment to keep its question, observation, decision, and next check together. Each decision names its evidence and the uncertainty that remains.', senderThoughts: 'I would like to try this format at our next checkpoint. This is a synthetic sender thought.', files: [{ path: 'Project Checkpoints.txt' }] }, root);
}
export async function runSharing(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  const command = args[0];
  const flags = options(args.slice(1));
  if (command === 'import') {
    if (Boolean(flags.url) === Boolean(flags.package) || !flags.target) throw new ShareError('Provide exactly one --url or --package and a chosen --target.');
    const result = await importSelection({ shareUrl: flags.url, packageFile: flags.package, target: flags.target, initialize: flags.init === true });
    console.log(JSON.stringify(result, null, 2)); return;
  }
  const stateDir = path.resolve(flags.state ?? '.local/engram-sharing');
  if (!stateDir.split(path.sep).includes('.local')) throw new ShareError('Keep runtime state inside an ignored .local directory.');
  await noSymlinks(stateDir, { allowMissing: true });
  if (['relay-next', 'relay-complete', 'relay-fail'].includes(command)) {
    const relay = await createRelay(stateDir);
    if (command === 'relay-next') {
      console.log(JSON.stringify(await relay.next(Number(flags['wait-ms'] ?? 0))));
      return;
    }
    if (!flags.receipt) throw new ShareError('Provide the private --receipt JSON file for this exclusive claim.');
    const receiptPath = path.resolve(flags.receipt);
    if (!receiptPath.startsWith(stateDir + path.sep)) throw new ShareError('Keep relay result input inside this private state directory.');
    if ((await fs.lstat(receiptPath)).size > 4096) throw new ShareError('Relay result input is too large.');
    const receipt = await readPrivateJSON(receiptPath);
    if (command === 'relay-fail' && !['failed', 'unknown'].includes(receipt.status)) throw new ShareError('Relay failure must be failed or unknown; never automatically retry an uncertain send.');
    const result = await relay.finish({ ...receipt, status: command === 'relay-complete' ? 'sent' : receipt.status });
    await removePrivateFile(receiptPath);
    console.log(JSON.stringify(result));
    return;
  }
  if (command === 'prepare') {
    if (!flags.manifest || !flags.root) throw new ShareError('Provide --manifest and the explicit --root containing selected originals.');
    await noSymlinks(path.resolve(flags.manifest));
    const stat = await fs.stat(flags.manifest);
    if (stat.size > MAX_BYTES) throw new ShareError('Manifest is too large.');
    const manifest = JSON.parse(await fs.readFile(flags.manifest, 'utf8'));
    const selection = await preparePackage(manifest, flags.root);
    await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
    const filename = path.join(stateDir, 'prepared.json');
    await noSymlinks(filename, { allowMissing: true });
    await fs.writeFile(filename, JSON.stringify(selection, null, 2), { mode: 0o600 });
    console.log('Prepared the explicit reviewed selection in .local runtime storage. Run the sharing server to review it.'); return;
  }
  if (command === 'serve') {
    const prepared = flags.demo ? await demoSelection(stateDir) : await readPackage(flags.prepared ?? path.join(stateDir, 'prepared.json'));
    const port = Number(flags.port ?? 4318);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ShareError('Use a valid local port.');
    const service = await createSharingServer({ prepared, stateDir, publicUrl: flags['public-url'], delivery: flags.delivery ?? 'outbox', localSetup: flags['local-setup'] === true });
    const started = await service.listen(port);
    console.log(`Local sharing preview (PID ${process.pid}). ${flags.delivery === 'relay' ? 'Invitations wait for a connected agent to relay and record provider acceptance.' : 'Invitations use the local outbox; no email is sent.'}`);
    console.log(`Open locally: ${started.senderUrl}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); process.exit(0); });
    return service;
  }
  throw new ShareError('Unknown sharing command. Use --help.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runSharing(); }
  catch (error) { console.error(error instanceof ShareError ? error.message : 'Sharing could not continue. Check your selection, permissions, and configuration.'); process.exitCode = 1; }
}
