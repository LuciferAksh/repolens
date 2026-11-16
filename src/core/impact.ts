import type { FileChange, Graph, GraphEdge, ImpactedNode, ReasonPath, TestRecommendation } from './types.js';

const moduleKinds = new Set(['import', 're-export', 'dynamic-import']);
export function mergeGraphs(base: Graph, working: Graph): Graph {
  const nodes = new Map([...base.nodes, ...working.nodes].map((node) => [node.id, node]));
  const edges = new Map<string, GraphEdge>();
  for (const edge of base.edges) edges.set(edge.id, { ...edge, snapshot: 'base' });
  for (const edge of working.edges)
    edges.set(edge.id, { ...edge, snapshot: edges.has(edge.id) ? 'both' : 'working' });
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    stats: working.stats,
    warnings: [...new Set([...base.warnings, ...working.warnings])],
  };
}

function reverseReach(graph: Graph, seeds: string[], modules: boolean): Map<string, ReasonPath> {
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    if (moduleKinds.has(edge.kind) !== modules) continue;
    const list = incoming.get(edge.target) ?? [];
    list.push(edge);
    incoming.set(edge.target, list);
  }
  const paths = new Map<string, ReasonPath>();
  const queue = [...new Set(seeds)];
  for (const seed of queue) paths.set(seed, { seed, nodes: [seed], edges: [] });
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index],
      path = paths.get(id)!;
    for (const edge of incoming.get(id) ?? []) {
      if (paths.has(edge.source)) continue;
      paths.set(edge.source, {
        seed: path.seed,
        nodes: [...path.nodes, edge.source],
        edges: [...path.edges, edge.id],
      });
      queue.push(edge.source);
    }
  }
  return paths;
}

export function calculateImpact(
  graph: Graph,
  changes: FileChange[],
  changedSymbols: string[],
  currentFiles: Set<string>,
  selectedSeed?: string,
) {
  const lookup = new Map(graph.nodes.map((node) => [node.id, node]));
  const semanticSeeds = selectedSeed ? [selectedSeed] : changedSymbols;
  const selectedFile = selectedSeed && lookup.get(selectedSeed)?.file;
  const moduleSeeds = selectedFile
    ? [`file:${selectedFile}`]
    : changes.map((change) => `file:${change.file}`);
  const semantic = reverseReach(graph, semanticSeeds, false);
  const modules = reverseReach(graph, moduleSeeds, true);
  const impacted: ImpactedNode[] = [];
  for (const [id, path] of semantic)
    impacted.push({ id, path, distance: path.edges.length, confidence: 'symbol' });
  for (const [id, path] of modules)
    if (!semantic.has(id)) impacted.push({ id, path, distance: path.edges.length, confidence: 'module' });
  const recommendations = new Map<string, TestRecommendation>();
  for (const item of impacted) {
    const node = lookup.get(item.id);
    if (!node?.test || !currentFiles.has(node.file)) continue;
    const existing = recommendations.get(node.file);
    const candidate: TestRecommendation = {
      file: node.file,
      confidence: item.confidence,
      distance: item.distance,
      path: item.path,
      reason:
        item.confidence === 'symbol'
          ? `Compiler-resolved dependency path (${item.distance} ${item.distance === 1 ? 'step' : 'steps'})`
          : `Conservative import path (${item.distance} ${item.distance === 1 ? 'step' : 'steps'}); runtime relevance is unproven`,
    };
    if (
      !existing ||
      (candidate.confidence === 'symbol' && existing.confidence === 'module') ||
      (candidate.confidence === existing.confidence && candidate.distance < existing.distance)
    )
      recommendations.set(node.file, candidate);
  }
  const tests = [...recommendations.values()].sort(
    (a, b) =>
      Number(a.confidence !== 'symbol') - Number(b.confidence !== 'symbol') ||
      a.distance - b.distance ||
      a.file.localeCompare(b.file),
  );
  return { impacted: impacted.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)), tests };
}
