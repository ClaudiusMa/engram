import path from 'node:path';
import { digest } from './package.mjs';
import { ensurePrivateDirectory, writePrivateJSON } from './storage.mjs';

// Production adapters implement send(invitation) -> { status: 'sent' } only
// after provider acceptance. No provider or network mail adapter is enabled here.
export function localOutbox(directory) {
  return {
    async send(invitation) {
      await ensurePrivateDirectory(directory);
      await writePrivateJSON(path.join(directory, digest(invitation.url) + '.json'), invitation);
      return { status: 'outbox' };
    },
  };
}
export function invitationFor(selection, email, url, expiresAt) {
  return {
    email, url, expiresAt,
    subject: selection.sender ? `${selection.sender} shared “${selection.title}” with you` : 'Knowledge shared with you on Engram',
    body: `Read the preview and save this selection to your Engram.\n\nOpen shared knowledge: ${url}\n\nAvailable until ${new Date(expiresAt).toISOString()}. Anyone with this link can access this selection.`,
  };
}
