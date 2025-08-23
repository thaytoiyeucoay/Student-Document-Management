import React, { useEffect, useMemo, useRef, useState } from 'react';
import { semesters, compareSemesters, parseSemester } from '../semesters';
import type { Subject } from '../../types';

export type Letter = 'A+'|'A'|'B+'|'B'|'C+'|'C'|'D+'|'D'|'F';

export interface CourseGrade {
  id: string;
  name: string;
  credits: number; // số tín chỉ
  letter: Letter;  // điểm chữ theo thang 4
  semester: string; // ví dụ 2025.1
}

const LETTER_POINTS: Record<Letter, number> = {
  'A+': 4.0,
  'A': 4.0,
  'B+': 3.5,
  'B': 3.0,
  'C+': 2.5,
  'C': 2.0,
  'D+': 1.5,
  'D': 1.0,
  'F': 0,
};

function calcGPA(courses: CourseGrade[]): number {
  const { totalCredits, totalPoints } = courses.reduce(
    (acc, c) => {
      const pts = LETTER_POINTS[c.letter] ?? 0;
      acc.totalCredits += c.credits;
      acc.totalPoints += c.credits * pts;
      return acc;
    },
    { totalCredits: 0, totalPoints: 0 }
  );
  if (!totalCredits) return 0;
  return Number((totalPoints / totalCredits).toFixed(2));
}

function groupBySemester(items: CourseGrade[]): Record<string, CourseGrade[]> {
  return items.reduce((acc, it) => {
    (acc[it.semester] ||= []).push(it);
    return acc;
  }, {} as Record<string, CourseGrade[]>);
}

