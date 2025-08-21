import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Annotation } from '../../types';
import { GlobalWorkerOptions, getDocument, version } from 'pdfjs-dist';
import { TextLayerBuilder } from 'pdfjs-dist/web/pdf_viewer';

// Configure worker via CDN to avoid bundler worker config
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js` as any;

type Props = {
  src: string;
  documentId: string;
};

const colors = ['#f59e0b', '#22c55e', '#60a5fa', '#ef4444', '#eab308'];

type Tool = 'none' | 'note' | 'highlight' | 'underline' | 'strike';

const PDFViewer: React.FC<Props> = ({ src, documentId }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1.2);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('none');
  const [color, setColor] = useState(colors[0]);
  const [annos, setAnnos] = useState<Annotation[]>([]);
  const [drag, setDrag] = useState<null | { startX: number; startY: number; x: number; y: number; w: number; h: number; page: number }>(null);
  const [filterType, setFilterType] = useState<'all' | Tool>('all');
  const [filterColor, setFilterColor] = useState<string | 'all'>('all');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const loadingTask = getDocument(src);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);
        // Render pages
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.dataset.pageNumber = String(i);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const wrapper = document.createElement('div');
          wrapper.className = 'relative mb-4';
          wrapper.style.width = `${viewport.width}px`;
          wrapper.style.height = `${viewport.height}px`;
          wrapper.appendChild(canvas);

          // Text layer for selection-based highlights
          const textLayerDiv = document.createElement('div');
          textLayerDiv.className = 'absolute inset-0 textLayer select-text';
          textLayerDiv.style.pointerEvents = 'auto';
          wrapper.appendChild(textLayerDiv);
          try {
            const textContent = await page.getTextContent();
            const textLayer = new TextLayerBuilder({
              textLayerDiv: textLayerDiv as HTMLDivElement,
              pageIndex: i - 1,
              viewport,
              enhanceTextSelection: true,
            } as any);
            textLayer.setTextContentSource(textContent as any);
            textLayer.render();
          } catch {}

          // Layer for annotations overlay
          const noteLayer = document.createElement('div');
          noteLayer.className = 'absolute inset-0 pointer-events-none';
          noteLayer.dataset.pageNumber = String(i);
          wrapper.appendChild(noteLayer);

          container.appendChild(wrapper);
        }
      } catch (e: any) {
        console.error(e);
        setError('Không thể tải PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [src, scale]);

  // Load saved annotations
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await api.listAnnotations(documentId);
        if (mounted) setAnnos(list);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [documentId]);

  // helpers
  const deleteAnno = (id: string) => {
    setAnnos(prev => prev.filter(a => a.id !== id));
    api.deleteAnnotation(id).catch(() => {});
  };

  const scrollToPage = (page: number) => {
    const container = containerRef.current;
    if (!container) return;
    const wrappers = Array.from(container.children) as HTMLDivElement[];
    const target = wrappers.find(w => Number(w.querySelector('canvas')?.dataset.pageNumber) === page);
    if (target) {
      const top = target.offsetTop;
      container.scrollTo({ top: Math.max(0, top - 16), behavior: 'smooth' });
    }
  };

  // Render annotations to overlay
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const wrappers = Array.from(container.children) as HTMLDivElement[];
    wrappers.forEach((w) => {
      const pageNo = Number(w.querySelector('canvas')?.dataset.pageNumber || w.querySelector('[data-page-number]')?.getAttribute('data-page-number')) || 0;
      const overlay = w.querySelector('div.absolute.inset-0') as HTMLDivElement | null;
      if (!overlay) return;
      overlay.innerHTML = '';

      // render note annotations
      const notes = annos.filter(a => a.type === 'note' && a.page === pageNo && !a.is_deleted);
      notes.forEach(a => {
        const wrap = document.createElement('div');
        wrap.className = 'absolute -translate-x-1/2 -translate-y-full pointer-events-auto';
        wrap.style.left = `${a.x * 100}%`;
        wrap.style.top = `${a.y * 100}%`;
        const btn = document.createElement('div');
        btn.className = 'px-2 py-1 rounded shadow text-xs text-white inline-block';
        btn.style.backgroundColor = a.color || '#f59e0b';
        btn.textContent = '📝';
        btn.title = a.comment || '';
        btn.onclick = (e) => {
          e.stopPropagation();
          const val = prompt('Chỉnh ghi chú:', a.comment || '') || '';
          const patch = { ...a, comment: val } as Annotation;
          setAnnos(prev => prev.map(p => p.id === a.id ? patch : p));
          api.updateAnnotation(a.id, { comment: val }).catch(() => {});
        };
        const del = document.createElement('button');
        del.className = 'ml-1 align-middle text-xs px-1 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white';
        del.textContent = '🗑️';
        del.title = 'Xóa ghi chú';
        del.onclick = (e) => { e.stopPropagation(); deleteAnno(a.id); };
        wrap.appendChild(btn);
        wrap.appendChild(del);
        overlay.appendChild(wrap);
      });

      // render box-like annotations (highlight/underline/strike)
      const boxes = annos.filter(a => (a.type === 'highlight' || a.type === 'underline' || a.type === 'strike') && a.page === pageNo && !a.is_deleted);
      boxes.forEach(a => {
        const c = a.color || '#f59e0b';
        const rects = a.rects && a.rects.length ? a.rects : [{ x: a.x, y: a.y, width: a.width, height: a.height }];
        rects.forEach(r => {
          const el = document.createElement('div');
          el.className = 'absolute pointer-events-auto group';
          el.style.left = `${r.x * 100}%`;
          el.style.top = `${r.y * 100}%`;
          el.style.width = `${r.width * 100}%`;
          el.style.height = `${r.height * 100}%`;
          if (a.type === 'highlight') {
            el.style.backgroundColor = c + '80';
            el.style.borderRadius = '2px';
          } else if (a.type === 'underline') {
            el.style.borderBottom = `3px solid ${c}`;
          } else if (a.type === 'strike') {
            el.style.borderTop = `3px solid ${c}`;
            el.style.top = `calc(${r.y * 100}% + ${r.height * 50}%)`;
            el.style.height = '0px';
          }
          const del = document.createElement('button');
          del.className = 'absolute -top-2 -right-2 hidden group-hover:block text-xs px-1 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white';
          del.textContent = '🗑️';
          del.title = 'Xóa chú thích';
          del.onclick = (e) => { e.stopPropagation(); deleteAnno(a.id); };
          el.appendChild(del);
          overlay.appendChild(el);
        });
      });
    });
  }, [annos, numPages]);

  // Pointer interactions: note click, box drag
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onClick = (e: MouseEvent) => {
      if (tool !== 'note') return;
      const target = e.target as HTMLElement;
      const wrapper = target.closest('.relative') as HTMLDivElement | null;
      if (!wrapper) return;
      const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const page = Number(canvas.dataset.pageNumber || '1');
      const comment = prompt('Nội dung ghi chú:') || '';
      const a: Annotation = {
        id: crypto.randomUUID(),
        document_id: documentId,
        page,
        type: 'note',
        x, y, width: 0, height: 0,
        color,
        comment,
        created_at: new Date().toISOString(),
        is_deleted: false,
      };
      setAnnos(prev => [a, ...prev]);
      api.createAnnotation({
        document_id: documentId,
        page,
        type: 'note',
        x, y, width: 0, height: 0,
        color,
        comment,
      }).catch(() => {});
    };
    const onMouseDown = (e: MouseEvent) => {
      if (tool === 'none' || tool === 'note') return;
      const target = e.target as HTMLElement;
      const wrapper = target.closest('.relative') as HTMLDivElement | null;
      if (!wrapper) return;
      const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const page = Number(canvas.dataset.pageNumber || '1');
      setDrag({ startX: x, startY: y, x, y, w: 0, h: 0, page });
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drag) return;
      const wrapper = (e.target as HTMLElement).closest('.relative') as HTMLDivElement | null;
      if (!wrapper) return;
      const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const nx = Math.min(drag.startX, x);
      const ny = Math.min(drag.startY, y);
      const w = Math.abs(x - drag.startX);
      const h = Math.abs(y - drag.startY);
      setDrag(prev => prev ? { ...prev, x: nx, y: ny, w, h } : prev);
    };
    const onMouseUp = () => {
      // If a drag rectangle exists, create a simple box annotation
      if (drag) {
        const { page, x, y, w, h } = drag;
        setDrag(null);
        if (w >= 0.005 && h >= 0.005 && tool !== 'none' && tool !== 'note') {
          const type = (tool as 'highlight' | 'underline' | 'strike') as Annotation['type'];
          const a: Annotation = {
            id: crypto.randomUUID(),
            document_id: documentId,
            page,
            type,
            x, y, width: w, height: h,
            color,
            created_at: new Date().toISOString(),
            is_deleted: false,
          } as Annotation;
          setAnnos(prev => [a, ...prev]);
          api.createAnnotation({ document_id: documentId, page, type, x, y, width: w, height: h, color }).catch(() => {});
          return;
        }
      }

      // If no drag (or tiny), try text selection-based multi-rect creation
      if (tool === 'highlight' || tool === 'underline' || tool === 'strike') {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        const anchorEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        if (!anchorEl) return;
        const wrapper = anchorEl.closest('.relative') as HTMLDivElement | null;
        if (!wrapper) return;
        const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) return;
        const page = Number(canvas.dataset.pageNumber || '1');
        const canvasRect = canvas.getBoundingClientRect();
        const rects: { x: number; y: number; width: number; height: number }[] = [];
        for (const r of Array.from(range.getClientRects())) {
          // Consider only rects that intersect the canvas (same page)
          const ix = Math.max(r.left, canvasRect.left);
          const iy = Math.max(r.top, canvasRect.top);
          const ax = Math.min(r.right, canvasRect.right);
          const ay = Math.min(r.bottom, canvasRect.bottom);
          const iw = Math.max(0, ax - ix);
          const ih = Math.max(0, ay - iy);
          if (iw <= 0 || ih <= 0) continue;
          const nx = (ix - canvasRect.left) / canvasRect.width;
          const ny = (iy - canvasRect.top) / canvasRect.height;
          const nw = iw / canvasRect.width;
          const nh = ih / canvasRect.height;
          if (nw < 0.002 || nh < 0.002) continue; // ignore tiny spans
          rects.push({ x: nx, y: ny, width: nw, height: nh });
        }
        if (rects.length === 0) return;
        // Merge bounding box for compatibility
        const minX = Math.min(...rects.map(r => r.x));
        const minY = Math.min(...rects.map(r => r.y));
        const maxX = Math.max(...rects.map(r => r.x + r.width));
        const maxY = Math.max(...rects.map(r => r.y + r.height));
        const x = minX;
        const y = minY;
        const w = Math.max(0, maxX - minX);
        const h = Math.max(0, maxY - minY);
        const type = (tool as 'highlight' | 'underline' | 'strike') as Annotation['type'];
        const a: Annotation = {
          id: crypto.randomUUID(),
          document_id: documentId,
          page,
          type,
          x, y, width: w, height: h,
          rects,
          color,
          created_at: new Date().toISOString(),
          is_deleted: false,
        } as Annotation;
        setAnnos(prev => [a, ...prev]);
        api.createAnnotation({ document_id: documentId, page, type, x, y, width: w, height: h, color, rects } as any).catch(() => {});
        // Clear selection to avoid re-use
        try { sel.removeAllRanges(); } catch {}
      }
    };
    container.addEventListener('click', onClick);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('click', onClick);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [tool, color, documentId, src, drag]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/30">
        <div className="flex items-center gap-1">
          <button className={`px-2 py-1 rounded border ${tool === 'note' ? 'bg-amber-500/20 border-amber-300/40' : 'bg-white/10 border-white/20'}`} onClick={() => setTool(t => t === 'note' ? 'none' : 'note')} title="Thêm ghi chú (sticky note)">📝 Ghi chú</button>
          <button className={`px-2 py-1 rounded border ${tool === 'highlight' ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20'}`} onClick={() => setTool(t => t === 'highlight' ? 'none' : 'highlight')} title="Tô sáng">🖍️ High</button>
          <button className={`px-2 py-1 rounded border ${tool === 'underline' ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20'}`} onClick={() => setTool(t => t === 'underline' ? 'none' : 'underline')} title="Gạch dưới">⎁ Under</button>
          <button className={`px-2 py-1 rounded border ${tool === 'strike' ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20'}`} onClick={() => setTool(t => t === 'strike' ? 'none' : 'strike')} title="Gạch ngang">〰 Strike</button>
        </div>
        <div className="flex items-center gap-1">
          {colors.map(c => (
            <button key={c} className={`w-5 h-5 rounded-full border ${color === c ? 'ring-2 ring-white' : ''}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} title={c} />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-2 py-1 rounded bg-white/10 border border-white/20" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}>-</button>
          <span className="text-sm text-white/80 w-16 text-center">{Math.round(scale * 100)}%</span>
          <button className="px-2 py-1 rounded bg-white/10 border border-white/20" onClick={() => setScale(s => Math.min(3, s + 0.1))}>+</button>
        </div>
      </div>
      <div className="flex-1 bg-slate-900/60 flex min-h-0">
        <div ref={containerRef} className="flex-1 overflow-auto p-4" />
        <aside className="w-72 border-l border-white/10 bg-black/20 flex flex-col">
          <div className="p-3 border-b border-white/10">
            <div className="text-white/90 font-semibold text-sm mb-2">Chú thích</div>
            <div className="flex items-center gap-2 mb-2">
              <select className="bg-white/10 border border-white/15 text-white text-xs rounded px-2 py-1" value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                <option value="all">Tất cả</option>
                <option value="note">Ghi chú</option>
                <option value="highlight">Highlight</option>
                <option value="underline">Underline</option>
                <option value="strike">Strike</option>
              </select>
              <select className="bg-white/10 border border-white/15 text-white text-xs rounded px-2 py-1" value={filterColor} onChange={(e) => setFilterColor(e.target.value as any)}>
                <option value="all">Mọi màu</option>
                {colors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <input className="w-full bg-white/10 border border-white/15 text-white text-xs rounded px-2 py-1" placeholder="Tìm nội dung" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
          <div className="flex-1 overflow-auto divide-y divide-white/10">
            {annos
              .filter(a => !a.is_deleted)
              .filter(a => filterType === 'all' ? true : a.type === filterType)
              .filter(a => filterColor === 'all' ? true : a.color === filterColor)
              .filter(a => searchText.trim() ? (a.comment || '').toLowerCase().includes(searchText.toLowerCase()) : true)
              .sort((a, b) => a.page - b.page || b.created_at.localeCompare(a.created_at))
              .map(a => (
                <div key={a.id} className="p-2 hover:bg-white/5 flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: a.color || '#f59e0b' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/70">Trang {a.page} · {a.type}</div>
                    {a.comment && <div className="text-sm text-white truncate">{a.comment}</div>}
                    {!a.comment && <div className="text-sm text-white/60 italic">(không có ghi chú)</div>}
                    <div className="mt-1 flex gap-2">
                      <button className="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white/90" onClick={() => scrollToPage(a.page)}>Tới trang</button>
                      <button className="text-xs px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white" onClick={() => deleteAnno(a.id)}>Xóa</button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </aside>
      </div>
      {drag && tool !== 'note' && (
        <div className="pointer-events-none fixed inset-0">
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%'
            }}
          />
        </div>
      )}
      {loading && <div className="p-4 text-white/80 text-sm">Đang tải PDF...</div>}
      {error && <div className="p-4 text-red-300 text-sm">{error}</div>}
    </div>
  );
};

export default PDFViewer;
