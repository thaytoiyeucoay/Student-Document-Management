import { useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import api from '../api';

type Node = { id: string; label: string; score?: number; type?: string };
type Link = { id: string; source: string; target: string; label?: string; weight?: number };

export default function MindMapView({
  subjectId,
  documentId,
  onToast,
}: {
  subjectId?: string | null;
  documentId?: string | null;
  onToast?: (m: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ nodes: Node[]; links: Link[] }>({ nodes: [], links: [] });
  const [maxNodes, setMaxNodes] = useState(20);
  const [mode, setMode] = useState<'heuristic' | 'rag' | 'llm'>('heuristic');
  const graphRef = useRef<any>(null);

  const canGenerate = Boolean(subjectId || documentId);

  const generate = async () => {
    if (!canGenerate) return;
    if (!api.hasBackend()) {
      onToast?.('Cần cấu hình backend (VITE_API_URL) để tạo Mind Map.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.mindmapGenerate({ subject_id: subjectId || undefined, document_id: documentId || undefined, max_nodes: maxNodes, mode });
      const nodes: Node[] = res.nodes || [];
      const links: Link[] = (res.edges || []).map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, weight: e.weight }));
      setData({ nodes, links });
      onToast?.(`Đã tạo sơ đồ (${nodes.length} nút, ${links.length} liên kết)`);
      setTimeout(() => graphRef.current?.zoomToFit(400, 50), 50);
    } catch (e: any) {
      onToast?.('Tạo sơ đồ thất bại');
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindmap-${subjectId || documentId || 'unknown'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600 dark:text-slate-300">Chế độ:</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
            title="Chế độ sinh mind map"
          >
            <option value="heuristic">Heuristic (nhanh)</option>
            <option value="rag">RAG</option>
            <option value="llm">LLM</option>
          </select>
          <label className="text-sm text-slate-600 dark:text-slate-300">Số nút tối đa:</label>
          <input
            type="number"
            min={5}
            max={200}
            value={maxNodes}
            onChange={(e) => setMaxNodes(Math.max(5, Math.min(200, Number(e.target.value) || 20)))}
            className="w-24 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generate}
            disabled={!canGenerate || loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
          >
            {loading ? 'Đang tạo...' : 'Tạo Mind Map'}
          </button>
          <button onClick={exportJson} disabled={!data.nodes.length} className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
            Export JSON
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <div className="h-[600px]">
          <ForceGraph2D
            ref={graphRef as any}
            graphData={{ nodes: data.nodes as any, links: data.links as any }}
            nodeLabel={(n: any) => n.label}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = node.label || node.id;
              const fontSize = 12 / (globalScale ** 0.3);
              const radius = 6 + (node.score ? Math.min(10, node.score * 6) : 0);
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = node.type === 'topic' ? '#3b82f6' : '#64748b';
              ctx.fill();
              ctx.font = `${fontSize}px sans-serif`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#111827';
              ctx.fillText(` ${label}`, node.x + radius + 2, node.y);
            }}
            linkColor={() => '#cbd5e1'}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={() => 0.005}
            linkDirectionalArrowLength={4}
            cooldownTicks={100}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 50)}
            enableNodeDrag={true}
            width={undefined as any}
            height={undefined as any}
          />
        </div>
      </div>
    </div>
  );
}
