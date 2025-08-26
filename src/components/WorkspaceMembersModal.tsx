import { useEffect, useMemo, useState } from 'react';
import api from '../api';

export default function WorkspaceMembersModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Array<{ user_id: string; role: 'owner' | 'editor' | 'viewer' }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailOrUserId, setEmailOrUserId] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [query, setQuery] = useState('');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const list = await api.listWorkspaceMembers(workspaceId);
        setMembers(list);
      } catch (e: any) {
        setError(e?.message || 'Không tải được thành viên');
      } finally { setLoading(false); }
    })();
  }, [workspaceId]);

  const refresh = async () => {
    try { setMembers(await api.listWorkspaceMembers(workspaceId)); } catch {}
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m => m.user_id.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
  }, [members, query]);

  const handleRemove = async (uid: string) => {
    if (!confirm('Xóa thành viên này khỏi workspace?')) return;
    try {
      setBusyUserId(uid);
      await api.removeWorkspaceMember(workspaceId, uid);
      await refresh();
    } catch {}
    finally { setBusyUserId(null); }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 p-4 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold">Thành viên Workspace</h3>
              <p className="text-xs text-slate-500">Quản lý vai trò và thành viên</p>
            </div>
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border">Đóng</button>
          </div>

          {error && <div className="mb-3 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30">{error}</div>}

          <div className="mb-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo user_id hoặc vai trò" className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm dark:bg-slate-800 dark:border-white/20" />
          </div>

          <div className="max-h-72 overflow-auto rounded-md border border-slate-200 dark:border-white/15 divide-y bg-white/60 dark:bg-white/5">
            {loading ? (
              <div className="p-3 text-sm">Đang tải…</div>
            ) : filtered.length ? filtered.map(m => (
              <div key={m.user_id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    className="h-8 w-8 rounded-full border border-slate-200 dark:border-white/10"
                    src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.user_id)}`}
                    alt="avatar"
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[220px]">{m.user_id}</div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs mt-0.5 ${m.role === 'owner' ? 'bg-amber-100 text-amber-800' : m.role === 'editor' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{m.role}</span>
                  </div>
                </div>
                <button onClick={() => handleRemove(m.user_id)} disabled={busyUserId === m.user_id} className="px-2 py-1 text-xs rounded-md border hover:bg-red-50 text-red-600 border-red-200 disabled:opacity-50">{busyUserId === m.user_id ? 'Đang xóa…' : 'Xóa'}</button>
              </div>
            )) : (
              <div className="p-3 text-sm text-slate-500">Chưa có thành viên</div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium mb-1">Thêm thành viên</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={emailOrUserId} onChange={(e) => setEmailOrUserId(e.target.value)} placeholder="User ID hoặc Email (tùy backend hỗ trợ)" className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-sm dark:bg-slate-800 dark:border-white/20" />
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className="px-3 py-2 rounded-md border border-slate-300 text-sm dark:bg-slate-800 dark:border-white/20">
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
              </select>
              <button onClick={async () => { if (!emailOrUserId.trim()) return; try { await api.addWorkspaceMember(workspaceId, { user_id: emailOrUserId.trim(), role }); setEmailOrUserId(''); await refresh(); } catch {} }} className="px-3 py-2 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700">Thêm</button>
            </div>
            <div className="text-xs text-slate-500 mt-1">Chỉ Owner mới thêm/xóa thành viên. Liên hệ quản trị nếu bạn không có quyền.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
