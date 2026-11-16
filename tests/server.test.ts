import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { once } from 'node:events';
import type { ImpactReport } from '../src/core/types.js';
import { fixture } from './helpers.js';

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
test('HTTP flow serves real analysis, source, what-if results, and guarded mutation routes', async (t) => {
  const repo = fixture({
    'src/a.ts': 'export function calculate(){return 1}',
    'tests/a.test.ts': "import {calculate} from '../src/a.js'; calculate()",
  });
  repo.write('src/a.ts', 'export function calculate(){return 2}');
  const port = await availablePort();
  const child = spawn(
    process.execPath,
    [resolve('dist/server/index.js'), '--repo', repo.root, '--port', String(port)],
    { stdio: 'pipe' },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    repo.cleanup();
  });
  const url = `http://127.0.0.1:${port}`;
  let state: { report: ImpactReport; busy: boolean } | undefined;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url + '/api/state');
      state = (await response.json()) as typeof state;
      if (state?.report && !state.busy) break;
    } catch {
      if (child.exitCode !== null) throw new Error(output);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(state?.report, output);
  assert.equal(state.report.tests[0]?.file, 'tests/a.test.ts');
  const initialId = state.report.id;
  const incrementalState = (await (await fetch(url + `/api/state?since=${initialId}`)).json()) as {
    report: unknown;
  };
  assert.equal(incrementalState.report, null, 'Unchanged polling should not retransmit the graph');
  const source = (await (await fetch(url + '/api/source?file=src%2Fa.ts')).json()) as { content: string };
  assert.ok(source.content.includes('return 2'));
  assert.equal((await fetch(url + '/api/source?file=..%2F.env')).status, 404);
  assert.equal((await fetch(url + '/api/no-such-route')).status, 404);
  const post = (path: string, body: unknown, headers?: Record<string, string>) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await post('/api/analyze', {}, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal(
    (
      await fetch(url + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      })
    ).status,
    415,
  );
  assert.equal((await post('/api/analyze', { base: 42 })).status, 422);
  assert.equal(
    (
      await fetch(url + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad',
      })
    ).status,
    400,
  );
  assert.equal((await post('/api/watch', { enabled: false })).status, 200);
  const whatIf = await post('/api/impact', { symbol: 'symbol:src/a.ts#calculate' });
  assert.equal(whatIf.status, 200);
  assert.equal(((await whatIf.json()) as ImpactReport).selectedSeed, 'symbol:src/a.ts#calculate');
  const exported = await fetch(url + '/api/export');
  assert.equal(exported.status, 200);
  assert.ok(exported.headers.get('content-disposition')?.includes('attachment'));
  assert.equal(
    ((await exported.json()) as ImpactReport).selectedSeed,
    undefined,
    'Exploration must not overwrite the working-change report',
  );
  repo.write('src/a.ts', 'export function calculate(){return 3}');
  const analyzed = await post('/api/analyze', { base: 'HEAD' });
  assert.equal(analyzed.status, 200);
  assert.notEqual(((await analyzed.json()) as ImpactReport).id, initialId);
});
