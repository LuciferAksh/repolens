import { useState } from 'react';
import { ArrowRight, CheckCheck, Search, FlaskConical } from 'lucide-react';
import type { ImpactReport, TestRecommendation } from '../../../src/core/types';

export default function TestList({
  report,
  selected,
  onSelect,
}: {
  report: ImpactReport;
  selected: TestRecommendation | null;
  onSelect: (value: TestRecommendation) => void;
}) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all');
  const rows = report.tests.filter(
    (test) =>
      test.file.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || test.confidence === filter),
  );
  return (
    <section className="panel tests-panel">
      <div className="panel-head">
        <div>
          <CheckCheck size={17} />
          <h2>Recommended test files</h2>
          <span className="count">{report.tests.length}</span>
        </div>
        <span className="small-muted">Suggestions, never a safe-to-skip guarantee</span>
      </div>
      <div className="test-toolbar">
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search recommended tests"
            placeholder="Filter test files…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter test evidence"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All evidence</option>
          <option value="symbol">Symbol paths</option>
          <option value="module">Module fallback</option>
        </select>
      </div>
      {rows.length ? (
        <div className="test-rows">
          {rows.map((test) => (
            <button
              key={test.file}
              className={`test-row ${selected?.file === test.file ? 'active' : ''}`}
              onClick={() => onSelect(test)}
            >
              <span className="test-icon">
                <FlaskConical size={17} />
              </span>
              <span className="test-description">
                <strong>{test.file}</strong>
                <small>{test.reason}</small>
              </span>
              <span className={`badge ${test.confidence === 'symbol' ? 'purple' : 'amber'}`}>
                {test.confidence === 'symbol' ? 'Symbol path' : 'Conservative'}
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <FlaskConical size={25} />
          <h3>No matching test candidates</h3>
          <p>
            This means no static path was found under the current filters. It does not prove that tests are
            unnecessary.
          </p>
        </div>
      )}
      <div className="test-list-footer">
        <span>
          {report.tests.filter((t) => t.confidence === 'symbol').length} symbol paths ·{' '}
          {report.tests.filter((t) => t.confidence === 'module').length} conservative candidates
        </span>
        <span>
          Click a test to inspect its path <ArrowRight size={12} />
        </span>
      </div>
    </section>
  );
}
