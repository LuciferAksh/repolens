import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export interface Snapshot {
  files: Map<string, string>;
  warnings: string[];
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const slash = (value: string) => value.replaceAll('\\', '/');
export const isSource = (file: string) => /\.(?:[cm]?[jt]sx?)$/i.test(file);
const relevant = (file: string) =>
  isSource(file) || /(?:^|\/)(?:package|tsconfig[^/]*|jsconfig)\.json$/.test(file);
const excluded = (file: string) =>
  /(?:^|\/)(?:node_modules|\.git|dist|build|coverage|vendor|\.next)(?:\/|$)/.test(file) ||
  /(?:^|\/)\.env/.test(file);
const MAX_FILES = 3000,
  MAX_BYTES = 40 * 1024 * 1024,
  MAX_FILE = 1024 * 1024;

export function git(root: string, args: string[], input?: string): Buffer {
  try {
    return execFileSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd: root,
      input,
      maxBuffer: MAX_BYTES * 3,
      timeout: 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.split('\n').slice(0, 3).join('\n') : 'Git operation failed';
    throw new Error(message);
  }
}

export function repositoryRoot(input: string): string {
  const root = git(resolve(input), ['rev-parse', '--show-toplevel']).toString().trim();
  return realpathSync(root);
}

export function resolveCommit(root: string, ref: string): string {
  if (!ref || ref.length > 200 || /[\r\n\0]/.test(ref)) throw new Error('Invalid Git revision');
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
    .toString()
    .trim();
}

export function inside(root: string, path: string): boolean {
  const part = relative(root, path);
  return (
    part !== '..' && !part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(part)
  );
}

function add(files: Map<string, string>, name: string, content: string, warnings: string[]) {
  if (Buffer.byteLength(content) > MAX_FILE) {
    warnings.push(`Skipped file larger than 1 MiB: ${name}`);
    return;
  }
  // Git blobs commonly use LF while Windows checkouts use CRLF. Treat the
  // platform checkout conversion as the same source, preserving line numbers.
  files.set(name, content.replaceAll('\r\n', '\n'));
  if (files.size > MAX_FILES) throw new Error(`Repository exceeds the ${MAX_FILES}-file analysis limit`);
}

export function workingSnapshot(root: string): Snapshot {
  const files = new Map<string, string>(),
    warnings: string[] = [];
  const names = new Set(
    git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .toString()
      .split('\0')
      .filter(Boolean),
  );
  let bytes = 0;
  for (const name of [...names].sort()) {
    if (!relevant(name) || excluded(name)) continue;
    const full = resolve(root, name);
    if (!inside(root, full)) throw new Error('Git returned a path outside the repository');
    try {
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        warnings.push(`Skipped source symlink: ${name}`);
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > MAX_FILE) {
        warnings.push(`Skipped file larger than 1 MiB: ${name}`);
        continue;
      }
      bytes += stat.size;
      if (bytes > MAX_BYTES) throw new Error('Repository exceeds the 40 MiB source limit');
      add(files, slash(name), readFileSync(full, 'utf8'), warnings);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  return { files, warnings };
}

export function commitSnapshot(root: string, commit: string): Snapshot {
  const files = new Map<string, string>(),
    warnings: string[] = [];
  const entries = git(root, ['ls-tree', '-r', '-z', '--full-tree', commit])
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const [mode, kind, sha] = line.slice(0, tab).split(' ');
      return { mode, kind, sha, name: line.slice(tab + 1) };
    })
    .filter((entry) => relevant(entry.name) && !excluded(entry.name) && entry.kind === 'blob');
  const safe = entries.filter((entry) => {
    if (entry.mode === '120000') {
      warnings.push(`Skipped source symlink in baseline: ${entry.name}`);
      return false;
    }
    return true;
  });
  if (safe.length > MAX_FILES) throw new Error(`Baseline exceeds the ${MAX_FILES}-file limit`);
  if (!safe.length) return { files, warnings };
  const batch = git(root, ['cat-file', '--batch'], safe.map((entry) => entry.sha).join('\n') + '\n');
  let offset = 0,
    bytes = 0;
  for (const entry of safe) {
    const newline = batch.indexOf(10, offset);
    if (newline < 0) throw new Error('Incomplete Git object response');
    const [, kind, length] = batch.subarray(offset, newline).toString().split(' ');
    const size = Number(length);
    if (kind !== 'blob' || !Number.isSafeInteger(size) || size < 0 || newline + 1 + size >= batch.length)
      throw new Error('Invalid Git object response');
    const content = batch.subarray(newline + 1, newline + 1 + size).toString('utf8');
    offset = newline + 1 + size + 1;
    bytes += size;
    if (bytes > MAX_BYTES) throw new Error('Baseline exceeds the 40 MiB source limit');
    add(files, entry.name, content, warnings);
  }
  return { files, warnings };
}
