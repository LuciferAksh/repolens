import { useEffect, useRef, useState } from 'react';
import type { ImpactReport } from '../../src/core/types';
export interface State {
  report: ImpactReport | null;
  busy: boolean;
  error: string | null;
  watching: boolean;
  baseRef: string;
}
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    signal,
    ...(body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}
export function useWorkspace() {
  const [state, setState] = useState<State>({
    report: null,
    busy: true,
    error: null,
    watching: false,
    baseRef: 'HEAD',
  });
  const [disconnected, setDisconnected] = useState(false);
  const lastId = useRef('');
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<State & { reportId: string }>(
          '/api/state?since=' + encodeURIComponent(lastId.current),
          undefined,
          controller.signal,
        );
        if (!stopped) {
          if (result.report) lastId.current = result.report.id;
          setState((previous) => ({ ...result, report: result.report ?? previous.report }));
          setDisconnected(false);
        }
      } catch (error) {
        if (!stopped && error instanceof Error && error.name !== 'AbortError') setDisconnected(true);
      } finally {
        if (!stopped) timer = setTimeout(poll, 1500);
      }
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return { state, disconnected };
}
