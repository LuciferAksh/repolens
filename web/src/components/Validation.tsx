import { useEffect, useState } from 'react';
import { Check, FlaskConical, ShieldCheck, Terminal, TriangleAlert } from 'lucide-react';
import { api } from '../api';

interface Evaluation {
  generatedAt: string;
  fixture: string;
  baseline: { file: string; passed: boolean }[];
  working: { file: string; passed: boolean }[];
  failed: string[];
  selected: string[];
  missed: string[];
  observedFailureRecall: number;
  selectionRatio: number;
  incremental: { reusedFiles: number; indexedFiles: number; elapsedMs: number };
  scope: string;
}
export default function Validation() {
  const [data, setData] = useState<Evaluation | null>(null),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<Evaluation | null>('/api/validation', undefined, controller.signal)
      .then(setData)
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <>
      <div className="callout">
        <ShieldCheck size={23} />
        <div>
          <strong>Measure against observed behavior.</strong>
          <p>
            Recommendations are compared with executed tests in an owned fixture. Production test-selection
            accuracy has not been established.
          </p>
        </div>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {data ? (
        <>
          <div className="validation-stats">
            <article>
              <span>Observed failures recalled</span>
              <strong>
                {data.failed.length - data.missed.length} / {data.failed.length}
              </strong>
              <p>One controlled pricing mutation</p>
            </article>
            <article>
              <span>Candidate test files</span>
              <strong>
                {data.selected.length} / {data.baseline.length}
              </strong>
              <p>{Math.round(data.selectionRatio * 100)}% of the fixture's test files</p>
            </article>
            <article>
              <span>Unchanged rescan</span>
              <strong>
                {data.incremental.elapsedMs} <small>ms</small>
              </strong>
              <p>
                {data.incremental.reusedFiles} reused · {data.incremental.indexedFiles} reindexed
              </p>
            </article>
          </div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <FlaskConical size={17} />
                <h2>Observed test outcomes</h2>
              </div>
              <span className="small-muted">Generated {new Date(data.generatedAt).toLocaleString()}</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Test file</th>
                    <th>Baseline</th>
                    <th>Changed version</th>
                    <th>Selected</th>
                  </tr>
                </thead>
                <tbody>
                  {data.baseline.map((row) => {
                    const working = data.working.find((test) => test.file === row.file);
                    return (
                      <tr key={row.file}>
                        <td className="mono">{row.file}</td>
                        <td>
                          <span className="badge green">
                            <Check size={11} /> Passed
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${working?.passed ? 'green' : 'amber'}`}>
                            {working?.passed ? 'Passed' : 'Failed'}
                          </span>
                        </td>
                        <td>
                          {data.selected.includes(row.file) ? (
                            <span className="badge purple">Recommended</span>
                          ) : (
                            <span className="muted">No static path</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <div className="validation-scope">
            <TriangleAlert size={16} />
            <p>{data.scope}</p>
          </div>
        </>
      ) : (
        <section className="panel">
          <div className="empty">
            <Terminal size={30} />
            <h3>No evaluation report yet</h3>
            <p>
              Run <code>npm run verify</code> in RepoLens, then reopen this view. It executes only the bundled
              owned fixture, never a repository you are inspecting.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
