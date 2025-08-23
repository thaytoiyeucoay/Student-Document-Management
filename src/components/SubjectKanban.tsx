import React, { useEffect, useMemo, useState } from 'react';
import type { Subject, Document } from '../../types';

export type KanbanColumnKey = 'todo' | 'doing' | 'review' | 'done';

export interface KanbanTask {
  id: string;
  title: string;
  note?: string;
  due?: string; // ISO date
  docId?: string; // linked document id
}

export interface KanbanBoardData {
  todo: KanbanTask[];
  doing: KanbanTask[];
  review: KanbanTask[];
  done: KanbanTask[];
}

function emptyBoard(): KanbanBoardData {
  return { todo: [], doing: [], review: [], done: [] };
}

function readBoard(subjectId: string): KanbanBoardData {
  try {
    const raw = localStorage.getItem(`kanban:${subjectId}`);
    if (!raw) return emptyBoard();
    const parsed = JSON.parse(raw) as KanbanBoardData;
    if (!parsed || typeof parsed !== 'object') return emptyBoard();
    return {
      todo: parsed.todo ?? [],
      doing: parsed.doing ?? [],
      review: parsed.review ?? [],
      done: parsed.done ?? [],
    };
  } catch {
    return emptyBoard();
  }
}

function saveBoard(subjectId: string, data: KanbanBoardData) {
  try { localStorage.setItem(`kanban:${subjectId}`, JSON.stringify(data)); } catch {}
}

const columnMeta: Record<KanbanColumnKey, { title: string; color: string }>= {
  todo: { title: 'To study', color: 'bg-amber-500/20' },
  doing: { title: 'In progress', color: 'bg-sky-500/20' },
  review: { title: 'Review', color: 'bg-fuchsia-500/20' },
  done: { title: 'Done', color: 'bg-emerald-500/20' },
};

