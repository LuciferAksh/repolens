import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Braces,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Download,
  FileCode2,
  Folder,
  GitBranch,
  GitCompareArrows,
  Layers3,
  LoaderCircle,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api, useWorkspace } from './api';
import type { ImpactReport, TestRecommendation } from '../../src/core/types';
import ImpactCanvas from './components/ImpactCanvas';
import Inspector from './components/Inspector';
import TestList from './components/TestList';
import Explorer from './components/Explorer';
import Validation from './components/Validation';

type Tab = 'Impact analysis' | 'Symbol explorer' | 'Validation';
const nav = [
  { title: 'Impact analysis', icon: GitCompareArrows },
  { title: 'Symbol explorer', icon: Braces },
  { title: 'Validation', icon: ShieldCheck },
] as const;
export default function App() {
  const { state, disconnected } = useWorkspace();
  const [tab, setTab] = useState<Tab>('Impact analysis');
  const [exploration, setExploration] = useState<ImpactReport | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [selectedTest, setSelectedTest] = useState<TestRecommendation | null>(null);
  const [base, setBase] = useState('HEAD'),
    [actionError, setActionError] = useState<string | null>(null),
    [submitting, setSubmitting] = useState(false);
  const [fileQuery, setFileQuery] = useState('');
  const [help, setHelp] = useState(false);
  const report = exploration ?? state.report;
  const busy = state.busy || submitting;
  useEffect(() => {
    setExploration(null);
    setSelectedTest(null);
    setSelected(state.report?.changedSymbols[0] ?? null);
  }, [state.report?.id]);
  async function rescan() {
    setSubmitting(true);
    setActionError(null);
    try {
      await api('/api/analyze', { base });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setSubmitting(false);
    }
  }
  async function explore(id: string) {
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await api<ImpactReport>('/api/impact', { symbol: id });
      setExploration(result);
      setSelected(id);
      setSelectedTest(null);
      setTab('Impact analysis');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Symbol exploration failed');
    } finally {
      setSubmitting(false);
    }
  }
  async function toggleWatch() {
    try {
      await api('/api/watch', { enabled: !state.watching });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not change watch state');
    }
  }
  const changes =
    report?.changes.filter((change) => change.file.toLowerCase().includes(fileQuery.toLowerCase())) ?? [];
  const origin = report?.graph.nodes.find((node) => node.id === report.selectedSeed);
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="RepoLens home">
          <span>
            <GitBranch size={23} />
          </span>
          RepoLens<sup>LAB</sup>
        </a>
        <div className="project-card">
          <span className="project-icon">
            <Folder size={17} />
          </span>
          <div>
            <strong>{report?.repository ?? 'Connecting'}</strong>
            <small>TypeScript workspace</small>
          </div>
          <span className="dot green-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav.map(({ title, icon: Icon }) => (
            <button
              key={title}
              className={tab === title ? 'active' : ''}
              onClick={() => setTab(title)}
              aria-current={tab === title ? 'page' : undefined}
            >
              <Icon size={17} />
              <span>{title}</span>
              {title === 'Impact analysis' && report && <b>{report.changes.length}</b>}
            </button>
          ))}
        </nav>
        <div className="files-heading">
          <span>CHANGED FILES</span>
          <span>{report?.changes.length ?? 0}</span>
        </div>
        <label className="file-search">
          <Search size={13} />
          <input
            aria-label="Search changed files"
            placeholder="Find a file…"
            value={fileQuery}
            onChange={(event) => setFileQuery(event.target.value)}
          />
        </label>
        <div className="changed-files">
          {changes.map((change) => (
            <button
              key={change.file}
              className={
                report?.graph.nodes.find((node) => node.id === selected)?.file === change.file
                  ? 'selected'
                  : ''
              }
              onClick={() => {
                setTab('Impact analysis');
                setSelected(`file:${change.file}`);
                setSelectedTest(null);
              }}
            >
              <FileCode2 size={15} />
              <span>
                {change.file.split('/').at(-1)}
                <small>{change.file.split('/').slice(0, -1).join('/')}</small>
              </span>
              <b className={change.status}>{change.status[0].toUpperCase()}</b>
            </button>
          ))}
          {!changes.length && <p>No matching changed files</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="read-only-card">
            <ShieldCheck size={19} />
            <strong>Your code stays yours.</strong>
            <p>
              Local analysis. No uploads.
              <br />
              No inspected code executed.
            </p>
            <button onClick={() => setHelp(true)}>
              How RepoLens works <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="side-profile">
            <span>RL</span>
            <div>
              Local workspace<small>Compiler engine · v0.1</small>
            </div>
            <span className="dot green-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <span>{report?.repository ?? 'RepoLens'}</span>
            <ChevronRight size={13} />
            <strong>{tab}</strong>
          </div>
          <div className="top-actions">
            <span className="environment">
              <span className="dot green-dot" /> Local environment
            </span>
            <button className="icon-button" aria-label="About RepoLens" onClick={() => setHelp(!help)}>
              <CircleHelp size={18} />
            </button>
            <span className="avatar">RL</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="dot purple-dot" /> UNDERSTAND BEFORE YOU SHIP
              </div>
              <h1>{tab === 'Impact analysis' ? 'Change impact' : tab}</h1>
              <p>
                {tab === 'Impact analysis'
                  ? 'Trace dependencies. Inspect the evidence. Review with context.'
                  : tab === 'Symbol explorer'
                    ? 'Explore the potential impact of a function, type, or class.'
                    : 'Evidence from executed tests, with the limits in plain sight.'}
              </p>
            </div>
            <div className="heading-buttons">
              <a className="button secondary" href="/api/export" download>
                <Download size={14} /> Export report
              </a>
              <button className="button primary" disabled={busy} onClick={() => void rescan()}>
                {busy ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{' '}
                {busy ? 'Analysing…' : 'Analyse changes'}
              </button>
            </div>
          </div>
          {(disconnected || state.error || actionError) && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={17} />
              <span>
                {actionError ??
                  state.error ??
                  'Connection interrupted. Reconnecting to the local analysis server…'}
              </span>
              {actionError && (
                <button
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => setActionError(null)}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {help && (
            <div className="help-panel panel">
              <div className="panel-head">
                <div>
                  <Terminal size={17} />
                  <h2>A read-only view of your repository</h2>
                </div>
                <button className="icon-button" aria-label="Close help" onClick={() => setHelp(false)}>
                  <X size={16} />
                </button>
              </div>
              <p>
                RepoLens compares committed TypeScript/JavaScript source with your working tree. The
                TypeScript compiler resolves symbol references; reverse graph traversal follows potential
                impact to callers and tests. Dashed module paths provide a conservative fallback.
              </p>
              <code>npm start -- --repo "C:\path\to\repository" --base HEAD</code>
              <p>
                Inherited tsconfig options, dynamic dispatch, nonliteral imports, external packages, and
                runtime configuration can limit coverage. Recommendations never guarantee that unlisted tests
                can be skipped.
              </p>
            </div>
          )}
          <div className="comparison-toolbar">
            <div className="comparison">
              <GitBranch size={14} />
              <label htmlFor="base-ref">Compare</label>
              <input
                id="base-ref"
                aria-label="Base Git revision"
                value={base}
                onChange={(event) => setBase(event.target.value)}
              />
              <ArrowRight size={13} />
              <span>Working tree</span>
              <span className="badge subtle">{report?.base.slice(0, 7) ?? '…'}</span>
            </div>
            <button
              className={`watch-button ${state.watching ? 'watching' : ''}`}
              onClick={() => void toggleWatch()}
            >
              <Radio size={13} />
              <span>{state.watching ? 'Watching for changes' : 'Watch paused'}</span>
              <span className={`toggle ${state.watching ? 'on' : ''}`} />
            </button>
          </div>
          {report ? (
            <>
              {tab === 'Impact analysis' && (
                <>
                  {exploration && (
                    <div className="exploration-banner">
                      <Code2 size={17} />
                      <strong>Potential impact: {origin?.qualifiedName}</strong>
                      <span>No repository files were changed.</span>
                      <button
                        onClick={() => {
                          setExploration(null);
                          setSelectedTest(null);
                          setSelected(state.report?.changedSymbols[0] ?? null);
                        }}
                      >
                        <ArrowLeft size={13} /> Return to Git changes
                      </button>
                    </div>
                  )}
                  <div className="metrics">
                    <Metric
                      title={exploration ? 'Selected origin' : 'Changed symbols'}
                      value={exploration ? '1' : String(report.changedSymbols.length)}
                      icon={<Braces size={17} />}
                      footer={`${report.changes.length} modified, added, or deleted source files`}
                      color="amber"
                    />
                    <Metric
                      title="Affected modules"
                      value={String(report.stats.impactedFiles)}
                      icon={<Layers3 size={17} />}
                      footer="Reachable through static dependency paths"
                      color="purple"
                    />
                    <Metric
                      title="Candidate test files"
                      value={`${report.tests.length}`}
                      suffix={` / ${report.stats.totalTests}`}
                      icon={<CheckCheck size={17} />}
                      footer="Ranked by the strength of their evidence"
                      color="green"
                    />
                    <Metric
                      title="Analysis time"
                      value={String(report.stats.elapsedMs)}
                      suffix=" ms"
                      icon={<Activity size={17} />}
                      footer={`${report.stats.reusedFiles} reused · ${report.stats.indexedFiles} reindexed files`}
                      color="blue"
                    />
                  </div>
                  <div className="analysis-layout">
                    <div className="analysis-primary">
                      <ImpactCanvas
                        report={report}
                        selectedPath={selectedTest}
                        onSelect={(id) => {
                          setSelected(id);
                          setSelectedTest(null);
                        }}
                      />
                      <TestList
                        report={report}
                        selected={selectedTest}
                        onSelect={(test) => {
                          setSelectedTest(test);
                          setSelected(test.path.seed);
                        }}
                      />
                    </div>
                    <Inspector
                      report={report}
                      selected={selected}
                      path={selectedTest}
                      onSelect={setSelected}
                      onExplore={(id) => void explore(id)}
                    />
                  </div>
                  <div className="limits-note">
                    <ShieldCheck size={16} />
                    <p>{report.scope}</p>
                    <span>
                      {report.graph.stats.files} files · {report.graph.stats.symbols} symbols ·{' '}
                      {report.graph.stats.edges} edges
                    </span>
                  </div>
                  <details className="warnings">
                    <summary>
                      <TriangleAlert size={13} /> Analysis notes <span>{report.warnings.length}</span>
                      <ChevronDown size={13} />
                    </summary>
                    {report.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </details>
                </>
              )}
              {tab === 'Symbol explorer' && <Explorer report={report} onExplore={(id) => void explore(id)} />}
              {tab === 'Validation' && <Validation />}
            </>
          ) : (
            <div className="initial-loading panel">
              <LoaderCircle className="spin" size={30} />
              <h2>Building your dependency graph</h2>
              <p>Reading Git snapshots and resolving TypeScript symbols. Inspected code is not executed.</p>
            </div>
          )}
          <footer>
            <span>
              <GitBranch size={13} /> RepoLens <b>v0.1.0</b>
            </span>
            <span>Static evidence. Explainable impact.</span>
            <span>
              <span className={`dot ${disconnected ? 'amber-dot' : 'green-dot'}`} />
              {disconnected ? 'Server disconnected' : busy ? 'Analysis running' : 'Workspace connected'}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  suffix,
  icon,
  footer,
  color,
}: {
  title: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
  footer: string;
  color: string;
}) {
  return (
    <article className="metric">
      <div>
        <span>{title}</span>
        <span className={`metric-icon ${color}`}>{icon}</span>
      </div>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
      <p>{footer}</p>
    </article>
  );
}
