import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, watch } from 'node:fs';
import { inside, repositoryRoot } from '../core/git.js';
import type { ImpactReport } from '../core/types.js';

const { values } = parseArgs({
  options: {
    repo: { type: 'string', default: 'data/demo' },
    base: { type: 'string', default: 'HEAD' },
    port: { type: 'string', default: '4300' },
  },
});
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = repositoryRoot(resolve(values.repo!));
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Use a port between 1024 and 65535');
const worker = new Worker(new URL('./worker.js', import.meta.url), {
  workerData: { root },
  resourceLimits: { maxOldGenerationSizeMb: 768 },
});
let alive = true,
  closing = false;
let sequence = 0,
  latest: ImpactReport | undefined,
  failure: string | undefined,
  busy = false,
  watching = true,
  dirty = false;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
>();
worker.on('message', (message) => {
  const request = pending.get(message.id);
  if (!request) return;
  clearTimeout(request.timer);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error));
  else request.resolve(message.result);
});
worker.on('error', (error) => {
  failure = error.message;
  busy = false;
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(error);
  }
  pending.clear();
});
worker.on('exit', () => {
  alive = false;
  busy = false;
  if (!closing) failure ??= 'Analysis worker stopped. Restart RepoLens to continue.';
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error(failure ?? 'Server stopped'));
  }
  pending.clear();
});
function request<T>(action: string, value?: string, snapshot?: string): Promise<T> {
  if (!alive) return Promise.reject(new Error('Analysis worker is unavailable. Restart RepoLens.'));
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      failure = 'Analysis timed out after 45 seconds. Restart RepoLens.';
      void worker.terminate();
      reject(new Error(failure));
    }, 45_000);
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    worker.postMessage({ id, action, value, snapshot });
  });
}
async function analyze(base = values.base!) {
  if (busy) throw new Error('An analysis is already running');
  busy = true;
  failure = undefined;
  try {
    latest = await request<ImpactReport>('analyze', base);
    values.base = base;
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Analysis failed';
    throw error;
  } finally {
    busy = false;
    if (dirty && watching) {
      dirty = false;
      setTimeout(() => {
        void analyze().catch(() => {});
      }, 50);
    }
  }
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const host = req.headers.host ?? '';
    const hostname = new URL(`http://${host}`).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) {
      json(403, { error: 'Only loopback hosts are accepted' });
      return;
    }
    const origin = req.headers.origin;
    if (origin && ![`http://${host}`, 'http://127.0.0.1:5174', 'http://localhost:5174'].includes(origin)) {
      json(403, { error: 'Cross-origin access rejected' });
      return;
    }
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (req.method === 'GET' && url.pathname === '/api/state') {
      json(200, {
        report: latest && url.searchParams.get('since') !== latest.id ? latest : null,
        reportId: latest?.id ?? null,
        busy,
        error: failure ?? null,
        watching,
        baseRef: values.base,
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/source') {
      const file = url.searchParams.get('file');
      if (!file) {
        json(400, { error: 'An indexed file is required' });
        return;
      }
      const snapshot = url.searchParams.get('snapshot') === 'base' ? 'base' : 'working';
      try {
        json(200, await request('source', file, snapshot));
      } catch {
        json(404, { error: 'Indexed source file not found' });
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/export') {
      if (!latest) {
        json(409, { error: 'Analysis is not ready' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="repolens-impact.json"',
      });
      res.end(JSON.stringify(latest, null, 2));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/validation') {
      const path = resolve(projectRoot, 'data/validation.json');
      json(200, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
      return;
    }
    if (req.method === 'POST' && ['/api/analyze', '/api/impact', '/api/watch'].includes(url.pathname)) {
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        json(415, { error: 'Expected application/json' });
        return;
      }
      let bytes = 0,
        body = '';
      for await (const chunk of req) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 8192) {
          json(413, { error: 'Request exceeds 8 KiB' });
          return;
        }
        body += chunk.toString();
      }
      let payload: Record<string, unknown>;
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        payload = parsed;
      } catch {
        json(400, { error: 'Invalid JSON object' });
        return;
      }
      if (busy) {
        json(409, { error: 'An analysis is already running' });
        return;
      }
      try {
        if (url.pathname === '/api/analyze') {
          if (payload.base !== undefined && (typeof payload.base !== 'string' || payload.base.length > 200)) {
            json(422, { error: 'Invalid base revision' });
            return;
          }
          await analyze(payload.base as string | undefined);
          json(200, latest);
        } else if (url.pathname === '/api/impact') {
          if (typeof payload.symbol !== 'string' || payload.symbol.length > 2000) {
            json(422, { error: 'A symbol ID is required' });
            return;
          }
          json(200, await request('impact', payload.symbol));
        } else {
          if (typeof payload.enabled !== 'boolean') {
            json(422, { error: 'enabled must be boolean' });
            return;
          }
          watching = payload.enabled;
          json(200, { watching });
        }
      } catch (error) {
        json(422, { error: error instanceof Error ? error.message : 'Analysis failed' });
      }
      return;
    }
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      const dist = resolve(projectRoot, 'web/dist');
      const path =
        url.pathname === '/'
          ? resolve(dist, 'index.html')
          : resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (!inside(dist, path) || !existsSync(path) || !contentTypes[extname(path)]) {
        json(404, { error: 'Asset not found' });
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypes[extname(path)] });
      res.end(readFileSync(path));
      return;
    }
    json(404, { error: 'Route not found' });
  } catch {
    if (!res.headersSent) json(400, { error: 'Request could not be processed' });
    else res.end();
  }
});
server.on('error', (error) => {
  console.error(error.message);
  stop();
  process.exitCode = 1;
});
let debounce: NodeJS.Timeout | undefined;
const watcher = watch(root, { recursive: true }, (_event, file) => {
  if (!watching || !file || /(?:^|[\\/])(?:node_modules|\.git|dist|coverage)(?:[\\/]|$)/.test(file)) return;
  if (!/\.(?:[cm]?[jt]sx?|json)$/.test(file)) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (busy) dirty = true;
    else void analyze().catch(() => {});
  }, 650);
});
function stop() {
  closing = true;
  watching = false;
  dirty = false;
  clearTimeout(debounce);
  watcher.close();
  server.close();
  server.closeAllConnections();
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error('Server stopped'));
  }
  pending.clear();
  void worker.terminate();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.listen(port, '127.0.0.1', () => {
  console.log(
    `RepoLens: http://127.0.0.1:${port}\nRepository: ${root}\nRead-only analysis. Ctrl+C stops the server.`,
  );
  void analyze().catch(() => {});
});
