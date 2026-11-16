import { useState } from 'react';
import { ArrowUpRight, Code2, Search } from 'lucide-react';
import type { ImpactReport } from '../../../src/core/types';

export default function Explorer({
  report,
  onExplore,
}: {
  report: ImpactReport;
  onExplore: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [limit, setLimit] = useState(60);
  const nodes = report.graph.nodes.filter(
    (node) =>
      node.kind !== 'file' &&
      `${node.qualifiedName} ${node.file}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <Code2 size={17} />
          <h2>Indexed symbols</h2>
          <span className="count">{report.graph.stats.symbols}</span>
        </div>
        <span className="small-muted">Explore impact without editing a file</span>
      </div>
      <div className="explorer-search">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search indexed symbols"
            placeholder="Search functions, types, or file paths…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(60);
            }}
          />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Kind</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {nodes.slice(0, limit).map((node) => (
              <tr key={node.id}>
                <td>
                  <strong className="mono">{node.qualifiedName}</strong>
                  {node.exported && <span className="export-badge">export</span>}
                </td>
                <td>
                  <span className="badge subtle">{node.kind}</span>
                </td>
                <td className="mono muted">
                  {node.file}:{node.line}
                </td>
                <td>
                  <button className="text-button" onClick={() => onExplore(node.id)}>
                    Explore <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!nodes.length && (
        <div className="empty">
          <h3>No matching symbols</h3>
          <p>Try a function name or a repository-relative file path.</p>
        </div>
      )}
      {nodes.length > limit && (
        <button className="load-more" onClick={() => setLimit((value) => value + 60)}>
          Show more ({nodes.length - limit} remaining)
        </button>
      )}
    </section>
  );
}
