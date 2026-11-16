import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { AnalysisEngine } from '../dist/core/engine.js';
import { root } from './demo.mjs';

const repository = 'https://github.com/developit/mitt.git';
const commit = '6b41670516ed8e8b738612f60491995470aa63b3';
const directory = resolve(root, 'data/upstream/mitt');
const git = (...args) =>
  execFileSync('git', ['-c', 'core.hooksPath=.no-hooks', ...args], {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
if (!existsSync(directory)) {
  mkdirSync(resolve(root, 'data/upstream'), { recursive: true });
  execFileSync(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.hooksPath=.no-hooks',
      'clone',
      '--no-checkout',
      repository,
      directory,
    ],
    { stdio: 'pipe' },
  );
  git('config', 'core.autocrlf', 'false');
  git('checkout', '--detach', commit);
}
assert.equal(git('remote', 'get-url', 'origin'), repository, 'Unexpected upstream origin');
assert.equal(git('rev-parse', 'HEAD'), commit, 'Upstream checkout is not at the pinned commit');
assert.equal(
  git('status', '--porcelain'),
  '',
  'Refusing to modify an upstream checkout containing local edits',
);
const file = resolve(directory, 'src/index.ts');
const original = readFileSync(file);
const text = original.toString('utf8');
assert.ok(text.includes('all = all || new Map();'), 'Mutation anchor changed');
const engine = new AnalysisEngine(directory);
try {
  assert.equal(engine.analyze().changes.length, 0);
  writeFileSync(file, text.replace('all = all || new Map();', 'all = new Map();'));
  const report = engine.analyze();
  const candidate = report.tests.find((test) => test.file === 'test/index_test.ts');
  assert.ok(candidate, 'Expected emitter consumer test to be recommended');
  assert.equal(candidate.confidence, 'module', 'Unbuilt package entry must remain conservative');
  const output = {
    repository,
    commit,
    generatedAt: new Date().toISOString(),
    mutation: 'Ignore the supplied handler map in mitt()',
    changes: report.changes,
    selected: report.tests.map((test) => ({ file: test.file, evidence: test.confidence })),
    warnings: report.warnings,
    scope:
      'Static integration check against a pinned upstream checkout. Upstream tests and package scripts were not executed. Package source metadata supplies conservative module evidence; this is not an accuracy benchmark.',
  };
  writeFileSync(resolve(root, 'data/upstream-validation.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(
    `mitt @ ${commit.slice(0, 12)}: ${report.graph.stats.files} source files; ${candidate.file} recommended with ${candidate.confidence} evidence.\nNo upstream code executed. Report: data/upstream-validation.json`,
  );
} finally {
  writeFileSync(file, original);
  engine.dispose();
}
