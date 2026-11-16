import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, Code2, FileCode2 } from 'lucide-react';
import { api } from '../api';
import type { GraphNode, ImpactReport, SourceView, TestRecommendation } from '../../../src/core/types';

export default function Inspector({
  report,
  selected,
  path,
  onSelect,
  onExplore,
}: {
  report: ImpactReport;
  selected: string | null;
  path: TestRecommendation | null;
  onSelect: (id: string) => void;
  onExplore: (id: string) => void;
}) {
  const node = report.graph.nodes.find((n) => n.id === selected);
  const [snapshot, setSnapshot] = useState<'base' | 'working'>('working');
  const [source, setSource] = useState<SourceView | null>(null),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!node) return;
    const controller = new AbortController();
    setSource(null);
    setError(null);
    api<SourceView>(
      `/api/source?file=${encodeURIComponent(node.file)}&snapshot=${snapshot}`,
      undefined,
      controller.signal,
    )
      .then(setSource)
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, [node?.file, snapshot, report.id]);
  const lines = source?.content.split('\n') ?? [];
  const start = node?.kind === 'file' ? 0 : Math.max(0, (node?.line ?? 1) - 5);
  const shown = lines.slice(start, Math.min(lines.length, start + 65));
  function pathLabel(node: GraphNode | undefined) {
    return node ? (node.kind === 'file' ? node.file.split('/').at(-1) : node.qualifiedName) : 'Unknown';
  }
  return (
    <aside className="inspector panel">
      <div className="panel-head">
        <div>
          <Code2 size={16} />
          <h2>{path ? 'Why this test?' : 'Source inspector'}</h2>
        </div>
        <span className="badge subtle">READ ONLY</span>
      </div>
      {path && (
        <div className="reason-panel">
          <p className="eyebrow">
            {path.confidence === 'symbol' ? 'COMPILER-RESOLVED PATH' : 'CONSERVATIVE MODULE PATH'}
          </p>
          {path.path.nodes.map((id, index) => {
            const entry = report.graph.nodes.find((n) => n.id === id);
            return (
              <div key={id} className="path-step">
                <button onClick={() => onSelect(id)} className={selected === id ? 'active' : ''}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{pathLabel(entry)}</strong>
                    <small>
                      {entry?.file}:{entry?.line}
                    </small>
                  </div>
                </button>
                {index < path.path.nodes.length - 1 && <ArrowDown size={13} />}
              </div>
            );
          })}
        </div>
      )}
      {node ? (
        <>
          <div className="source-title">
            <span className={`badge ${node.test ? 'green' : 'purple'}`}>{node.kind}</span>
            <h3>{node.kind === 'file' ? node.name : node.qualifiedName}</h3>
            <p>
              <FileCode2 size={12} /> {node.file}:{node.line}
            </p>
            <button className="text-button" onClick={() => onExplore(node.id)}>
              Explore potential impact <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="source-toolbar">
            <span>Source preview</span>
            <div className="segmented">
              <button
                className={snapshot === 'working' ? 'selected' : ''}
                onClick={() => setSnapshot('working')}
              >
                Working
              </button>
              <button className={snapshot === 'base' ? 'selected' : ''} onClick={() => setSnapshot('base')}>
                Baseline
              </button>
            </div>
          </div>
          {error ? (
            <p className="source-error" role="alert">
              {error}. Try the other snapshot for added or deleted files.
            </p>
          ) : !source ? (
            <p className="loading-text">Loading indexed source…</p>
          ) : (
            <div className="source-code" aria-label={`Source of ${node.file}`} tabIndex={0}>
              {shown.map((text, index) => (
                <div
                  key={index}
                  className={
                    node.kind !== 'file' &&
                    start + index + 1 >= node.line &&
                    start + index + 1 <= node.endLine
                      ? 'highlight-line'
                      : ''
                  }
                >
                  <span>{start + index + 1}</span>
                  <code>{text || ' '}</code>
                </div>
              ))}
            </div>
          )}
          <div className="inspector-note">
            <span className="node-dot module" />
            <p>
              Source is read from indexed snapshots. RepoLens never imports or executes the inspected project.
            </p>
          </div>
        </>
      ) : (
        <div className="empty">
          <Code2 size={28} />
          <h3>Follow a dependency</h3>
          <p>Select a graph node or test recommendation to inspect its source and explanation.</p>
        </div>
      )}
    </aside>
  );
}
