import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import type { Subject } from '../../types';

// Types for the mock learning plan
export type MockPlanItem = {
  id: string;
  subjectId: string;
  title: string;
  startsAt: string; // ISO string
  endsAt: string;   // ISO string
  focus?: string;
  docRefs?: string[];
};

export type GenerateForm = {
  goal: string;
  deadline: string; // date string
  hoursPerWeek: number;
  availableDays: string[]; // mon..sun
  preferredTime: string; // e.g. "19:00-21:00"
  subjects: string[]; // subject ids
  level: 'beginner' | 'intermediate' | 'advanced';
};

const ALL_DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Thứ 2' },
  { key: 'tue', label: 'Thứ 3' },
  { key: 'wed', label: 'Thứ 4' },
  { key: 'thu', label: 'Thứ 5' },
  { key: 'fri', label: 'Thứ 6' },
  { key: 'sat', label: 'Thứ 7' },
  { key: 'sun', label: 'Chủ nhật' },
];

function cx(base: string, active: boolean): string {
  return `${base} ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseTimeRange(range: string): [number, number] | null {
  const m = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [_, h1, m1, h2, m2] = m;
  const start = parseInt(h1) * 60 + parseInt(m1);
  const end = parseInt(h2) * 60 + parseInt(m2);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return [start, end];
}

function minutesToISO(date: Date, minutes: number) {
  const d = new Date(date);
  d.setHours(0, minutes, 0, 0);
  return d.toISOString();
}

export default function LearningPathWizard({ subjects: subjectsProp, onApplied, onToast }: {
  subjects?: Subject[];
  onApplied?: (createdCount: number) => void;
  onToast?: (msg: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [subjects, setSubjects] = useState<Subject[]>(subjectsProp || []);

  const [form, setForm] = useState<GenerateForm>({
    goal: '',
    deadline: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    hoursPerWeek: 6,
    availableDays: ['mon', 'wed', 'fri'],
    preferredTime: '19:00-21:00',
    subjects: [],
    level: 'beginner',
  });

  const [plan, setPlan] = useState<MockPlanItem[]>([]);

  useEffect(() => {
    if (subjectsProp && subjectsProp.length) return; // use provided
    (async () => {
      if (!api.hasBackend()) return; // fallback: keep initial list empty
      try {
        const subs = await api.listSubjects();
        setSubjects(subs);
      } catch {
        // silent
      }
    })();
  }, [subjectsProp]);

  const selectedSubjects = useMemo(() => subjects.filter(s => form.subjects.includes(s.id)), [subjects, form.subjects]);

  const canNext1 = form.goal.trim().length >= 6 && !!form.deadline;
  const canNext2 = form.hoursPerWeek > 0 && form.availableDays.length > 0 && !!parseTimeRange(form.preferredTime);
  const canNext3 = form.subjects.length > 0;

  const handleGenerate = async () => {
    // If backend exists, call API to generate; else, fallback to mock
    if (api.hasBackend()) {
      try {
        const res = await api.learningPathGenerate({
          goal: form.goal,
          deadline: form.deadline,
          hours_per_week: form.hoursPerWeek,
          available_days: form.availableDays,
          preferred_time: form.preferredTime,
          subjects: form.subjects,
          level: form.level,
        });
        const items: MockPlanItem[] = (res.plan || []).map((it, i) => ({
          id: `${Date.now()}_${i}`,
          subjectId: it.subject_id || '',
          title: it.title || `Phiên học ${i + 1}`,
          startsAt: it.starts_at,
          endsAt: it.ends_at,
          focus: it.focus,
          docRefs: it.doc_refs || [],
        }));
        setPlan(items);
        setStep(4);
        onToast?.(`Đã sinh lộ trình từ backend: ${items.length} phiên`);
        return;
      } catch (e: any) {
        onToast?.('Sinh lộ trình thất bại, dùng bản nháp (mock)');
        // fallback to mock below
      }
    }

    // Mock generation fallback
    const range = parseTimeRange(form.preferredTime) || [19 * 60, 21 * 60];
    const [startM, endM] = range;
    const sessionMinutes = Math.min(120, Math.max(60, Math.round((form.hoursPerWeek * 60) / Math.max(1, form.availableDays.length))));

    const today = new Date();
    const deadline = new Date(form.deadline + 'T23:59:59');

    const items: MockPlanItem[] = [];
    let cur = new Date(today);
    let idCounter = 0;

    while (cur <= deadline && items.length < 12) { // cap preview to 12 items
      const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][cur.getDay()];
      if (form.availableDays.includes(dayKey)) {
        const subjectId = form.subjects[(items.length) % form.subjects.length];
        const title = `Phiên học ${items.length + 1} — ${form.level === 'beginner' ? 'Cơ bản' : form.level === 'intermediate' ? 'Ôn tập' : 'Nâng cao'}`;
        const startISO = minutesToISO(cur, startM);
        const endISO = minutesToISO(cur, Math.min(endM, startM + sessionMinutes));
        items.push({
          id: `${Date.now()}_${idCounter++}`,
          subjectId,
          title,
          startsAt: startISO,
          endsAt: endISO,
          focus: form.goal,
          docRefs: [],
        });
      }
      cur = addDays(cur, 1);
    }

    setPlan(items);
    setStep(4);
  };

  const handleApply = async () => {
    if (!plan.length) return;
    if (api.hasBackend()) {
      try {
        const payload = plan.map(it => ({
          subject_id: it.subjectId || null,
          title: it.title || null,
          starts_at: it.startsAt,
          ends_at: it.endsAt,
          focus: it.focus || null,
          doc_refs: it.docRefs || null,
        }));
        const res = await api.learningPathApply(payload);
        onToast?.(`Đã tạo ${res.created} lịch học`);
        onApplied?.(res.created);
        return;
      } catch (e: any) {
        onToast?.('Áp dụng thất bại. Vui lòng thử lại.');
        return;
      }
    }
    // Mock-only path
    onToast?.('Đây là bản nháp (mock). Chưa ghi vào lịch thực tế.');
    onApplied?.(plan.length);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">✨ Lộ trình học tập cá nhân hóa</h2>
        <div className="text-sm text-slate-600 dark:text-slate-300">Bước {step} / 4</div>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-4 gap-2">
        {['Mục tiêu', 'Thời gian rảnh', 'Môn học', 'Preview'].map((label, idx) => (
          <div key={label} className={`px-3 py-2 rounded-lg text-center text-sm font-medium border ${step === (idx+1) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'}`}>{label}</div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Mục tiêu học tập</label>
            <textarea
              className="mt-1 w-full px-3 py-2 rounded-lg border bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
              placeholder="VD: Ôn thi Toán rời rạc chương 1-3, làm 50 bài tập"
              value={form.goal}
              onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Deadline</label>
              <input type="date" className="mt-1 w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Mức độ</label>
              <select className="mt-1 w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800" value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value as any }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Giờ/tuần</label>
              <input type="number" min={1} className="mt-1 w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800" value={form.hoursPerWeek} onChange={e => setForm(f => ({ ...f, hoursPerWeek: Number(e.target.value || 0) }))} />
            </div>
          </div>
          <div className="flex justify-end">
            <button disabled={!canNext1} onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Tiếp tục</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Ngày rảnh</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_DAYS.map(d => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, availableDays: f.availableDays.includes(d.key) ? f.availableDays.filter(x => x !== d.key) : [...f.availableDays, d.key] }))}
                  className={cx('px-3 py-1.5 rounded-lg border text-sm', form.availableDays.includes(d.key))}
                >{d.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Khung giờ ưa thích</label>
            <input
              className="mt-1 w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800"
              placeholder="VD: 19:00-21:00"
              value={form.preferredTime}
              onChange={e => setForm(f => ({ ...f, preferredTime: e.target.value }))}
            />
            <p className="text-xs text-slate-500 mt-1">Định dạng HH:MM-HH:MM (24h)</p>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg border">Quay lại</button>
            <button disabled={!canNext2} onClick={() => setStep(3)} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Tiếp tục</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Chọn môn học</label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {subjects.map(s => {
                const active = form.subjects.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => setForm(f => ({ ...f, subjects: active ? f.subjects.filter(id => id !== s.id) : [...f.subjects, s.id] }))} className={cx('px-3 py-2 rounded-lg border text-left', active)}>
                    <div className="text-sm font-semibold">{s.name}</div>
                    {s.semester && <div className="text-xs text-slate-500">Kỳ: {s.semester}</div>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg border">Quay lại</button>
            <button disabled={!canNext3} onClick={handleGenerate} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">Tạo lộ trình</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-300">Mục tiêu</div>
              <div className="font-semibold">{form.goal || '—'}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300 mt-2">Môn học</div>
              <div className="text-sm">{selectedSubjects.map(s => s.name).join(', ') || '—'}</div>
            </div>
            <div className="text-right text-sm">
              <div>Deadline: <b>{form.deadline}</b></div>
              <div>Giờ/tuần: <b>{form.hoursPerWeek}</b></div>
              <div>Khung giờ: <b>{form.preferredTime}</b></div>
              <div>Mức độ: <b>{form.level}</b></div>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left">Thời gian</th>
                  <th className="px-3 py-2 text-left">Tiêu đề</th>
                  <th className="px-3 py-2 text-left">Môn</th>
                  <th className="px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {plan.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">Chưa có phiên học nào. Quay lại bước 3 để tạo.</td>
                  </tr>
                )}
                {plan.map(it => {
                  const subj = subjects.find(s => s.id === it.subjectId);
                  return (
                    <tr key={it.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2 align-top whitespace-nowrap">{new Date(it.startsAt).toLocaleString()} → {new Date(it.endsAt).toLocaleTimeString()}</td>
                      <td className="px-3 py-2 align-top">{it.title}</td>
                      <td className="px-3 py-2 align-top">{subj?.name || it.subjectId}</td>
                      <td className="px-3 py-2 align-top text-slate-600">{it.focus || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <div className="flex gap-2">
              <button onClick={() => setStep(3)} className="px-4 py-2 rounded-lg border">Quay lại</button>
              <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg border">Làm lại</button>
            </div>
            <button disabled={plan.length === 0} onClick={handleApply} className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50">
              Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
