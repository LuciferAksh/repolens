import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import {
  commitSnapshot,
  git,
  isSource,
  repositoryRoot,
  resolveCommit,
  workingSnapshot,
  type Snapshot,
} from './git.js';
import { ProjectIndex } from './indexer.js';
import { calculateImpact, mergeGraphs } from './impact.js';
import type { FileChange, Graph, ImpactReport, SourceView } from './types.js';

export class AnalysisEngine {
  readonly root: string;
  private working: ProjectIndex;
  private base: ProjectIndex;
  private baseCommit?: string;
  private baseSnapshot?: Snapshot;
  private baseGraph?: Graph;
  private current?: Snapshot;
  private report?: ImpactReport;
  constructor(root: string) {
    this.root = repositoryRoot(root);
    this.working = new ProjectIndex(this.root);
    this.base = new ProjectIndex(this.root);
  }

  analyze(ref = 'HEAD'): ImpactReport {
    const start = performance.now();
    const commit = resolveCommit(this.root, ref);
    const baselineCached = this.baseCommit === commit && !!this.baseGraph;
    if (!baselineCached) {
      this.baseSnapshot = commitSnapshot(this.root, commit);
      this.baseGraph = this.base.update(this.baseSnapshot);
      this.baseCommit = commit;
    }
    this.current = workingSnapshot(this.root);
    const working = this.working.update(this.current);
    const changes: FileChange[] = [];
    for (const file of new Set([...this.baseSnapshot!.files.keys(), ...this.current.files.keys()])) {
      if (!isSource(file)) continue;
      const before = this.baseSnapshot!.files.get(file),
        after = this.current.files.get(file);
      if (before !== after)
        changes.push({
          file,
          status: before === undefined ? 'added' : after === undefined ? 'deleted' : 'modified',
        });
    }
    changes.sort((a, b) => a.file.localeCompare(b.file));
    const changedFiles = new Set(changes.map((change) => change.file));
    const beforeNodes = new Map(this.baseGraph!.nodes.map((node) => [node.id, node]));
    const afterNodes = new Map(working.nodes.map((node) => [node.id, node]));
    const changedSymbols = [...new Set([...beforeNodes.keys(), ...afterNodes.keys()])]
      .filter((id) => {
        const before = beforeNodes.get(id),
          after = afterNodes.get(id),
          node = after ?? before!;
        return node.kind !== 'file' && changedFiles.has(node.file) && before?.hash !== after?.hash;
      })
      .sort();
    const graph = mergeGraphs(this.baseGraph!, working);
    const impact = calculateImpact(graph, changes, changedSymbols, new Set(this.current.files.keys()));
    const warnings = [...graph.warnings];
    if (changes.length && !changedSymbols.length)
      warnings.push(
        'Changed source has no changed named declaration; only conservative module paths are available',
      );
    if (this.baseSnapshot!.files.get('tsconfig.json') !== this.current.files.get('tsconfig.json'))
      warnings.push(
        'Root compiler configuration changed. Run the full test suite; module impact is not sufficient for configuration changes.',
      );
    this.report = {
      id: randomUUID(),
      generatedAt: new Date().toISOString(),
      repository: basename(this.root),
      base: commit,
      head: git(this.root, ['rev-parse', 'HEAD']).toString().trim(),
      graph,
      changes,
      changedSymbols,
      ...impact,
      warnings: [...new Set(warnings)],
      stats: {
        elapsedMs: +(performance.now() - start).toFixed(2),
        baselineCached,
        changedFiles: changes.length,
        impactedFiles: new Set(
          impact.impacted
            .map((item) => graph.nodes.find((node) => node.id === item.id)?.file)
            .filter(Boolean),
        ).size,
        testFiles: impact.tests.length,
        totalTests: working.nodes.filter((node) => node.kind === 'file' && node.test).length,
        indexedFiles: working.stats.indexedFiles,
        reusedFiles: working.stats.reusedFiles,
      },
      scope:
        'Test-file recommendations from static references and imports. No inspected code is executed. This does not guarantee that omitted tests are safe to skip.',
    };
    return this.report;
  }

  impact(symbolId: string): ImpactReport {
    if (!this.report || !this.current) throw new Error('Analyze a repository first');
    if (!this.report.graph.nodes.some((node) => node.id === symbolId)) throw new Error('Symbol not found');
    const result = calculateImpact(
      this.report.graph,
      this.report.changes,
      this.report.changedSymbols,
      new Set(this.current.files.keys()),
      symbolId,
    );
    return {
      ...this.report,
      ...result,
      selectedSeed: symbolId,
      stats: {
        ...this.report.stats,
        testFiles: result.tests.length,
        impactedFiles: new Set(
          result.impacted
            .map((item) => this.report!.graph.nodes.find((node) => node.id === item.id)?.file)
            .filter(Boolean),
        ).size,
      },
    };
  }

  source(file: string, snapshot: 'base' | 'working' = 'working'): SourceView {
    const content = (snapshot === 'base' ? this.baseSnapshot : this.current)?.files.get(file);
    if (content === undefined || !isSource(file)) throw new Error('Indexed source file not found');
    return { file, content, snapshot };
  }
  dispose() {
    this.working.dispose();
    this.base.dispose();
  }
}
