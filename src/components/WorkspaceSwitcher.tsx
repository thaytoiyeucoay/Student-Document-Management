import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import WorkspaceMembersModal from './WorkspaceMembersModal';

export default function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<string | null>(() => {
    try { return localStorage.getItem('currentWorkspaceId'); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!api.hasBackend()) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const list = await api.listWorkspaces();
        setWorkspaces(list);
        if (!selected && list.length) {
          setSelected(list[0].id);
        }
      } catch (e: any) {
        setError(e?.message || 'Không tải được workspace');
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    try {
      if (selected) localStorage.setItem('currentWorkspaceId', selected);
    } catch {}
  }, [selected]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selectedName = useMemo(() => workspaces.find(w => w.id === selected)?.name || 'Chọn workspace', [workspaces, selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(w => (w.name || '').toLowerCase().includes(q));
  }, [workspaces, query]);

  if (!api.hasBackend()) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 hover:bg-slate-50 dark:bg-white/10 dark:border-white/15 dark:text-white/90 dark:hover:bg-white/15"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        <span className="truncate max-w-[160px]">{loading ? 'Đang tải…' : selectedName}</span>
        <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl p-2 z-20 dark:border-white/15 dark:bg-slate-900/95">
          {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
          <div className="p-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm workspace"
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm dark:bg-slate-800 dark:border-white/20"
            />
          </div>
          <div className="max-h-64 overflow-auto divide-y divide-slate-100/50 rounded-md border border-slate-100 dark:border-white/10">
            {loading ? (
              <div className="p-3 text-sm">Đang tải…</div>
            ) : filtered.length ? filtered.map(ws => (
              <button
                key={ws.id}
                onClick={() => { setSelected(ws.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/10 flex items-center justify-between ${selected === ws.id ? 'bg-slate-50 dark:bg-white/10' : ''}`}
                role="option"
                aria-selected={selected === ws.id}
              >
                <span className="truncate">{ws.name}</span>
                {selected === ws.id && <span className="text-emerald-600 text-xs">Đang chọn</span>}
              </button>
            )) : (
              <div className="px-3 py-2 text-sm text-slate-500">Không tìm thấy workspace phù hợp</div>
            )}
          </div>
          <div className="mt-2">
            <div className="flex gap-2 mb-2">
              <button
                disabled={!selected}
                title={!selected ? 'Chọn một workspace trước' : 'Quản lý thành viên'}
                onClick={() => { setShowMembers(true); setOpen(false); }}
                className="flex-1 text-left px-3 py-2 rounded-md text-sm bg-slate-50 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-white/5 dark:hover:bg-white/10">👥 Thành viên</button>
            </div>
            {!creating ? (
              <button onClick={() => setCreating(true)} className="w-full text-left px-3 py-2 rounded-md text-sm bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-white/5 dark:hover:bg-white/10">+ Tạo workspace</button>
            ) : (
              <div className="space-y-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên workspace" className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm dark:bg-slate-800 dark:border-white/20" />
                <div className="flex gap-2">
                  <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm rounded-md border">Hủy</button>
                  <button onClick={async () => {
                    if (!newName.trim()) return;
                    try {
                      const ws = await api.createWorkspace({ name: newName.trim() });
                      setWorkspaces(prev => [...prev, ws]);
                      setSelected(ws.id);
                      setNewName('');
                      setCreating(false);
                      setOpen(false);
                    } catch (e) { /* ignore */ }
                  }} className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700">Tạo</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showMembers && selected && (
        <WorkspaceMembersModal workspaceId={selected} onClose={() => setShowMembers(false)} />
      )}
    </div>
  );
}
