import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react';
import { GitBranch, Layers3, Maximize2 } from 'lucide-react';
import type { ImpactReport, TestRecommendation } from '../../../src/core/types';

export default function ImpactCanvas({
  report,
  selectedPath,
  onSelect,
}: {
  report: ImpactReport;
  selectedPath: TestRecommendation | null;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<'files' | 'symbols'>('files');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [fitKey, setFitKey] = useState(0);
  const lookup = useMemo(() => new Map(report.graph.nodes.map((node) => [node.id, node])), [report.graph]);
  const layout = useMemo(() => {
    const changedFiles = new Set(report.changes.map((c) => c.file));
    const seedIds = new Set(report.selectedSeed ? [report.selectedSeed] : report.changedSymbols);
    const items = new Map<string, { id: string; distance: number; confidence: string }>();
    for (const item of report.impacted) {
      const node = lookup.get(item.id);
      if (!node) continue;
      if (mode === 'symbols' && node.kind === 'file' && !node.test) continue;
      const id = mode === 'files' ? `file:${node.file}` : node.id;
      const previous = items.get(id);
      if (
        !previous ||
        item.distance < previous.distance ||
        (previous.confidence !== 'symbol' && item.confidence === 'symbol')
      )
        items.set(id, {
          id,
          distance: changedFiles.has(node.file) && mode === 'files' ? 0 : item.distance,
          confidence: item.confidence,
        });
    }
    // No changes: keep the empty graph intentional, not a fabricated dependency map.
    const visible = [...items.values()]
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
      .slice(0, 80);
    const visibleIds = new Set(visible.map((item) => item.id));
    const pathIds = new Set(
      selectedPath?.path.nodes.map((id) => (mode === 'files' ? `file:${lookup.get(id)?.file}` : id)),
    );
    const pathPairs = new Set<string>();
    const sequence = [...(selectedPath?.path.nodes ?? [])].map((id) =>
      mode === 'files' ? `file:${lookup.get(id)?.file}` : id,
    );
    for (let i = 1; i < sequence.length; i++) pathPairs.add(`${sequence[i - 1]}|${sequence[i]}`);
    const counts = new Map<number, number>();
    const flowNodes: Node[] = visible.map((item) => {
      const node = lookup.get(item.id)!;
      const row = counts.get(item.distance) ?? 0;
      counts.set(item.distance, row + 1);
      const changed =
        mode === 'files'
          ? changedFiles.has(node.file) ||
            (report.selectedSeed && lookup.get(report.selectedSeed)?.file === node.file)
          : seedIds.has(node.id);
      return {
        id: item.id,
        position: { x: item.distance * 268, y: row * 112 },
        data: {
          label: (
            <div className="graph-card">
              <div>
                <span className={`node-dot ${changed ? 'changed' : node.test ? 'test' : 'module'}`} />
                <span className="node-category">
                  {changed
                    ? 'CHANGE ORIGIN'
                    : node.test
                      ? 'TEST FILE'
                      : mode === 'files'
                        ? 'DEPENDENT MODULE'
                        : node.kind.toUpperCase()}
                </span>
              </div>
              <strong>{mode === 'files' ? node.file.split('/').at(-1) : node.qualifiedName}</strong>
              <small>
                {mode === 'files'
                  ? node.file.split('/').slice(0, -1).join('/') + '/'
                  : `${node.file}:${node.line}`}
              </small>
            </div>
          ),
        },
        className: `impact-node ${changed ? 'origin' : node.test ? 'test-node' : ''} ${pathIds.has(item.id) ? 'on-path' : ''}`,
        style: { width: 212, opacity: selectedPath && !pathIds.has(item.id) ? 0.4 : 1 },
      };
    });
    const flowEdges = new Map<string, Edge>();
    for (const edge of report.graph.edges) {
      const source = mode === 'files' ? `file:${lookup.get(edge.target)?.file}` : edge.target;
      const target = mode === 'files' ? `file:${lookup.get(edge.source)?.file}` : edge.source;
      if (source === target || !visibleIds.has(source) || !visibleIds.has(target)) continue;
      const id = `${source}|${target}`;
      const conservative = ['import', 're-export', 'dynamic-import'].includes(edge.kind);
      const existing = flowEdges.get(id);
      if (existing && conservative) continue;
      const highlighted = pathPairs.has(id);
      flowEdges.set(id, {
        id,
        source,
        target,
        type: 'smoothstep',
        label: mode === 'symbols' ? edge.kind : undefined,
        animated: highlighted,
        markerEnd: { type: MarkerType.ArrowClosed, color: highlighted ? '#7865e9' : '#b9becd' },
        style: {
          stroke: highlighted ? '#7865e9' : '#c2c8d8',
          strokeWidth: highlighted ? 2.5 : 1.5,
          strokeDasharray: conservative ? '5 4' : undefined,
          opacity: selectedPath && !highlighted ? 0.25 : 1,
        },
        labelStyle: { fontSize: 9, fill: '#8790a7' },
      });
    }
    return { nodes: flowNodes, edges: [...flowEdges.values()], total: items.size };
  }, [report, mode, selectedPath, lookup]);
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);
  return (
    <section className="panel graph-panel">
      <div className="panel-head">
        <div>
          <GitBranch size={16} />
          <h2>Impact graph</h2>
          <span className="count">{layout.total} nodes</span>
        </div>
        <div className="graph-actions">
          <div className="segmented">
            <button className={mode === 'files' ? 'selected' : ''} onClick={() => setMode('files')}>
              <Layers3 size={12} /> Files
            </button>
            <button className={mode === 'symbols' ? 'selected' : ''} onClick={() => setMode('symbols')}>
              Symbols
            </button>
          </div>
          <button
            className="icon-button"
            aria-label="Fit graph to view"
            onClick={() => setFitKey((value) => value + 1)}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
      <div className="graph-stage">
        {layout.nodes.length ? (
          <ReactFlow
            key={`${mode}-${report.id}-${fitKey}`}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_event, node) => onSelect(node.id)}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
            nodesConnectable={false}
            minZoom={0.15}
            maxZoom={1.8}
            attributionPosition="bottom-right"
          >
            <Background color="#dce0ec" gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(node) =>
                node.className?.includes('origin')
                  ? '#e8b366'
                  : node.className?.includes('test-node')
                    ? '#80baa0'
                    : '#a9a0e3'
              }
              pannable
              zoomable
            />
          </ReactFlow>
        ) : (
          <div className="empty graph-empty">
            <GitBranch size={32} />
            <h3>No change origin selected</h3>
            <p>Edit a tracked source file, compare another commit, or explore a symbol's potential impact.</p>
          </div>
        )}
      </div>
      <div className="graph-footer">
        <div>
          <span>
            <i className="node-dot changed" /> Changed
          </span>
          <span>
            <i className="node-dot module" /> Dependent
          </span>
          <span>
            <i className="node-dot test" /> Test
          </span>
        </div>
        <span>
          {layout.total > 80 ? 'Showing the first 80 nodes · ' : ''}Drag to arrange · Scroll to zoom
        </span>
      </div>
    </section>
  );
}
