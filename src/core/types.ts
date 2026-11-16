export type NodeKind = 'file' | 'function' | 'class' | 'method' | 'value' | 'type' | 'interface';
export type Relation = 'call' | 'reference' | 'type' | 'import' | 're-export' | 'dynamic-import';
export interface GraphNode {
  id: string;
  name: string;
  qualifiedName: string;
  file: string;
  kind: NodeKind;
  line: number;
  endLine: number;
  hash: string;
  exported: boolean;
  test: boolean;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: Relation;
  file: string;
  line: number;
  snapshot?: 'base' | 'working' | 'both';
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: string[];
  stats: {
    files: number;
    symbols: number;
    edges: number;
    reusedFiles: number;
    indexedFiles: number;
    buildMs: number;
    diagnostics: number;
  };
}
export interface FileChange {
  file: string;
  status: 'added' | 'modified' | 'deleted';
}
export interface ReasonPath {
  seed: string;
  nodes: string[];
  edges: string[];
}
export interface ImpactedNode {
  id: string;
  distance: number;
  confidence: 'symbol' | 'module';
  path: ReasonPath;
}
export interface TestRecommendation {
  file: string;
  confidence: 'symbol' | 'module';
  distance: number;
  reason: string;
  path: ReasonPath;
}
export interface ImpactReport {
  id: string;
  generatedAt: string;
  repository: string;
  base: string;
  head: string;
  graph: Graph;
  changes: FileChange[];
  changedSymbols: string[];
  impacted: ImpactedNode[];
  tests: TestRecommendation[];
  warnings: string[];
  stats: {
    elapsedMs: number;
    baselineCached: boolean;
    changedFiles: number;
    impactedFiles: number;
    testFiles: number;
    totalTests: number;
    indexedFiles: number;
    reusedFiles: number;
  };
  scope: string;
  selectedSeed?: string;
}
export interface SourceView {
  file: string;
  content: string;
  snapshot: 'base' | 'working';
}
