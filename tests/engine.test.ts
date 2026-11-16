import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisEngine } from '../src/core/engine.js';
import { fixture } from './helpers.js';

test('distinguishes symbol dependencies from same-module conservative candidates', () => {
  const repo = fixture({
    'src/lib.ts': 'export function used(){return 1} export function other(){return 2}',
    'tests/used.test.ts': "import {used as alias} from '../src/lib.js'; alias();",
    'tests/other.test.ts': "import {other} from '../src/lib.js'; other();",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/lib.ts', 'export function used(){return 3} export function other(){return 2}');
    const result = engine.analyze();
    assert.equal(result.changedSymbols.length, 1);
    assert.equal(result.tests.find((t) => t.file === 'tests/used.test.ts')?.confidence, 'symbol');
    assert.equal(result.tests.find((t) => t.file === 'tests/other.test.ts')?.confidence, 'module');
    assert.ok(result.tests.every((t) => t.path.nodes.length === t.path.edges.length + 1));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('resolves re-export aliases and explains transitive calls', () => {
  const repo = fixture({
    'src/a.ts': 'export const price = () => 1;',
    'src/index.ts': "export {price as amount} from './a.js'",
    'src/b.ts': "import {amount} from './index.js'; export function total(){return amount()}",
    'tests/order.test.ts': "import {total} from '../src/b.js'; total();",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/a.ts', 'export const price = () => 9;');
    const result = engine.analyze();
    assert.equal(result.tests[0]?.confidence, 'symbol');
    assert.equal(result.tests[0]?.distance, 2);
    assert.ok(result.graph.edges.some((e) => e.kind === 're-export'));
    assert.ok(result.graph.edges.some((e) => e.kind === 'call' && e.target.endsWith('#price')));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('deleted code retains historical dependency paths', () => {
  const repo = fixture({
    'src/removed.ts': 'export function gone(){return 1}',
    'tests/removed.test.ts': "import {gone} from '../src/removed.js'; gone()",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    unlinkSync(join(repo.root, 'src/removed.ts'));
    const result = engine.analyze();
    assert.equal(result.changes[0].status, 'deleted');
    assert.equal(result.tests[0].file, 'tests/removed.test.ts');
    assert.ok(
      result.tests[0].path.edges.some(
        (id) => result.graph.edges.find((e) => e.id === id)?.snapshot === 'base',
      ),
    );
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('untracked source files and new test files participate in analysis', () => {
  const repo = fixture({ 'src/existing.ts': 'export const x = 1;' });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/new.ts', 'export function created(){return 2}');
    repo.write('tests/new.test.ts', "import {created} from '../src/new.js'; created()");
    const result = engine.analyze();
    assert.equal(result.changes.length, 2);
    assert.ok(result.tests.some((t) => t.file === 'tests/new.test.ts'));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('reuses unchanged indexes and caches the committed baseline', () => {
  const repo = fixture({
    'src/a.ts': 'export const a = 1;',
    'src/b.ts': 'export const b = 2;',
    'tests/a.test.ts': "import {a} from '../src/a.js'; console.log(a)",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    engine.analyze();
    const same = engine.analyze();
    assert.equal(same.stats.indexedFiles, 0);
    assert.equal(same.stats.reusedFiles, 3);
    assert.equal(same.stats.baselineCached, true);
    repo.write('src/a.ts', 'export const a = 3;');
    const changed = engine.analyze();
    assert.ok(changed.stats.reusedFiles >= 1);
    assert.ok(changed.stats.indexedFiles >= 1);
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('root tsconfig path aliases resolve without executing a config file', () => {
  const repo = fixture({
    'tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@lib/*":["src/*"]}}}',
    'src/a.ts': 'export function a(){return 1}',
    'tests/a.test.ts': "import {a} from '@lib/a'; a()",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/a.ts', 'export function a(){return 2}');
    const result = engine.analyze();
    assert.equal(result.tests[0]?.confidence, 'symbol');
    assert.ok(result.graph.edges.some((e) => e.kind === 'import' && e.target === 'file:src/a.ts'));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('literal dynamic imports are conservative module paths and nonliteral imports are disclosed', () => {
  const repo = fixture({
    'src/a.ts': 'export const a = 1;',
    'tests/a.test.ts':
      "async function load(){return import('../src/a.js')} const path = './unknown'; import(path); load();",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/a.ts', 'export const a = 2;');
    const result = engine.analyze();
    assert.equal(result.tests[0]?.confidence, 'module');
    assert.ok(result.warnings.some((w) => w.includes('nonliteral')));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('class methods and constructors are indexed', () => {
  const repo = fixture({
    'src/a.ts': 'export class Service { constructor() {} run(){return 1} }',
    'tests/a.test.ts': "import {Service} from '../src/a.js'; new Service().run();",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/a.ts', 'export class Service { constructor() {} run(){return 2} }');
    const result = engine.analyze();
    assert.ok(result.changedSymbols.some((id) => id.endsWith('#Service.run')));
    assert.equal(result.tests[0]?.confidence, 'symbol');
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('type dependencies are reported as type relationships', () => {
  const repo = fixture({
    'src/a.ts': 'export interface Price { value: string }',
    'tests/a.test.ts': "import type {Price} from '../src/a.js'; export const data: Price = {value:'one'}",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/a.ts', 'export interface Price { value: number }');
    const result = engine.analyze();
    assert.equal(result.tests[0]?.confidence, 'symbol');
    assert.ok(result.graph.edges.some((e) => e.kind === 'type'));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('default exports and namespace property references resolve', () => {
  const repo = fixture({
    'src/a.ts': 'export default function(){return 1} export const other=2;',
    'tests/a.test.ts': "import fn, * as ns from '../src/a.js'; fn(); console.log(ns.other);",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/a.ts', 'export default function(){return 3} export const other=4;');
    const result = engine.analyze();
    assert.ok(result.changedSymbols.some((id) => id.endsWith('#default')));
    assert.ok(
      result.graph.edges.some((e) => e.target.endsWith('#other') && e.source === 'file:tests/a.test.ts'),
    );
    assert.equal(result.tests[0]?.confidence, 'symbol');
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('cycles terminate and retain a finite shortest explanation path', () => {
  const repo = fixture({
    'src/a.ts': "import {b} from './b.js'; export function a(){return b()}",
    'src/b.ts': "import {a} from './a.js'; export function b(){return a()}",
    'tests/a.test.ts': "import {a} from '../src/a.js'; a();",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/b.ts', "import {a} from './a.js'; export function b(){return a()+1}");
    const result = engine.analyze();
    assert.equal(result.tests[0]?.confidence, 'symbol');
    assert.ok(result.impacted.length < 10);
    assert.ok(result.tests[0].path.edges.length <= 3);
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('source analysis never executes inspected modules', () => {
  const repo = fixture({
    'src/side-effect.ts':
      "import {writeFileSync} from 'node:fs'; writeFileSync('SHOULD_NOT_EXIST','executed'); export const secret=1;",
    '.env': 'PRIVATE_VALUE=do-not-expose',
    'node_modules/untrusted.ts': 'throw new Error("executed")',
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    const result = engine.analyze();
    assert.equal(existsSync(join(repo.root, 'SHOULD_NOT_EXIST')), false);
    assert.equal(result.graph.stats.files, 1);
    assert.throws(() => engine.source('.env'));
    assert.throws(() => engine.source('../../outside.ts'));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('invalid Git revisions are rejected as data rather than command options', () => {
  const repo = fixture({ 'a.ts': 'export const a=1;' });
  const engine = new AnalysisEngine(repo.root);
  try {
    assert.throws(() => engine.analyze('--help'));
    assert.throws(() => engine.analyze('HEAD\n--other'));
    const result = engine.analyze();
    assert.equal(result.changes.length, 0);
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('paths with spaces work in both committed and working snapshots', () => {
  const repo = fixture({
    'src/with space.ts': 'export const value=1;',
    'tests/a.test.ts': "import {value} from '../src/with space.js'; console.log(value)",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/with space.ts', 'export const value=2;');
    assert.equal(engine.analyze().tests[0]?.confidence, 'symbol');
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('syntax errors produce warnings without pretending the graph is complete', () => {
  const repo = fixture({ 'src/a.ts': 'export const value=1;' });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/a.ts', 'export function broken( {');
    const result = engine.analyze();
    assert.ok(result.graph.stats.diagnostics > 0);
    assert.ok(result.warnings.some((w) => w.includes('syntax diagnostics')));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('what-if analysis is read-only and selecting a new symbol does not replace Git changes', () => {
  const repo = fixture({
    'src/a.ts': 'export const value=1;',
    'tests/a.test.ts': "import {value} from '../src/a.js'; console.log(value)",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    const base = engine.analyze();
    const whatIf = engine.impact('symbol:src/a.ts#value');
    assert.equal(base.changes.length, 0);
    assert.equal(whatIf.tests[0]?.confidence, 'symbol');
    assert.equal(engine.analyze().changes.length, 0);
    assert.throws(() => engine.impact('not-real'));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('unbuilt package source metadata produces disclosed module candidates only', () => {
  const repo = fixture({
    'package.json': JSON.stringify({ main: 'dist/index.js', types: 'index.d.ts', source: 'src/index.ts' }),
    'src/index.ts': 'export default function emitter(){return 1;}',
    'test/index_test.ts': "import emitter from '..'; emitter();",
  });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/index.ts', 'export default function emitter(){return 2;}');
    const result = engine.analyze();
    assert.equal(result.tests[0]?.file, 'test/index_test.ts');
    assert.equal(result.tests[0]?.confidence, 'module');
    assert.ok(result.warnings.some((w) => w.includes('source metadata')));
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});

test('Windows checkout line endings do not create false source changes', () => {
  const repo = fixture({ 'src/index.ts': 'export const a = 1;\nexport const b = 2;\n' });
  const engine = new AnalysisEngine(repo.root);
  try {
    repo.write('src/index.ts', 'export const a = 1;\r\nexport const b = 2;\r\n');
    assert.equal(engine.analyze().changes.length, 0);
    repo.write('src/index.ts', 'export const a = 3;\r\nexport const b = 2;\r\n');
    assert.equal(engine.analyze().changedSymbols.length, 1);
  } finally {
    engine.dispose();
    repo.cleanup();
  }
});