function useLocalGrades() {
  const [grades, setGrades] = useState<CourseGrade[]>(() => {
    try {
      const raw = localStorage.getItem('grades');
      const v = raw ? (JSON.parse(raw) as CourseGrade[]) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try { localStorage.setItem('grades', JSON.stringify(grades)); } catch {}
  }, [grades]);
  return { grades, setGrades } as const;
}

const GradeForm: React.FC<{ onSubmit: (c: Omit<CourseGrade, 'id'>) => void; initial?: Omit<CourseGrade, 'id'>; onCancel?: () => void; }>
  = ({ onSubmit, initial, onCancel }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [credits, setCredits] = useState<number>(initial?.credits ?? 3);
  const [letter, setLetter] = useState<Letter>(initial?.letter ?? 'A');
  const [semester, setSemester] = useState<string>(initial?.semester ?? semesters[0]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const creditsInt = Math.max(0, Math.floor(Number(credits)) || 0);
        onSubmit({ name, credits: creditsInt, letter, semester });
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Môn học</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên môn" title="Môn học" className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Số tín chỉ</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={credits}
            onChange={e => setCredits(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            placeholder="VD: 3"
            title="Số tín chỉ (số nguyên)"
            className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Điểm chữ</label>
          <div className="flex items-center gap-2">
            <select value={letter} onChange={e => setLetter(e.target.value as Letter)} title="Điểm chữ" className="flex-1 px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15">
              {(['A+','A','B+','B','C+','C','D+','D','F'] as Letter[]).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <span className="shrink-0 text-xs text-white/70">= {LETTER_POINTS[letter].toFixed(1)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/70">Học kỳ</label>
          <select value={semester} onChange={e => setSemester(e.target.value)} title="Học kỳ" className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15">
            {semesters.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm">Lưu</button>
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-sm">Hủy</button>}
      </div>
      <div className="mt-1 text-xs text-white/70 flex items-start gap-2">
        <span title="Giải thích thang điểm">ℹ️</span>
        <span>
          Thang 4.0: A/A+ = 4.0; B+ = 3.5; B = 3.0; C+ = 2.5; C = 2.0; D+ = 1.5; D = 1.0; F = 0.
          GPA mỗi kỳ = trung bình có trọng số theo tín chỉ. CPA = GPA cộng dồn qua các kỳ.
        </span>
      </div>
    </form>
  );
};

const GradesDashboard: React.FC<{ subjects?: Subject[]; onOpenDocs?: (subjectName: string) => void }> = ({ subjects = [], onOpenDocs }) => {
  const { grades, setGrades } = useLocalGrades();

  // Filters
  const [filterYear, setFilterYear] = useState<'all' | 2022 | 2023 | 2024 | 2025>('all');
  const [filterTerm, setFilterTerm] = useState<'all' | 1 | 2>('all');

  // Sort for display
  const gradesSorted = useMemo(() => {
    const filtered = grades.filter(g => {
      const parsed = parseSemester(g.semester);
      if (!parsed) return false;
      if (filterYear !== 'all' && parsed.year !== filterYear) return false;
      if (filterTerm !== 'all' && parsed.term !== filterTerm) return false;
      return true;
    });
    return filtered.sort((a, b) => compareSemesters(a.semester, b.semester) || a.name.localeCompare(b.name));
  }, [grades, filterYear, filterTerm]);

  // GPA từng kỳ
  const bySem = useMemo(() => groupBySemester(gradesSorted), [gradesSorted]);
  const semKeys = useMemo(() => Object.keys(bySem).sort(compareSemesters), [bySem]);
  const gpaBySem = semKeys.map(s => ({ semester: s, gpa: calcGPA(bySem[s]) }));

  // CPA (cộng dồn)
  const cpaPoints = useMemo(() => {
    let cumCourses: CourseGrade[] = [];
    return gpaBySem.map(({ semester }) => {
      cumCourses = cumCourses.concat(bySem[semester]);
      return { semester, cpa: calcGPA(cumCourses) };
    });
  }, [gpaBySem, bySem]);

  const overallCPA = useMemo(() => calcGPA(gradesSorted), [gradesSorted]);

  // Distribution of letter grades (current filtered list)
  const lettersOrder: Letter[] = ['A+','A','B+','B','C+','C','D+','D','F'];
  const distribution = useMemo(() => {
    const cnt: Record<Letter, number> = { 'A+':0,'A':0,'B+':0,'B':0,'C+':0,'C':0,'D+':0,'D':0,'F':0 };
    for (const g of gradesSorted) cnt[g.letter]++;
    const maxCount = Math.max(1, ...lettersOrder.map(l => cnt[l]));
    return { data: lettersOrder.map(l => ({ label: l, value: cnt[l] })), max: maxCount };
  }, [gradesSorted]);

  const addCourse = (c: Omit<CourseGrade, 'id'>) => {
    setGrades(gs => [{ id: String(Date.now() + Math.random()), ...c }, ...gs]);
  };
  const deleteCourse = (id: string) => setGrades(gs => gs.filter(x => x.id !== id));
  const [editing, setEditing] = useState<CourseGrade | null>(null);
  const saveEdit = (payload: Omit<CourseGrade, 'id'>) => {
    if (!editing) return;
    setGrades(gs => gs.map(x => x.id === editing.id ? { ...editing, ...payload } : x));
    setEditing(null);
  };

  // Simple inline charts with hover tooltips (no external deps)
  const Tooltip: React.FC<{ show: boolean; x: number; y: number; children: React.ReactNode }> = ({ show, x, y, children }) => (
    <div
      className={`pointer-events-none fixed z-50 px-2 py-1 rounded bg-black/80 text-white text-xs transition-opacity ${show ? 'opacity-100' : 'opacity-0'}`}
      style={{ left: x + 12, top: y + 12 }}
    >
      {children}
    </div>
  );
  const BarChart: React.FC<{ data: { label: string; value: number }[]; max?: number }>
    = ({ data, max = 4 }) => {
    const w = 560, h = 160, pad = 24;
    const bw = Math.max(6, (w - pad * 2) / Math.max(1, data.length) - 8);
    const [tt, setTt] = useState<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: '' });
    const wrapRef = useRef<HTMLDivElement | null>(null);
    return (
      <div ref={wrapRef} className="relative">
        <svg width={w} height={h} className="w-full h-40"
          onMouseLeave={() => setTt(s => ({ ...s, show: false }))}
        >
          <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" className="text-white/20" />
          {data.map((d, i) => {
            const x = pad + i * (bw + 8);
            const barH = (d.value / max) * (h - pad * 2);
            const y = h - pad - barH;
            return (
              <g key={i}
                 onMouseMove={(e) => setTt({ show: true, x: e.clientX, y: e.clientY, text: `${d.label}: ${d.value.toFixed(2)}` })}
              >
                <rect x={x} y={y} width={bw} height={Math.max(0, barH)} className="fill-emerald-500/70" />
                <text x={x + bw / 2} y={h - pad + 12} textAnchor="middle" className="fill-current text-[10px]">{d.label}</text>
                <text x={x + bw / 2} y={y - 4} textAnchor="middle" className="fill-current text-[10px]">{d.value.toFixed(2)}</text>
              </g>
            );
          })}
        </svg>
        <Tooltip show={tt.show} x={tt.x} y={tt.y}>{tt.text}</Tooltip>
      </div>
    );
  };
  const LineChart: React.FC<{ data: { label: string; value: number }[]; max?: number }>
    = ({ data, max = 4 }) => {
    const w = 560, h = 160, pad = 24;
    const [tt, setTt] = useState<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: '' });
    const points = data.map((d, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
      const y = h - pad - (d.value / max) * (h - pad * 2);
      return [x, y] as const;
    });
    const path = points.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(' ');
    return (
      <div className="relative">
        <svg width={w} height={h} className="w-full h-40"
          onMouseLeave={() => setTt(s => ({ ...s, show: false }))}
        >
          <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" className="text-white/20" />
          <path d={path} stroke="currentColor" className="text-sky-400" fill="none" strokeWidth={2} />
          {points.map(([x, y], i) => (
            <g key={i}
              onMouseMove={(e) => setTt({ show: true, x: e.clientX, y: e.clientY, text: `${data[i].label}: ${data[i].value.toFixed(2)}` })}
            >
              <circle cx={x} cy={y} r={3} className="fill-sky-400" />
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
            const y = h - pad - (d.value / max) * (h - pad * 2);
            return <text key={i} x={x} y={y - 6} textAnchor="middle" className="fill-current text-[10px]">{d.value.toFixed(2)}</text>;
          })}
        </svg>
        <Tooltip show={tt.show} x={tt.x} y={tt.y}>{tt.text}</Tooltip>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white/95">Điểm học phần (hệ số 4)</h2>
        <p className="text-white/60 text-sm">A/A+: 4.0; B+: 3.5; B: 3.0; C+: 2.5; C: 2.0; D+: 1.5; D: 1.0; F: 0</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-white/80 text-sm">Năm:</label>
        <select value={String(filterYear)} onChange={(e) => setFilterYear((e.target.value === 'all' ? 'all' : Number(e.target.value)) as any)} className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15">
          <option value="all">Tất cả</option>
          {[2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="text-white/80 text-sm">Kỳ:</label>
        <select value={String(filterTerm)} onChange={(e) => setFilterTerm((e.target.value === 'all' ? 'all' : Number(e.target.value)) as any)} className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15">
          <option value="all">Tất cả</option>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      </div>

      <div className="rounded-xl bg-white/10 border border-white/15 p-4">
        <GradeForm onSubmit={addCourse} />
      </div>

      {/* Import from existing subjects */}
      {subjects.length > 0 && (
        <div className="rounded-xl bg-white/10 border border-white/15 p-4">
          <div className="mb-2 text-white/80 text-sm">Nhập từ môn hiện có</div>
          <ImportFromSubjects
            subjects={useMemo(() => {
              const existing = new Set(grades.map(g => g.name.trim().toLowerCase()));
              return subjects.filter(s => !existing.has(s.name.trim().toLowerCase()));
            }, [subjects, grades])}
            onAdd={addCourse}
          />
        </div>
      )}

      <div className="rounded-xl bg-white/5 border border-white/10">
        <div className="px-4 py-3 border-b border-white/10 text-white/80 text-sm">Danh sách môn (nhóm theo năm)</div>
        <div className="divide-y divide-white/5">
          {gradesSorted.length === 0 && (
            <div className="px-4 py-6 text-white/60 text-sm">Chưa có dữ liệu, hãy thêm môn học ở trên.</div>
          )}
          {Object.entries(groupByYear(gradesSorted)).map(([year, items]) => (
            <div key={year}>
              <div className="px-4 py-2 text-white/70 text-xs uppercase tracking-wide bg-white/5">Năm {year}</div>
              {items.map(g => (
                <div key={g.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-white/95 font-medium truncate">{g.name}</div>
                    <div className="text-white/60 text-xs">Kỳ {g.semester} • {g.credits} tín chỉ • {g.letter} ({LETTER_POINTS[g.letter].toFixed(1)})</div>
                  </div>
                  {onOpenDocs && subjects.some(s => s.name.trim().toLowerCase() === g.name.trim().toLowerCase()) && (
                    <button
                      onClick={() => onOpenDocs(g.name)}
                      className="px-3 py-1.5 rounded-md text-xs bg-white/10 border border-white/20 text-white/90"
                      title="Mở tài liệu của môn này"
                    >Tài liệu</button>
                  )}
                  <button onClick={() => setEditing(g)} className="px-3 py-1.5 rounded-md text-xs bg-white/10 border border-white/20 text-white/90">Sửa</button>
                  <button onClick={() => deleteCourse(g.id)} className="px-3 py-1.5 rounded-md text-xs bg-red-600/80 text-white">Xóa</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="rounded-xl bg-white/10 border border-white/15 p-4">
          <div className="mb-2 text-white/80 text-sm">Sửa môn: {editing.name}</div>
          <GradeForm onSubmit={saveEdit} initial={{ name: editing.name, credits: editing.credits, letter: editing.letter, semester: editing.semester }} onCancel={() => setEditing(null)} />
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white/10 border border-white/15 p-4">
          <div className="mb-2 text-white/80 text-sm">GPA theo học kỳ</div>
          <BarChart data={gpaBySem.map(x => ({ label: x.semester, value: x.gpa }))} />
        </div>
        <div className="rounded-xl bg-white/10 border border-white/15 p-4">
          <div className="mb-2 text-white/80 text-sm">CPA toàn khóa</div>
          <LineChart data={cpaPoints.map(x => ({ label: x.semester, value: x.cpa }))} />
          <div className="mt-2 text-white/90 text-sm">CPA hiện tại: <span className="font-semibold">{overallCPA.toFixed(2)}</span></div>
        </div>
        <div className="rounded-xl bg-white/10 border border-white/15 p-4">
          <div className="mb-2 text-white/80 text-sm">Phân bố điểm chữ</div>
          <BarChart data={distribution.data} max={distribution.max} />
        </div>
      </div>
    </div>
  );
};

export default GradesDashboard;

// Helpers
function groupByYear(items: CourseGrade[]): Record<string, CourseGrade[]> {
  const out: Record<string, CourseGrade[]> = {};
  for (const it of items) {
    const parsed = parseSemester(it.semester);
    if (!parsed) continue;
    const key = String(parsed.year);
    (out[key] ||= []).push(it);
  }
  return out;
}

const ImportFromSubjects: React.FC<{ subjects: Subject[]; onAdd: (c: Omit<CourseGrade, 'id'>) => void }>
  = ({ subjects, onAdd }) => {
  const [selected, setSelected] = useState<string>(subjects[0]?.id ?? '');
  const [credits, setCredits] = useState<number>(3);
  const [letter, setLetter] = useState<Letter>('A');
  // Ensure selected stays valid when the list changes
  useEffect(() => {
    if (!subjects.find(s => s.id === selected)) {
      setSelected(subjects[0]?.id ?? '');
    }
  }, [subjects, selected]);
  const add = () => {
    const s = subjects.find(x => x.id === selected);
    if (!s) return;
    const semester = s.semester || semesters[0];
    onAdd({ name: s.name, credits, letter, semester });
  };
  if (subjects.length === 0) {
    return <div className="text-white/70 text-sm">Tất cả môn đã có điểm. Không còn môn để nhập.</div>;
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/70">Môn</label>
        <select value={selected} onChange={e => setSelected(e.target.value)} title="Môn" className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15">
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name} {s.semester ? `(${s.semester})` : ''}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/70">Số tín chỉ</label>
        <input type="number" inputMode="numeric" min={0} step={1} value={credits} onChange={e => setCredits(Math.max(0, Math.floor(Number(e.target.value) || 0)))} placeholder="VD: 3" title="Số tín chỉ (số nguyên)" className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm w-24 dark:bg-white/10 dark:border-white/15" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/70">Điểm chữ</label>
        <select value={letter} onChange={e => setLetter(e.target.value as Letter)} title="Điểm chữ" className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm dark:bg-white/10 dark:border-white/15">
          {(['A+','A','B+','B','C+','C','D+','D','F'] as Letter[]).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <button onClick={add} className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm">Thêm</button>
    </div>
  );
};
