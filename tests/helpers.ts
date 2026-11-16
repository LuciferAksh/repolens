import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

export function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'repolens-test-'));
  const write = (file: string, value: string) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value, 'utf8');
  };
  write('package.json', '{"type":"module"}');
  write('.gitignore', 'node_modules/\n.env*\n');
  for (const [file, value] of Object.entries(files)) write(file, value);
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${join(root, '.no-hooks')}`,
        ...args,
      ],
      { cwd: root, stdio: 'pipe' },
    );
  git('init', '-b', 'main');
  git('add', '.');
  git('-c', 'user.name=RepoLens tests', '-c', 'user.email=tests@repolens.local', 'commit', '-m', 'Baseline');
  return {
    root,
    write,
    git,
    cleanup: () => {
      assert.equal(realpathSync(dirname(root)), realpathSync(tmpdir()));
      assert.ok(basename(root).startsWith('repolens-test-'));
      rmSync(root, { recursive: true, force: true });
    },
  };
}
