import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { digest, ShareError } from './package.mjs';
import { ensurePrivateDirectory, checkPrivateDirectory, checkPrivateFile, readPrivateJSON, writePrivateJSON, removePrivateFile } from './storage.mjs';

const idPattern = /^[a-f0-9]{64}$/u;
const claimPattern = /^[A-Za-z0-9_-]{43}$/u;
function identifier(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new ShareError('Invalid relay delivery identifier.');
  return value;
}
export async function createRelay(stateDir, { now = Date.now } = {}) {
  await ensurePrivateDirectory(stateDir);
  const root = path.join(stateDir, 'relay');
  await ensurePrivateDirectory(root);
  const directories = Object.fromEntries(['jobs', 'claims', 'receipts'].map(name => [name, path.join(root, name)]));
  for (const directory of Object.values(directories)) await ensurePrivateDirectory(directory);
  const filename = (kind, id) => path.join(directories[kind], identifier(id) + '.json');
  async function check() {
    await checkPrivateDirectory(stateDir); await checkPrivateDirectory(root);
    for (const directory of Object.values(directories)) await checkPrivateDirectory(directory);
  }
  async function maybeRead(kind, id) {
    const file = filename(kind, id);
    if (!(await checkPrivateFile(file, true))) return undefined;
    try { return await readPrivateJSON(file); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  async function remove(id) {
    await check();
    // Validate the entire record set before deleting any part of it.
    for (const kind of Object.keys(directories)) await checkPrivateFile(filename(kind, id), true);
    for (const kind of Object.keys(directories)) await removePrivateFile(filename(kind, id));
  }
  async function jobFor(id) {
    await check();
    const job = await maybeRead('jobs', id);
    if (!job) throw new ShareError('Invitation delivery is unavailable.', 404);
    if (now() >= job.expiresAt) { await remove(id); throw new ShareError('This share has expired.', 410); }
    return job;
  }
  async function status(id) {
    const job = await jobFor(id);
    const receipt = await maybeRead('receipts', id);
    if (receipt) return { id, status: receipt.status, expiresAt: job.expiresAt, completedAt: receipt.completedAt };
    return { id, status: await maybeRead('claims', id) ? 'claimed' : 'queued', expiresAt: job.expiresAt };
  }
  async function cleanup() {
    await check();
    for (const [kind, directory] of Object.entries(directories)) {
      for (const name of await fs.readdir(directory)) {
        if (!/^[a-f0-9]{64}\.json$/u.test(name)) continue;
        let record;
        try { record = await readPrivateJSON(path.join(directory, name)); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (!Number.isFinite(record.expiresAt)) throw new ShareError('Relay expiry metadata needs attention.', 503);
        if (now() >= record.expiresAt) await remove(name.slice(0, -5));
      }
    }
  }
  return {
    async send(invitation) {
      await check();
      const id = digest(invitation.url);
      if (!Number.isFinite(invitation.expiresAt) || now() >= invitation.expiresAt) throw new ShareError('This share has expired.', 410);
      const existing = await maybeRead('jobs', id);
      if (existing) {
        if (JSON.stringify(existing.invitation) !== JSON.stringify(invitation)) throw new ShareError('Existing invitation differs. Nothing was overwritten.', 409);
      } else {
        try { await writePrivateJSON(filename('jobs', id), { id, invitation, expiresAt: invitation.expiresAt, queuedAt: now() }); }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const raced = await readPrivateJSON(filename('jobs', id));
          if (JSON.stringify(raced.invitation) !== JSON.stringify(invitation)) throw new ShareError('Existing invitation differs. Nothing was overwritten.', 409);
        }
      }
      return { status: 'queued', deliveryId: id };
    },
    status, remove, cleanup,
    async next(waitMs = 0) {
      if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 45000) throw new ShareError('Relay wait must be between 0 and 45000 milliseconds.');
      const deadline = Date.now() + waitMs;
      do {
        await cleanup();
        for (const name of await fs.readdir(directories.jobs)) {
          if (!/^[a-f0-9]{64}\.json$/u.test(name)) continue;
          const id = name.slice(0, -5);
          if (await maybeRead('receipts', id) || await maybeRead('claims', id)) continue;
          let job;
          try { job = await jobFor(id); } catch (error) { if (error.status === 404 || error.status === 410) continue; throw error; }
          const claim = randomBytes(32).toString('base64url');
          const record = { id, claim, claimedAt: now(), expiresAt: job.expiresAt };
          try { await writePrivateJSON(filename('claims', id), record); }
          catch (error) { if (error.code === 'EEXIST') continue; throw error; }
          // Once claimed, a job is never returned again, including after a crash.
          return { id, claim, expiresAt: job.expiresAt, invitation: job.invitation };
        }
        if (Date.now() >= deadline) return null;
        await new Promise(resolve => setTimeout(resolve, Math.min(250, deadline - Date.now())));
      } while (true);
    },
    async finish({ id, claim, status: outcome, providerId }) {
      identifier(id);
      if (typeof claim !== 'string' || !claimPattern.test(claim)) throw new ShareError('A valid exclusive relay claim is required.');
      if (!['sent', 'failed', 'unknown'].includes(outcome)) throw new ShareError('Invalid relay outcome.');
      if (outcome === 'sent' && (typeof providerId !== 'string' || !providerId.trim() || providerId.length > 512 || /[\r\n\u0000]/u.test(providerId))) throw new ShareError('Provider acceptance identifier is required.');
      const job = await jobFor(id);
      const owned = await maybeRead('claims', id);
      if (!owned || typeof owned.claim !== 'string' || owned.claim.length !== claim.length || !timingSafeEqual(Buffer.from(owned.claim), Buffer.from(claim))) throw new ShareError('Relay claim does not match.', 403);
      const receipt = { id, claimDigest: digest(claim), status: outcome, ...(outcome === 'sent' ? { providerId } : {}), completedAt: now(), expiresAt: job.expiresAt };
      const matches = record => record.claimDigest === receipt.claimDigest && record.status === outcome && record.providerId === receipt.providerId;
      const previous = await maybeRead('receipts', id);
      if (previous) {
        if (!matches(previous)) throw new ShareError('Delivery already has a different terminal outcome. Do not resend.', 409);
        return { id, status: previous.status, duplicate: true };
      }
      try { await writePrivateJSON(filename('receipts', id), receipt); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const raced = await readPrivateJSON(filename('receipts', id));
        if (!matches(raced)) throw new ShareError('Delivery already has a different terminal outcome. Do not resend.', 409);
      }
      return { id, status: outcome };
    },
  };
}
