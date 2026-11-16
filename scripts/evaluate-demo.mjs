import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createDemo, root } from './demo.mjs';
import { AnalysisEngine } from '../dist/core/engine.js';

const parent = mkdtempSync(join(tmpdir(), 'repolens-evaluation-'));
const directory = join(parent, 'shop');
createDemo(directory);
const engine = new AnalysisEngine(directory);
try {
  const report = engine.analyze();
  const testFiles = readdirSync(join(directory, 'tests'))
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => `tests/${file}`)
    .sort();
  const execute = () =>
    testFiles.map((file) => {
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', join(directory, file)], {
        cwd: root,
        encoding: 'utf8',
        timeout: 20_000,
      });
      if (result.error) throw result.error;
      if (!result.stdout.includes('tests 1'))
        throw new Error(`Test runner did not execute the expected test in ${file}: ${result.stderr}`);
      return { file, passed: result.status === 0 };
    });
  const working = execute();
  const price = join(directory, 'src/domain/pricing.ts');
  const workingPrice = readFileSync(price, 'utf8');
  const basePrice = execFileSync('git', ['show', 'HEAD:src/domain/pricing.ts'], {
    cwd: directory,
    encoding: 'utf8',
  });
  writeFileSync(price, basePrice, 'utf8');
  const baseline = execute();
  writeFileSync(price, workingPrice, 'utf8');
  assert.ok(
    baseline.every((item) => item.passed),
    'Healthy baseline must pass every test',
  );
  const failed = working.filter((item) => !item.passed).map((item) => item.file);
  assert.ok(failed.length > 0, 'The mutation must cause observed failures');
  const selected = report.tests.map((item) => item.file);
  const missed = failed.filter((file) => !selected.includes(file));
  assert.equal(missed.length, 0, `Missed observed failures: ${missed.join(', ')}`);
  const rerun = engine.analyze();
  const result = {
    generatedAt: new Date().toISOString(),
    fixture: 'Owned shop fixture; deliberately added pricing surcharge',
    baseline,
    working,
    failed,
    selected,
    missed,
    observedFailureRecall: (failed.length - missed.length) / failed.length,
    selectionRatio: selected.length / testFiles.length,
    incremental: {
      reusedFiles: rerun.stats.reusedFiles,
      indexedFiles: rerun.stats.indexedFiles,
      elapsedMs: rerun.stats.elapsedMs,
    },
    scope:
      'One known mutation in a seven-test owned fixture. This does not establish production accuracy or safe test skipping.',
  };
  mkdirSync(resolve(root, 'data'), { recursive: true });
  writeFileSync(resolve(root, 'data/validation.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(
    `Baseline: ${baseline.length}/${baseline.length} passed. Changed version: ${failed.length} observed failing test files.`,
  );
  console.log(
    `Selected ${selected.length}/${testFiles.length}; recalled ${failed.length - missed.length}/${failed.length} observed failures.`,
  );
  console.log(
    `Unchanged rescan: ${rerun.stats.reusedFiles} reused files, ${rerun.stats.indexedFiles} reindexed.\nReport: data/validation.json`,
  );
} finally {
  engine.dispose();
  assert.equal(realpathSync(dirname(parent)), realpathSync(tmpdir()));
  assert.ok(basename(parent).startsWith('repolens-evaluation-'));
  rmSync(parent, { recursive: true, force: true });
}
