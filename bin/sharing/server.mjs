import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validatePackage, digest, ShareError, noSymlinks } from './package.mjs';
import { localOutbox, invitationFor } from './invitations.mjs';
import { createRelay } from './relay.mjs';
import { ensurePrivateDirectory, checkPrivateDirectory, checkPrivateFile, readPrivateJSON, writePrivateJSON, removePrivateFile } from './storage.mjs';

export const LIFETIME = 7 * 24 * 60 * 60 * 1000;
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const staticAssets = Object.freeze({ '/style.css': 'text/css', '/app.js': 'text/javascript', '/logo.svg': 'image/svg+xml' });
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
export async function createSharingServer({ prepared, stateDir, senderToken = randomBytes(32).toString('base64url'), publicUrl, now = Date.now, invitationAdapter, cleanupInterval = 60000, delivery = 'outbox', localSetup = false }) {
  const selection = validatePackage(prepared);
  if (!['outbox', 'relay'].includes(delivery)) throw new ShareError('Delivery must be outbox or relay.');
  if (localSetup && publicUrl) throw new ShareError('Local setup metadata is available only on a loopback preview.');
  let setupMetadata;
  if (localSetup) {
    const importerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'engram-sharing.mjs');
    await noSymlinks(importerPath);
    if (!(await fs.stat(importerPath)).isFile()) throw new ShareError('Local importer is unavailable.');
    setupMetadata = { version: 1, importerPath, sha256: digest(await fs.readFile(importerPath)) };
  }
  await ensurePrivateDirectory(stateDir);
  for (const child of ['shares', 'expired', 'outbox']) await ensurePrivateDirectory(path.join(stateDir, child));
  async function checkStorage() {
    await checkPrivateDirectory(stateDir);
    for (const child of ['shares', 'expired', 'outbox']) await checkPrivateDirectory(path.join(stateDir, child));
  }
  let relay;
  try { await fs.lstat(path.join(stateDir, 'relay')); relay = await createRelay(stateDir, { now }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (delivery === 'relay' && !relay) relay = await createRelay(stateDir, { now });
  const adapter = invitationAdapter ?? (delivery === 'relay' ? relay : localOutbox(path.join(stateDir, 'outbox')));
  let origin;
  let busy = Promise.resolve();
  function serial(action) { const result = busy.then(action); busy = result.catch(() => {}); return result; }
  const recordPath = token => path.join(stateDir, 'shares', digest(token) + '.json');
  async function expire(record, filename) {
    await checkStorage();
    const markerPath = path.join(stateDir, 'expired', path.basename(filename));
    const invitationPath = path.join(stateDir, 'outbox', digest(record.url) + '.json');
    await checkPrivateFile(filename);
    await checkPrivateFile(invitationPath, true);
    if (relay) await relay.remove(digest(record.url));
    if (await checkPrivateFile(markerPath, true)) {
      const marker = await readPrivateJSON(markerPath);
      if (marker.expiredAt !== record.expiresAt) throw new ShareError('Sharing expiry metadata needs attention.', 503);
    } else await writePrivateJSON(markerPath, { expiredAt: record.expiresAt });
    await removePrivateFile(filename);
    await removePrivateFile(invitationPath);
  }
  async function sweep() {
    await checkStorage();
    if (relay) await relay.cleanup();
    for (const filename of await fs.readdir(path.join(stateDir, 'shares'))) {
      if (!/^[a-f0-9]{64}\.json$/u.test(filename)) continue;
      const absolute = path.join(stateDir, 'shares', filename);
      const record = await readPrivateJSON(absolute);
      if (now() >= record.expiresAt) await expire(record, absolute);
    }
    for (const filename of await fs.readdir(path.join(stateDir, 'expired'))) {
      if (!/^[a-f0-9]{64}\.json$/u.test(filename)) continue;
      const absolute = path.join(stateDir, 'expired', filename);
      const marker = await readPrivateJSON(absolute);
      if (now() >= marker.expiredAt + LIFETIME) await removePrivateFile(absolute);
    }
  }
  async function getRecord(token) {
    await checkStorage();
    if (!tokenPattern.test(token)) throw new ShareError("This share isn't available.", 404);
    const filename = recordPath(token);
    let record;
    try { record = await readPrivateJSON(filename); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { await readPrivateJSON(path.join(stateDir, 'expired', path.basename(filename))); throw new ShareError('This share has expired.', 410); }
      catch (markerError) { if (markerError instanceof ShareError) throw markerError; throw new ShareError("This share isn't available.", 404); }
    }
    if (now() >= record.expiresAt) { await expire(record, filename); throw new ShareError('This share has expired.', 410); }
    return record;
  }
  function authorize(request) {
    const supplied = request.headers.authorization?.replace(/^Bearer /u, '') ?? '';
    const expected = Buffer.from(senderToken);
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ShareError('Open sharing from your local Engram session.', 401);
    if (request.method !== 'GET' && request.headers.origin !== origin) throw new ShareError('Open sharing from your local Engram session.', 403);
  }
  function respond(response, status, data, type = 'application/json') {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    response.end(type === 'application/json' ? JSON.stringify(data) : data);
  }
  async function body(request) {
    let value = '';
    for await (const chunk of request) {
      value += chunk;
      if (Buffer.byteLength(value) > 2048) throw new ShareError('Request is too large.', 413);
    }
    try { return JSON.parse(value); } catch { throw new ShareError('Invalid request.'); }
  }
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://local.invalid').pathname;
      if (request.method === 'GET' && Object.hasOwn(staticAssets, pathname)) {
        return respond(response, 200, await fs.readFile(path.join(assets, pathname.slice(1))), staticAssets[pathname]);
      }
      if (request.method === 'GET' && (pathname === '/sender' || /^\/s\/[A-Za-z0-9_-]+$/u.test(pathname))) return respond(response, 200, await fs.readFile(path.join(assets, 'index.html')), 'text/html');
      const originalMatch = pathname.match(/^\/api\/prepared\/files\/(\d+)$/u);
      if (originalMatch && request.method === 'GET') {
        authorize(request);
        const file = selection.files[Number(originalMatch[1])];
        if (!file) throw new ShareError('Original unavailable.', 404);
        return respond(response, 200, Buffer.from(file.data, 'base64'), 'application/octet-stream');
      }
      if (pathname === '/api/prepared' && request.method === 'GET') {
        authorize(request);
        return respond(response, 200, { ...selection, ...(setupMetadata ? { localSetup: setupMetadata } : {}), files: selection.files.map(({ data, ...metadata }) => metadata) });
      }
      if (pathname === '/api/shares' && request.method === 'POST') {
        authorize(request);
        const { email } = await body(request);
        if (typeof email !== 'string' || email.length > 254 || !emailPattern.test(email)) throw new ShareError('Enter a valid email address.');
        const record = await serial(async () => {
          await sweep();
          const token = randomBytes(32).toString('base64url');
          const expiresAt = now() + LIFETIME;
          const url = `${origin}/s/${token}`;
          const result = { selection, expiresAt, url };
          await writePrivateJSON(recordPath(token), result);
          return result;
        });
        let invitation = 'failed';
        let deliveryId;
        try { const outcome = await adapter.send(invitationFor(selection, email, record.url, record.expiresAt)); invitation = ['sent', 'outbox', 'queued'].includes(outcome?.status) ? outcome.status : 'failed'; deliveryId = outcome?.status === 'queued' ? outcome.deliveryId : undefined; } catch { /* The capability remains usable after adapter failure. */ }
        return respond(response, 201, { url: record.url, expiresAt: record.expiresAt, invitation, email, ...(deliveryId ? { deliveryId } : {}) });
      }
      const deliveryMatch = pathname.match(/^\/api\/deliveries\/([a-f0-9]{64})$/u);
      if (deliveryMatch && request.method === 'GET') {
        authorize(request);
        if (!relay) throw new ShareError('Invitation delivery is unavailable.', 404);
        return respond(response, 200, await relay.status(deliveryMatch[1]));
      }
      const match = pathname.match(/^\/api\/share\/([A-Za-z0-9_-]+)(?:\/(package|files\/\d+))?$/u);
      if (match && request.method === 'GET') {
        const record = await serial(() => getRecord(match[1]));
        if (match[2] === 'package') {
          response.setHeader('Content-Disposition', 'attachment; filename="engram-selection.json"');
          return respond(response, 200, record.selection);
        }
        if (match[2]?.startsWith('files/')) {
          const file = record.selection.files[Number(match[2].slice(6))];
          if (!file) throw new ShareError('Original unavailable.', 404);
          response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
          return respond(response, 200, Buffer.from(file.data, 'base64'), 'application/octet-stream');
        }
        return respond(response, 200, { ...record.selection, ...(setupMetadata ? { localSetup: setupMetadata } : {}), url: record.url, expiresAt: record.expiresAt, files: record.selection.files.map(({ data, ...metadata }) => metadata) });
      }
      throw new ShareError("This share isn't available.", 404);
    } catch (error) { respond(response, error instanceof ShareError ? error.status : 503, { error: error instanceof ShareError ? error.message : "Couldn't load this share. Try again." }); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  let interval;
  return {
    server, senderToken,
    async listen(port = 4318, host = '127.0.0.1') {
      if (localSetup && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new ShareError('Local setup metadata requires a loopback preview.');
      await serial(sweep);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      const address = server.address();
      origin = publicUrl ? new URL(publicUrl).origin : `http://${host}:${address.port}`;
      if (publicUrl && (new URL(publicUrl).protocol !== 'https:' || new URL(publicUrl).pathname !== '/')) { await new Promise(resolve => server.close(resolve)); throw new ShareError('Public URL must be an HTTPS origin.'); }
      interval = setInterval(() => serial(sweep).catch(() => {}), cleanupInterval);
      interval.unref();
      return { origin, senderUrl: `${origin}/sender#${senderToken}`, port: address.port };
    },
    cleanup: () => serial(sweep),
    async close() { clearInterval(interval); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); },
  };
}
