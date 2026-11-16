import { parentPort, workerData } from 'node:worker_threads';
import { AnalysisEngine } from '../core/engine.js';

const engine = new AnalysisEngine(workerData.root as string);
parentPort!.on(
  'message',
  (message: { id: number; action: string; value?: string; snapshot?: 'base' | 'working' }) => {
    try {
      let result;
      if (message.action === 'analyze') result = engine.analyze(message.value ?? 'HEAD');
      else if (message.action === 'impact') result = engine.impact(message.value!);
      else if (message.action === 'source') result = engine.source(message.value!, message.snapshot);
      else throw new Error('Unsupported worker action');
      parentPort!.postMessage({ id: message.id, result });
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : 'Analysis failed',
      });
    }
  },
);
