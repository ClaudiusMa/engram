import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const MAX_BYTES = 12 * 1024 * 1024;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const TYPES = Object.freeze({ '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' });
export const digest = value => createHash('sha256').update(value).digest('hex');
export class ShareError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function text(value, label, max, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new ShareError(`Invalid ${label}.`);
  return value;
}
export function safeName(value) {
  text(value, 'filename', 140);
  if (value === '.' || value === '..' || /[/\\<>:"|?*\[\]#\r\n]/u.test(value) || value.startsWith('.') || !TYPES[path.extname(value).toLowerCase()]) throw new ShareError('Unsafe or unsupported filename.');
  return value;
}
export async function noSymlinks(absolute, { allowMissing = false } = {}) {
  const resolved = path.resolve(absolute);
  let current = path.parse(resolved).root;
  for (const segment of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new ShareError('Symbolic links are not allowed.'); }
    catch (error) { if (allowMissing && error.code === 'ENOENT') return; throw error; }
  }
}
export function validatePackage(input) {
  if (!input || input.version !== 1 || input.previewReviewed !== true) throw new ShareError('A reviewed preview is needed. Ask your agent to prepare one.');
  const result = { version: 1, title: text(input.title, 'title', 240), preview: text(input.preview, 'preview', 24000), previewReviewed: true };
  result.sender = text(input.sender, 'sender', 200, true);
  result.author = text(input.author, 'author', 200, true);
  result.source = text(input.source, 'source attribution', 2000, true);
  result.senderThoughts = text(input.senderThoughts, 'sender thoughts', 12000, true);
  if (result.senderThoughts && !result.sender) throw new ShareError('Sender thoughts need explicit sender attribution.');
  if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > 20) throw new ShareError('Select between 1 and 20 original files.');
  let size = 0;
  const names = new Set();
  result.files = input.files.map(file => {
    const name = safeName(file.name);
    if (name.toLowerCase() === 'shared context.json' || names.has(name.toLowerCase())) throw new ShareError('Selected filenames must be unique.');
    names.add(name.toLowerCase());
    if (typeof file.data !== 'string' || file.data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(file.data)) throw new ShareError('Invalid or excessive file data.');
    const bytes = Buffer.from(file.data, 'base64');
    size += bytes.length;
    if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES || digest(bytes) !== file.sha256) throw new ShareError('Original file integrity check failed.');
    return { name, type: TYPES[path.extname(name).toLowerCase()], size: bytes.length, sha256: file.sha256, data: file.data };
  });
  if (size > 8 * 1024 * 1024 || Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw new ShareError('Selection is too large.');
  return result;
}
export async function preparePackage(manifest, root) {
  await noSymlinks(root);
  const selectedRoot = path.resolve(root);
  const files = [];
  if (!Array.isArray(manifest.files) || manifest.files.length > 20) throw new ShareError('Invalid selection.');
  for (const selected of manifest.files) {
    const relative = selected.path;
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/u).some(part => part === '..' || part === '.') || relative.includes('\\')) throw new ShareError('Select safe relative original paths.');
    const absolute = path.resolve(selectedRoot, relative);
    if (!absolute.startsWith(selectedRoot + path.sep)) throw new ShareError('Original is outside the selected root.');
    await noSymlinks(absolute);
    const stat = await fs.stat(absolute);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new ShareError('Original must be a regular file under 4 MiB.');
    const name = safeName(selected.name ?? path.basename(relative));
    const bytes = await fs.readFile(absolute);
    files.push({ name, data: bytes.toString('base64'), sha256: digest(bytes) });
  }
  return validatePackage({ ...manifest, files });
}
export async function readPackage(filename) {
  await noSymlinks(filename);
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new ShareError('Package is too large or unavailable.');
  return validatePackage(JSON.parse(await fs.readFile(filename, 'utf8')));
}
