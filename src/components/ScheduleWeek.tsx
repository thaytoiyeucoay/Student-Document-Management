import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import type { ScheduleItem, Subject } from '../../types';

function startOfWeek(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // Monday as start
  date.setUTCDate(date.getUTCDate() - diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 7);
  e.setUTCHours(0, 0, 0, 0);
  return e;
}

function toISO(date: Date) {
  return date.toISOString();
}

type Props = {
  subjects: Subject[];
  onToast?: (msg: string) => void;
};

export default function ScheduleWeek({ subjects, onToast }: Props) {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSubjectId, setFilterSubjectId] = useState<string | 'all'>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [form, setForm] = useState<{ title: string; subjectId: string | ''; date: string; start: string; end: string; location: string; note: string }>({
    title: '',
    subjectId: '',
    date: '',
    start: '07:00',
    end: '09:00',
    location: '',
    note: '',
  });

  const week = useMemo(() => {
    const from = startOfWeek(anchor);
    const to = endOfWeek(anchor);
    return { from, to };
  }, [anchor]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    const d = new Date(week.from);
    for (let i = 0; i < 7; i++) {
      arr.push(new Date(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return arr;
  }, [week]);

  useEffect(() => {
    (async () => {
      if (!api.hasBackend()) { setItems([]); return; }
      setLoading(true); setError(null);
      try {
        const list = await api.listSchedules({ from: toISO(week.from), to: toISO(week.to), subjectId: filterSubjectId !== 'all' ? filterSubjectId : undefined });
        setItems(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [week.from.getTime(), week.to.getTime(), filterSubjectId]);

  const showToast = (m: string) => onToast?.(m);

  const openCreate = (date: Date) => {
    const local = new Date(date);
    const yyyy = local.getFullYear();
    const mm = String(local.getMonth() + 1).padStart(2, '0');
    const dd = String(local.getDate()).padStart(2, '0');
    setEditing(null);
    setForm({
      title: '',
      subjectId: subjects[0]?.id || '',
      date: `${yyyy}-${mm}-${dd}`,
      start: '07:00',
      end: '09:00',
      location: '',
      note: '',
    });
    setIsModalOpen(true);
  };

  const openEdit = (item: ScheduleItem) => {
    const s = new Date(item.startsAt);
    const yyyy = s.getFullYear();
    const mm = String(s.getMonth() + 1).padStart(2, '0');
    const dd = String(s.getDate()).padStart(2, '0');
    const hh = String(s.getHours()).padStart(2, '0');
    const mi = String(s.getMinutes()).padStart(2, '0');
    const e = new Date(item.endsAt);
    const eh = String(e.getHours()).padStart(2, '0');
    const em = String(e.getMinutes()).padStart(2, '0');
    setEditing(item);
    setForm({
      title: item.title || '',
      subjectId: item.subjectId || '',
      date: `${yyyy}-${mm}-${dd}`,
      start: `${hh}:${mi}`,
      end: `${eh}:${em}`,
      location: item.location || '',
      note: item.note || '',
    });
    setIsModalOpen(true);
  };

  function combine(dateStr: string, timeStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const dt = new Date();
    dt.setFullYear(y, (m - 1), d);
    dt.setHours(hh, mm, 0, 0);
    return dt.toISOString();
  }

  const saveModal = async () => {
    const payload = {
      subjectId: form.subjectId || null,
      title: form.title || null,
      startsAt: combine(form.date, form.start),
      endsAt: combine(form.date, form.end),
      location: form.location || null,
      note: form.note || null,
    };
    try {
      if (editing) {
        const updated = await api.updateSchedule(editing.id, payload);
        setItems((prev) => prev.map((i) => (i.id === editing.id ? updated : i)));
        showToast?.('Đã cập nhật sự kiện');
      } else {
        const created = await api.createSchedule(payload);
        setItems((prev) => [...prev, created]);
        showToast?.('Đã tạo sự kiện');
      }
      setIsModalOpen(false);
    } catch {
      showToast?.('Lưu sự kiện thất bại');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteSchedule(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      showToast?.('Đã xóa sự kiện');
    } catch {
      showToast?.('Xóa sự kiện thất bại');
    }
  };

  // Drag & drop helpers
  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDropToDate = async (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const s = new Date(item.startsAt);
    const eTime = new Date(item.endsAt);
    const target = new Date(date);
    const startLocal = new Date(target);
    startLocal.setHours(s.getHours(), s.getMinutes(), 0, 0);
    const endLocal = new Date(target);
    endLocal.setHours(eTime.getHours(), eTime.getMinutes(), 0, 0);
    try {
      const updated = await api.updateSchedule(id, { startsAt: startLocal.toISOString(), endsAt: endLocal.toISOString() });
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      showToast?.('Đã di chuyển sự kiện');
    } catch {
      showToast?.('Di chuyển thất bại');
    }
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const DayCol = ({ date }: { date: Date }) => {
    const dayItems = items
      .filter((i) => {
        const d = new Date(i.startsAt);
        return d.getUTCFullYear() === date.getUTCFullYear() && d.getUTCMonth() === date.getUTCMonth() && d.getUTCDate() === date.getUTCDate();
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const label = date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
    return (
      <div className="border border-white/10 rounded-lg p-2 bg-white/5" onDrop={(e) => onDropToDate(e, date)} onDragOver={onDragOver}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-white">{label}</div>
          <button onClick={() => openCreate(date)} className="px-2 py-1 text-xs rounded bg-white/10 border border-white/20 hover:bg-white/15">+ Thêm</button>
        </div>
        <div className="space-y-2">
          {dayItems.map((i) => {
            const s = new Date(i.startsAt);
            const e = new Date(i.endsAt);
            const subj = subjects.find((s) => s.id === i.subjectId)?.name || '';
            return (
              <div key={i.id} className="p-2 rounded bg-white/10 border border-white/20" draggable onDragStart={(ev) => onDragStart(ev, i.id)}>
                <div className="text-sm font-medium text-white truncate cursor-pointer" onClick={() => openEdit(i)}>{i.title || subj || 'Sự kiện'}</div>
                <div className="text-xs text-white/70">{s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                {subj && <div className="text-xs text-white/60">{subj}</div>}
                <div className="mt-2 flex gap-2">
                  <button onClick={() => remove(i.id)} className="px-2 py-1 text-xs rounded bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30">Xóa</button>
                </div>
              </div>
            );
          })}
          {dayItems.length === 0 && (
            <div className="text-xs text-white/50">Không có sự kiện</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(new Date(anchor.getTime() - 7 * 86400000))} className="px-3 py-1 rounded bg-white/10 border border-white/20">← Tuần trước</button>
          <button onClick={() => setAnchor(new Date())} className="px-3 py-1 rounded bg-white/10 border border-white/20">Tuần này</button>
          <button onClick={() => setAnchor(new Date(anchor.getTime() + 7 * 86400000))} className="px-3 py-1 rounded bg-white/10 border border-white/20">Tuần sau →</button>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterSubjectId} onChange={(e) => setFilterSubjectId(e.target.value as any)} className="px-3 py-1 rounded bg-white/10 border border-white/20 text-white text-sm">
            <option value="all">Tất cả môn</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="text-white/80 text-sm">
            {week.from.toLocaleDateString()} – {new Date(week.to.getTime() - 1).toLocaleDateString()}
          </div>
        </div>
      </div>
      {error && <div className="mb-3 text-red-300 text-sm">{error}</div>}
      {loading ? (
        <div className="text-white/70">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {days.map((d) => (
            <DayCol key={d.toISOString()} date={d} />
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsModalOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl bg-slate-900/95 border border-white/20 p-4 text-white">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">{editing ? 'Sửa sự kiện' : 'Tạo sự kiện'}</div>
                <button onClick={() => setIsModalOpen(false)} className="px-2 py-1 rounded bg-white/10 border border-white/20">✕</button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">Tiêu đề
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" />
                </label>
                <label className="text-sm">Môn học
                  <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20">
                    <option value="">(Không liên kết)</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="text-sm col-span-1">Ngày
                    <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" />
                  </label>
                  <label className="text-sm col-span-1">Bắt đầu
                    <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" />
                  </label>
                  <label className="text-sm col-span-1">Kết thúc
                    <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" />
                  </label>
                </div>
                <label className="text-sm">Phòng
                  <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" />
                </label>
                <label className="text-sm">Ghi chú
                  <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" rows={3} />
                </label>
                <div className="flex justify-end gap-2 mt-2">
                  {editing && (
                    <button onClick={async () => { await remove(editing.id); setIsModalOpen(false); }} className="px-3 py-2 rounded bg-red-500/20 border border-red-500/40 text-red-200">Xóa</button>
                  )}
                  <button onClick={() => setIsModalOpen(false)} className="px-3 py-2 rounded bg-white/10 border border-white/20">Hủy</button>
                  <button onClick={saveModal} className="px-3 py-2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-200">Lưu</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