const SubjectKanban: React.FC<{ subject: Subject; docs?: Document[] }>= ({ subject, docs = [] }) => {
  const [board, setBoard] = useState<KanbanBoardData>(() => readBoard(subject.id));
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newDocId, setNewDocId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editDocId, setEditDocId] = useState<string>('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'today' | 'overdue'>('all');

  // Reload when subject changes
  useEffect(() => {
    setBoard(readBoard(subject.id));
    setNewTitle('');
    setNewNote('');
    setNewDue('');
    setNewDocId('');
    setEditingId(null);
    setEditDocId('');
  }, [subject.id]);

  // Persist
  useEffect(() => { saveBoard(subject.id, board); }, [subject.id, board]);

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    const t: KanbanTask = { id: String(Date.now() + Math.random()), title, note: newNote.trim() || undefined, due: newDue || undefined, docId: newDocId || undefined };
    setBoard(b => ({ ...b, todo: [{ ...t }, ...b.todo] }));
    setNewTitle('');
    setNewNote('');
    setNewDue('');
    setNewDocId('');
  };

  const removeTask = (col: KanbanColumnKey, id: string) => {
    setBoard(b => ({ ...b, [col]: b[col].filter(t => t.id !== id) }));
  };

  // Drag and drop
  const onDragStart = (e: React.DragEvent, from: KanbanColumnKey, id: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ from, id }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDrop = (e: React.DragEvent, to: KanbanColumnKey) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain')) as { from: KanbanColumnKey; id: string };
      if (!data) return;
      if (data.from === to) return;
      setBoard(prev => {
        const fromArr = [...prev[data.from]];
        const idx = fromArr.findIndex(t => t.id === data.id);
        if (idx === -1) return prev;
        const [task] = fromArr.splice(idx, 1);
        const toArr = [...prev[to]];
        return { ...prev, [data.from]: fromArr, [to]: [task, ...toArr] };
      });
    } catch {}
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const todayISO = useMemo(() => new Date().toISOString().slice(0,10), []);

  // Browser notifications for due/overdue tasks (non-done). Deduplicate per task id.
  useEffect(() => {
    let timer: number | undefined;
    const requestPerm = async () => {
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch {}
    };
    requestPerm();
    const key = (id: string) => `kanban:notif:${subject.id}:${id}`;
    const check = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const dueCols: KanbanColumnKey[] = ['todo', 'doing', 'review'];
      for (const col of dueCols) {
        for (const t of board[col]) {
          if (!t.due) continue;
          if (t.due > todayISO) continue;
          try {
            const sent = localStorage.getItem(key(t.id));
            if (sent) continue;
            new Notification(`Hạn công việc (${subject.name})`, { body: `${t.title}${t.due ? ` • hạn: ${t.due}` : ''}` });
            localStorage.setItem(key(t.id), '1');
          } catch {}
        }
      }
    };
    // run now and then periodically
    check();
    timer = window.setInterval(check, 60 * 1000);
    return () => { if (timer) window.clearInterval(timer); };
  }, [board, subject.id, subject.name, todayISO]);

  const markDoneToday = (from: KanbanColumnKey, id: string) => {
    setBoard(prev => {
      const fromArr = [...prev[from]];
      const idx = fromArr.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const [task] = fromArr.splice(idx, 1);
      const doneArr = [{ ...task, due: todayISO }, ...prev.done];
      return { ...prev, [from]: fromArr, done: doneArr };
    });
  };

  const openLinkedDoc = (docId?: string) => {
    if (!docId) return;
    const d = docs.find(x => x.id === docId);
    if (!d) return;
    const url = d.fileUrl || d.link;
    if (url) window.open(url, '_blank');
  };

  const handleSave = (taskId: string) => {
    if (!editTitle.trim()) return;
    setBoard(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next) as KanbanColumnKey[]) {
        next[key] = next[key].map(x => x.id === taskId ? { ...x, title: editTitle.trim() || x.title, note: editNote.trim() || undefined, due: editDue || undefined, docId: editDocId || undefined } : x);
      }
      return next;
    });
    setEditingId(null);
  };

  const handleCancel = (t: KanbanTask) => {
    setEditTitle(t.title);
    setEditNote(t.note || '');
    setEditDue(t.due || '');
    setEditDocId(t.docId || '');
    setEditingId(null);
  };

  const Column: React.FC<{ k: KanbanColumnKey }>= ({ k }) => (
    <div
      className={`rounded-xl border border-white/15 bg-white/5 p-2 min-h-[240px]`} 
      onDrop={(e) => onDrop(e, k)}
      onDragOver={onDragOver}
    >
      <div className="px-2 py-1 mb-2 text-xs font-semibold text-white/85 flex items-center justify-between">
        <span>{columnMeta[k].title}</span>
        <span className="text-white/50">{board[k].length}</span>
      </div>
      <div className="space-y-2">
        {board[k]
          .filter(t => {
            if (deadlineFilter === 'all') return true;
            if (!t.due) return false;
            if (deadlineFilter === 'today') return t.due === todayISO;
            if (deadlineFilter === 'overdue') return t.due < todayISO;
            return true;
          })
          .map(t => {
          const overdue = t.due && t.due < todayISO;
          return (
            <div
              key={t.id}
              className={`rounded-lg px-3 py-2 border border-white/10 ${columnMeta[k].color} text-white/90 ${editingId === t.id ? 'cursor-text' : 'cursor-move'}`}
              draggable={editingId !== t.id}
              onDragStart={(e) => { if (editingId === t.id) { e.preventDefault(); return; } onDragStart(e, k, t.id); }}
              onDragOver={(e) => { if (editingId === t.id) { e.preventDefault(); e.stopPropagation(); } }}
              title={t.note || t.title}
            >
              {editingId === t.id ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSave(t.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      handleCancel(t);
                    }
                  }}
                >
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    className="space-y-2"
                  >
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1 rounded bg-white border border-slate-200 text-slate-900 text-sm dark:bg-white dark:text-slate-900"
                    placeholder="Tiêu đề"
                    autoFocus
                  />
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    rows={2}
                    className="w-full px-2 py-1 rounded bg-white border border-slate-200 text-slate-900 text-xs resize-y dark:bg-white dark:text-slate-900"
                    placeholder="Ghi chú..."
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-center">
                    <input
                      type="date"
                      value={editDue}
                      onChange={(e) => setEditDue(e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-900 text-xs dark:bg-white dark:text-slate-900"
                    />
                    <select
                      value={editDocId}
                      onChange={(e) => setEditDocId(e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-900 text-xs dark:bg-white dark:text-slate-900 w-full"
                    >
                      <option value="">Chưa liên kết tài liệu</option>
                      {docs.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center justify-end gap-2 col-span-full">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCancel(t); }}
                        className="px-2 py-1 rounded-md text-[11px] bg-white/10 border border-white/15"
                        aria-label="Hủy chỉnh sửa"
                      >Hủy</button>
                      <button
                        type="submit"
                        onClick={(e) => { /* also handle click to be safe */ e.stopPropagation(); }}
                        disabled={!editTitle.trim()}
                        className="px-2 py-1 rounded-md text-[11px] bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Lưu thay đổi"
                      >Lưu</button>
                    </div>
                  </div>
                  </div>
                </form>
              ) : (
                <>
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-white/70">
                    <span className="truncate">{t.note}</span>
                    {t.due && (
                      <span className={`ml-2 shrink-0 px-1.5 py-0.5 rounded ${overdue ? 'bg-red-600/70' : 'bg-white/10 border border-white/15'}`}>{t.due}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center flex-wrap gap-2">
                    {t.docId && (
                      <button
                        onClick={() => openLinkedDoc(t.docId)}
                        className="px-2 py-1 rounded-md text-[11px] bg-white/10 border border-white/15"
                        title="Mở tài liệu liên kết"
                      >Mở tài liệu</button>
                    )}
                    <button
                      onClick={() => {
                        setEditingId(t.id);
                        setEditTitle(t.title);
                        setEditNote(t.note || '');
                        setEditDue(t.due || '');
                        setEditDocId(t.docId || '');
                      }}
                      className="px-2 py-1 rounded-md text-[11px] bg-white/10 border border-white/15"
                    >Sửa</button>
                    {k !== 'done' && (
                      <button
                        onClick={() => markDoneToday(k, t.id)}
                        className="px-2 py-1 rounded-md text-[11px] bg-emerald-600/80 text-white"
                        title="Đánh dấu xong hôm nay"
                      >Xong hôm nay</button>
                    )}
                    <button
                      onClick={() => removeTask(k, t.id)}
                      className="px-2 py-1 rounded-md text-[11px] bg-white/10 border border-white/15"
                    >Xóa</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-white/70 mb-1">Thêm công việc cho môn: <span className="font-semibold text-white/90">{subject.name}</span></label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="VD: Ôn chương 1, làm bài tập 1-5"
            className="w-full px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15"
          />
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Ghi chú (tùy chọn)"
            rows={2}
            className="mt-2 w-full px-3 py-2 rounded-md bg-white border border-slate-200 text-xs dark:bg-white/10 dark:border-white/15"
          />
        </div>
        <div>
          <label className="block text-xs text-white/70 mb-1">Deadline</label>
          <input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15"
          />
        </div>
        <div>
          <label className="block text-xs text-white/70 mb-1">Liên kết tài liệu</label>
          <select
            value={newDocId}
            onChange={(e) => setNewDocId(e.target.value)}
            className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15"
          >
            <option value="">Không liên kết</option>
            {docs.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <button onClick={addTask} className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm">Thêm</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-white/70">Lọc deadline:</label>
        <select
          value={deadlineFilter}
          onChange={(e) => setDeadlineFilter(e.target.value as 'all' | 'today' | 'overdue')}
          className="px-2 py-1 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15"
        >
          <option value="all">All</option>
          <option value="today">Today</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Column k="todo" />
        <Column k="doing" />
        <Column k="review" />
        <Column k="done" />
      </div>
    </div>
  );
};

export default SubjectKanban;
