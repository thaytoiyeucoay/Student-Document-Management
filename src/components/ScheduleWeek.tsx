import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
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
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState<string | null>(null); // 'YYYY-MM-DD' when editing a recurring instance
  const [editScope, setEditScope] = useState<'series' | 'occurrence'>('series');
  const [formError, setFormError] = useState<string | null>(null);
  const [advFilter, setAdvFilter] = useState<'all' | 'recurring' | 'single'>('all');
  const [tzMode, setTzMode] = useState<'local' | 'utc'>('local');
  const [filterTag, setFilterTag] = useState<string | 'all'>('all');
  const [history, setHistory] = useState<ScheduleItem[][]>([]);
  const [future, setFuture] = useState<ScheduleItem[][]>([]);
  const [form, setForm] = useState<{ title: string; subjectId: string | ''; date: string; start: string; end: string; location: string; note: string; recEnabled: boolean; recDays: number[]; recFrom: string; recUntil: string }>({
    title: '',
    subjectId: '',
    date: '',
    start: '07:00',
    end: '09:00',
    location: '',
    note: '',
    recEnabled: false,
    recDays: [],
    recFrom: '',
    recUntil: '',
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
    // Keyboard shortcuts: n (new), Ctrl+ArrowLeft/Right (navigate weeks), Ctrl+Z/Y (undo/redo)
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openCreate(new Date());
      }
      if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        setAnchor((prev) => new Date(prev.getTime() + (e.key === 'ArrowLeft' ? -7 : 7) * 86400000));
      }
      if (e.ctrlKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'z') undo(); else redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Undo/Redo helpers use history/future stacks; buttons will be disabled if stacks are empty
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [items, ...f]);
      setItems(prev);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [...h, items]);
      setItems(next);
      return f.slice(1);
    });
  };
  useEffect(() => {
    (async () => {
      if (!api.hasBackend()) { setItems([]); return; }
      setLoading(true); setError(null);
      try {
        // Load concrete events in range and all recurring series via a wide range
        const wideFrom = new Date(0); // 1970-01-01
        const wideTo = new Date('2100-01-01T00:00:00Z');
        const [inRange, allForSeries] = await Promise.all([
          api.listSchedules({ from: toISO(week.from), to: toISO(week.to), subjectId: filterSubjectId !== 'all' ? filterSubjectId : undefined }),
          api.listSchedules({ from: toISO(wideFrom), to: toISO(wideTo), subjectId: filterSubjectId !== 'all' ? filterSubjectId : undefined }),
        ]);
        const series = allForSeries.filter((x) => !!x.recurrenceRule);
        // Merge by id to avoid duplicates
        const byId = new Map<string, ScheduleItem>();
        [...inRange, ...series].forEach((it) => byId.set(it.id, it));
        setItems(Array.from(byId.values()));
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [week.from.getTime(), week.to.getTime(), filterSubjectId]);

  const showToast = (m: string) => onToast?.(m);

  // Colors
  const colorFromString = (s: string) => {
    let hash = 0; for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360; const sat = 60; const light = 35;
    return `hsl(${h}, ${sat}%, ${light}%)`;
  };
  const getItemColor = (i: ScheduleItem) => {
    const subj = subjects.find((s) => s.id === i.subjectId);
    if (subj && (subj as any).color) return (subj as any).color as string;
    if (subj) return colorFromString(subj.name);
    if (i.location) return colorFromString(i.location);
    return 'hsl(210,60%,35%)';
  };

  // Tags (parse from note as hashtags) e.g., #thi #on
  const parseTags = (note?: string | null) => {
    if (!note) return [] as string[];
    return Array.from(new Set((note.match(/#[\p{L}\w-]+/gu) || []).map(t => t.toLowerCase())));
  };
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => parseTags(i.note).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

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
      recEnabled: false,
      recDays: [],
      recFrom: `${yyyy}-${mm}-${dd}`,
      recUntil: '',
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
    setEditingOccurrenceDate(item.recurrenceRule ? `${yyyy}-${mm}-${dd}` : null);
    setEditScope(item.recurrenceRule ? 'occurrence' : 'series');
    setForm({
      title: item.title || '',
      subjectId: item.subjectId || '',
      date: `${yyyy}-${mm}-${dd}`,
      start: `${hh}:${mi}`,
      end: `${eh}:${em}`,
      location: item.location || '',
      note: item.note || '',
      recEnabled: !!item.recurrenceRule,
      recDays: item.recurrenceRule?.type === 'weekly' ? (item.recurrenceRule.days || []) : [],
      recFrom: item.recurrenceRule?.from ? item.recurrenceRule.from.slice(0, 10) : `${yyyy}-${mm}-${dd}`,
      recUntil: item.recurrenceRule?.until ? item.recurrenceRule.until.slice(0, 10) : '',
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

  function formatTime(dt: Date) {
    if (tzMode === 'utc') {
      const hh = String(dt.getUTCHours()).padStart(2, '0');
      const mm = String(dt.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm} UTC`;
    }
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ==========================
  // Export iCalendar (.ics)
  // ==========================
  function icsDate(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    // Use UTC for portability across calendar apps
    const yyyy = d.getUTCFullYear();
    const mm = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
  }

  const sanitizeText = (s: string) => {
    // Escape characters as per RFC 5545
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  };

  const buildWeekOccurrences = () => {
    const occs: Array<{ item: ScheduleItem; start: Date; end: Date; dateKey: string }> = [];
    days.forEach((date) => {
      const perDay = items
        .filter((it) => occursOnDate(it, date))
        .map((i) => {
          const s0 = new Date(i.startsAt);
          const e0 = new Date(i.endsAt);
          const startLocal = new Date(date);
          startLocal.setHours(s0.getHours(), s0.getMinutes(), 0, 0);
          const endLocal = new Date(date);
          endLocal.setHours(e0.getHours(), e0.getMinutes(), 0, 0);
          return { item: i, start: startLocal, end: endLocal, dateKey: ymd(date) };
        });
      occs.push(...perDay);
    });
    return occs;
  };

  const exportIcs = () => {
    const occs = buildWeekOccurrences();
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//StudentDocs//Schedule//VI',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    const now = new Date();
    occs.forEach(({ item, start, end, dateKey }) => {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${item.id}-${dateKey}@studentdocs.local`);
      lines.push(`DTSTAMP:${icsDate(now)}`);
      lines.push(`DTSTART:${icsDate(start)}`);
      lines.push(`DTEND:${icsDate(end)}`);
      const subj = subjects.find((s) => s.id === item.subjectId)?.name || '';
      const summary = item.title || subj || 'Sự kiện';
      if (summary) lines.push(`SUMMARY:${sanitizeText(summary)}`);
      if (item.location) lines.push(`LOCATION:${sanitizeText(item.location)}`);
      const descParts = [
        subj ? `Môn: ${subj}` : '',
        item.note ? `Ghi chú: ${item.note}` : '',
      ].filter(Boolean);
      if (descParts.length) lines.push(`DESCRIPTION:${sanitizeText(descParts.join('\n'))}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fromStr = week.from.toISOString().slice(0, 10);
    const toStr = new Date(week.to.getTime() - 1).toISOString().slice(0, 10);
    a.href = url;
    a.download = `timetable-${fromStr}-to-${toStr}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('Đã export .ics cho tuần này');
  };

  const saveModal = async () => {
    // basic validation
    setFormError(null);
    const [sh, sm] = form.start.split(':').map(Number);
    const [eh, em] = form.end.split(':').map(Number);
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    if (endM <= startM) {
      setFormError('Giờ kết thúc phải sau giờ bắt đầu');
      return;
    }
    if (form.recEnabled && form.recDays.length === 0) {
      setFormError('Khi bật lặp, vui lòng chọn ít nhất một thứ trong tuần');
      return;
    }
    if (form.recEnabled && form.recFrom && form.recUntil) {
      const fromD = new Date(form.recFrom);
      const untilD = new Date(form.recUntil);
      if (fromD.getTime() > untilD.getTime()) {
        setFormError('Ngày bắt đầu lặp phải trước hoặc bằng ngày kết thúc');
        return;
      }
    }
    const payload = {
      subjectId: form.subjectId || null,
      title: form.title || null,
      startsAt: combine(form.date, form.start),
      endsAt: combine(form.date, form.end),
      location: form.location || null,
      note: form.note || null,
      recurrenceRule: form.recEnabled && form.recDays.length > 0 ? {
        type: 'weekly' as const,
        days: form.recDays,
        from: form.recFrom ? new Date(form.recFrom + 'T00:00:00').toISOString() : undefined,
        until: form.recUntil ? new Date(form.recUntil + 'T23:59:59').toISOString() : undefined,
      } : null,
    };
    try {
      if (editing) {
        // If editing a recurring event and scope is occurrence-only, we add exception and create single override
        if (editing.recurrenceRule && editScope === 'occurrence') {
          const dateKey = editingOccurrenceDate;
          if (!dateKey) throw new Error('Missing occurrence date');
          const exceptions = Array.from(new Set([...(editing.recurrenceRule.exceptions || []), dateKey]));
          const updatedSeries = await api.updateSchedule(editing.id, {
            recurrenceRule: {
              type: 'weekly',
              days: editing.recurrenceRule.days ?? [],
              from: editing.recurrenceRule.from,
              until: editing.recurrenceRule.until,
              exceptions,
            },
          });
          const created = await api.createSchedule({
            subjectId: payload.subjectId,
            title: payload.title,
            startsAt: combine(dateKey, form.start),
            endsAt: combine(dateKey, form.end),
            location: payload.location,
            note: payload.note,
            recurrenceRule: null,
          });
          setItems((prev) => [...prev.map((i) => (i.id === editing.id ? updatedSeries : i)), created]);
          showToast?.('Đã cập nhật lần xuất hiện này');
        } else {
          const updated = await api.updateSchedule(editing.id, payload);
          setItems((prev) => prev.map((i) => (i.id === editing.id ? updated : i)));
          showToast?.('Đã cập nhật sự kiện');
        }
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
      if (item.recurrenceRule) {
        // Drag occurrence-only: add exception for original date, create override at target date
        const orig = new Date(item.startsAt);
        const dateKey = `${orig.getFullYear()}-${String(orig.getMonth() + 1).padStart(2, '0')}-${String(orig.getDate()).padStart(2, '0')}`;
        const exceptions = Array.from(new Set([...(item.recurrenceRule.exceptions || []), dateKey]));
        const updatedSeries = await api.updateSchedule(item.id, { recurrenceRule: { type: 'weekly', days: item.recurrenceRule.days ?? [], from: item.recurrenceRule.from, until: item.recurrenceRule.until, exceptions } });
        const created = await api.createSchedule({
          subjectId: item.subjectId ?? null,
          title: item.title ?? null,
          startsAt: startLocal.toISOString(),
          endsAt: endLocal.toISOString(),
          location: item.location ?? null,
          note: item.note ?? null,
          recurrenceRule: null,
        });
        setItems((prev) => [...prev.map((it) => (it.id === item.id ? updatedSeries : it)), created]);
        showToast?.('Đã di chuyển 1 lần xuất hiện');
      } else {
        const updated = await api.updateSchedule(id, { startsAt: startLocal.toISOString(), endsAt: endLocal.toISOString() });
        setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
        showToast?.('Đã di chuyển sự kiện');
      }
    } catch {
      showToast?.('Di chuyển thất bại');
    }
  };

  // Helpers for recurrence and date
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const occursOnDate = (it: ScheduleItem, date: Date) => {
    const dayIdx = ((date.getUTCDay() + 6) % 7) + 1; // 1..7 Mon..Sun
    if (!it.recurrenceRule) {
      const s = new Date(it.startsAt);
      return ymd(s) === ymd(date);
    }
    if (it.recurrenceRule.type !== 'weekly') return false;
    if (!it.recurrenceRule.days?.includes(dayIdx)) return false;
    const fromOk = it.recurrenceRule.from ? new Date(it.recurrenceRule.from) <= date : true;
    const untilOk = it.recurrenceRule.until ? date <= new Date(it.recurrenceRule.until) : true;
    if (!fromOk || !untilOk) return false;
    const ex = it.recurrenceRule.exceptions || [];
    if (ex.includes(ymd(date))) return false;
    return true;
  };
  const recurrenceSummary = (it: ScheduleItem) => {
    if (!it.recurrenceRule) return '';
    const daysMap = ['T2','T3','T4','T5','T6','T7','CN'];
    const dd = (it.recurrenceRule.days || []).map((d) => daysMap[d - 1]).join(', ');
    const from = it.recurrenceRule.from ? new Date(it.recurrenceRule.from).toLocaleDateString() : '—';
    const until = it.recurrenceRule.until ? new Date(it.recurrenceRule.until).toLocaleDateString() : '—';
    return `Lặp: ${dd} | từ ${from} đến ${until}`;
  };

  // Day column component
  const DayCol: React.FC<{ date: Date }> = ({ date }) => {
    const dayItems = items
      .filter((it) => occursOnDate(it, date))
      .filter((it) => (advFilter === 'all') || (advFilter === 'recurring' ? !!it.recurrenceRule : !it.recurrenceRule))
      .filter((it) => filterTag === 'all' ? true : parseTags(it.note).includes(filterTag));
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
        <div className="text-sm text-white/80 mb-2">
          {date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })}
        </div>
        <div className="flex flex-col gap-2 min-h-[60px]" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropToDate(e, date)}>
          {dayItems.map((i) => {
            const s = new Date(i.startsAt);
            const e = new Date(i.endsAt);
            const color = getItemColor(i);
            const isRec = !!i.recurrenceRule;
            return (
              <div key={`${i.id}-${isRec ? ymd(date) : ''}`} className="rounded border bg-white/5 border-white/15 p-2 shadow-sm"
                   draggable onDragStart={(e) => onDragStart(e, i.id)}
                   title={isRec ? recurrenceSummary(i) : undefined}
                   style={{ borderLeft: `4px solid ${color}` }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-white/90">{i.title || '(Không tiêu đề)'}</div>
                  {isRec && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-200">Lặp</span>}
                </div>
                <div className="text-xs text-white/70">
                  {formatTime(s)} – {formatTime(e)}
                  {i.location ? ` • ${i.location}` : ''}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <button onClick={() => openEdit(i)} className="px-2 py-1 text-xs rounded bg-white/10 border border-white/20 hover:bg-white/15">Sửa</button>
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
      {/* Sticky toolbar container */}
      <div className="sticky top-2 z-10 mb-3 rounded-lg border border-white/10 bg-slate-900/70 backdrop-blur p-2">
      {/* Row 1: Week navigation + quick actions */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(new Date(anchor.getTime() - 7 * 86400000))} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15">◀ Tuần trước</button>
          <button onClick={() => setAnchor(new Date())} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15">📅 Tuần này</button>
          <button onClick={() => setAnchor(new Date(anchor.getTime() + 7 * 86400000))} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15">Tuần sau ▶</button>
          <div className="ml-2 text-white/80 text-sm">
            {week.from.toLocaleDateString()} – {new Date(week.to.getTime() - 1).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openCreate(new Date())} className="px-3 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25">➕ Sự kiện</button>
          <button onClick={exportIcs} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15 text-sm" title="Tải .ics tuần này">⬇️ Export .ics</button>
          <button onClick={() => setTzMode(tzMode === 'local' ? 'utc' : 'local')} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15 text-sm" title="Chuyển đổi múi giờ hiển thị">
            🌐 {tzMode === 'local' ? 'Local' : 'UTC'}
          </button>
          <button onClick={undo} disabled={history.length === 0} className={`px-3 py-1 rounded-md border text-sm ${history.length === 0 ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/15'}`} title="Hoàn tác (Ctrl+Z)">↶</button>
          <button onClick={redo} disabled={future.length === 0} className={`px-3 py-1 rounded-md border text-sm ${future.length === 0 ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/15'}`} title="Làm lại (Ctrl+Y)">↷</button>
        </div>
      </div>

      {/* Row 2: Collapsible filters */}
      <details className="group rounded-lg border border-white/10 bg-white/5 open:bg-white/7">
        <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between">
          <div className="text-sm font-medium text-white/80">Lọc</div>
          <span className="text-xs text-white/60 group-open:rotate-180 transition">▾</span>
        </summary>
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={filterSubjectId} onChange={(e) => setFilterSubjectId(e.target.value as any)} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 text-white text-sm">
              <option value="all">Tất cả môn</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select value={filterTag} onChange={(e) => setFilterTag(e.target.value as any)} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 text-white text-sm">
              <option value="all">Tất cả tag</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={advFilter} onChange={(e) => setAdvFilter(e.target.value as any)} className="px-3 py-1 rounded-md bg-white/10 border border-white/15 text-white text-sm">
              <option value="all">Tất cả</option>
              <option value="recurring">Chỉ lặp</option>
              <option value="single">Chỉ đơn lẻ</option>
            </select>
            <div className="text-xs text-white/60">Mẹo: nhấn N để tạo nhanh; Ctrl+←/→ để đổi tuần</div>
          </div>
        </div>
      </details>
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
                {formError && <div className="text-sm text-red-300">{formError}</div>}
                <label className="text-sm">Môn học
                  <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20">
                    <option value="">(Không liên kết)</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                {editing && editing.recurrenceRule && (
                  <div className="border-t border-white/10 pt-3">
                    <div className="text-sm mb-2">Áp dụng thay đổi cho:</div>
                    <div className="flex gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={editScope === 'occurrence'} onChange={() => setEditScope('occurrence')} /> Chỉ lần này ({editingOccurrenceDate})
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={editScope === 'series'} onChange={() => setEditScope('series')} /> Cả chuỗi
                      </label>
                    </div>
                  </div>
                )}
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
                <label className="text-sm">Ghi chú (có thể thêm #tag, ví dụ: #thi #on)
                  <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" rows={3} />
                </label>
                <div className="border-t border-white/10 pt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.recEnabled} onChange={(e) => setForm({ ...form, recEnabled: e.target.checked })} />
                    Lặp hàng tuần
                  </label>
                  {form.recEnabled && (
                    <div className="mt-3 p-2 rounded border border-white/10 bg-white/5">
                      <div className="text-xs text-white/70 mb-2">Chọn các ngày trong tuần</div>
                      <div className="flex flex-wrap gap-2">
                        {['T2','T3','T4','T5','T6','T7','CN'].map((d, idx) => {
                          const val = idx + 1; // 1..7
                          const active = form.recDays.includes(val);
                          return (
                            <button key={val} type="button" onClick={() => setForm({ ...form, recDays: active ? form.recDays.filter(x => x !== val) : [...form.recDays, val].sort((a,b)=>a-b) })} className={`px-2 py-1 rounded border text-xs ${active ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' : 'bg-white/10 border-white/20'}`}>{d}</button>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <label className="text-sm block">Ngày bắt đầu lặp
                          <input type="date" value={form.recFrom} onChange={(e) => setForm({ ...form, recFrom: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" />
                        </label>
                        <label className="text-sm block">Lặp đến ngày (tuỳ chọn)
                          <input type="date" value={form.recUntil} onChange={(e) => setForm({ ...form, recUntil: e.target.value })} className="mt-1 w-full px-3 py-2 rounded bg-white/10 border border-white/20" />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  {editing && (
                    <button onClick={async () => {
                      if (editing.recurrenceRule) {
                        if (!window.confirm('Bạn có chắc muốn xóa cả chuỗi sự kiện?')) return;
                      } else {
                        if (!window.confirm('Bạn có chắc muốn xóa sự kiện này?')) return;
                      }
                      await remove(editing.id);
                      setIsModalOpen(false);
                    }} className="px-3 py-2 rounded bg-red-500/20 border border-red-500/40 text-red-200">Xóa</button>
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
