import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { noSymlinks, ShareError } from './package.mjs';

async function checkPrivate(filename, directory, allowMissing = false) {
  await noSymlinks(filename, { allowMissing });
  let stat;
  try { stat = await fs.lstat(filename); }
  catch (error) { if (allowMissing && error.code === 'ENOENT') return false; throw error; }
  if ((directory ? !stat.isDirectory() : !stat.isFile()) ||
      (typeof process.getuid === 'function' && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))) {
    throw new ShareError('Sharing storage must be private, owned by this user, and contain regular files and directories.', 503);
  }
  return true;
}
export async function ensurePrivateDirectory(directory) {
  if (!(await checkPrivate(directory, true, true))) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await checkPrivate(directory, true);
}
export async function checkPrivateDirectory(directory) { await checkPrivate(directory, true); }
export async function checkPrivateFile(filename, allowMissing = false) {
  await checkPrivateDirectory(path.dirname(filename));
  return checkPrivate(filename, false, allowMissing);
}
export async function readPrivateJSON(filename) {
  await checkPrivateFile(filename);
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try { return JSON.parse(await handle.readFile('utf8')); }
  finally { await handle.close(); }
}
export async function writePrivateJSON(filename, data) {
  await checkPrivateFile(filename, true);
  // Exclusive creation prevents following a link introduced after validation.
  await fs.writeFile(filename, JSON.stringify(data), { flag: 'wx', mode: 0o600 });
}
export async function removePrivateFile(filename) {
  if (await checkPrivateFile(filename, true)) await fs.unlink(filename);
}
