import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const demo = resolve(root, 'data/demo');
export function createDemo(target) {
  if (existsSync(target)) throw new Error('Refusing to overwrite an existing demonstration directory');
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(root, 'examples/shop'), target, { recursive: true });
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.no-hooks', ...args],
      { cwd: target, stdio: 'pipe' },
    );
  git('init', '-b', 'main');
  git('add', '.');
  git(
    '-c',
    'user.name=RepoLens fixture',
    '-c',
    'user.email=fixture@repolens.local',
    'commit',
    '-m',
    'Healthy shop baseline',
  );
  const file = resolve(target, 'src/domain/pricing.ts');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('subtotal * (1 + taxRate)', 'subtotal * (1 + taxRate) + 1'),
    'utf8',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(demo)) {
    createDemo(demo);
    console.log('Created a Git-backed demo with a deliberate pricing regression.');
  } else console.log('Using existing demo. Your local edits are preserved.');
}
