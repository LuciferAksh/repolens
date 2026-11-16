#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AnalysisEngine } from './core/engine.js';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      repo: { type: 'string', default: '.' },
      base: { type: 'string', default: 'HEAD' },
      json: { type: 'boolean', default: false },
      out: { type: 'string' },
      symbol: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'RepoLens\n\nnode dist/cli.js analyze --repo <directory> --base HEAD [--json] [--out report.json]\nnode dist/cli.js analyze --repo <directory> --symbol "symbol:src/file.ts#name"\n\nRead-only static analysis. Does not execute tests or inspected code.',
    );
  } else {
    if (positionals.length && positionals[0] !== 'analyze')
      throw new Error('Expected the analyze command; use --help');
    const engine = new AnalysisEngine(values.repo!);
    try {
      let report = engine.analyze(values.base);
      if (values.symbol) report = engine.impact(values.symbol);
      const json = JSON.stringify(report, null, 2) + '\n';
      if (values.out) writeFileSync(resolve(values.out), json, 'utf8');
      if (values.json) process.stdout.write(json);
      else {
        console.log(`\nRepoLens · ${report.repository}\nBase ${report.base.slice(0, 10)} → working tree\n`);
        console.log(
          `${report.changes.length} changed files · ${report.changedSymbols.length} changed symbols · ${report.tests.length}/${report.stats.totalTests} candidate test files\n`,
        );
        for (const test of report.tests)
          console.log(
            `  ${test.confidence === 'symbol' ? 'SYMBOL' : 'MODULE'}  ${test.file}\n          ${test.reason}`,
          );
        console.log(
          `\nIndexed ${report.graph.stats.files} files in ${report.stats.elapsedMs} ms.\n${report.scope}`,
        );
        for (const warning of report.warnings) console.log(`\nNote: ${warning}`);
      }
    } finally {
      engine.dispose();
    }
  }
} catch (error) {
  console.error(`RepoLens: ${error instanceof Error ? error.message : 'Analysis failed'}`);
  process.exitCode = 1;
}
