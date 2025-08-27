// import thư viện cần thiết
import { useState, useEffect, useMemo, useRef } from 'react'; //hook của react để quản lý state và lifecycle
import api from './api'; //api để giao tiếp với backend
import ScheduleWeek from './components/ScheduleWeek'; //component để hiển thị lịch
import DocumentList from './components/DocumentList'; //component để hiển thị danh sách tài liệu
import AddDocumentForm from './components/AddDocumentForm'; //component để thêm tài liệu
import SubjectList from './components/SubjectList'; //component để hiển thị danh sách môn học
import AddSubjectForm from './components/AddSubjectForm'; //component để thêm môn học
import { initialSubjects, initialDocuments } from './data'; //dữ liệu ban đầu
import type { Document, Subject } from '../types'; //kiểu dữ liệu
import { semesters, compareSemesters } from './semesters';
import RAGChat from './components/RAGChat';
import AuthBar from './components/AuthBar';
import SubjectKanban from './components/SubjectKanban';
import GradesDashboard from './components/GradesDashboard';
import ImagesToPdf from './components/ImagesToPdf';
import FreeOcr from './components/FreeOcr';
import useAuth from './hooks/useAuth';
import AuthCard from './components/AuthCard';

function App() {
  const { session, loading } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects); //state để lưu danh sách môn học
  const [docs, setDocs] = useState<Document[]>(initialDocuments); //state để lưu danh sách tài liệu
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(subjects[0]?.id || null); //state để lưu môn học được chọn
  const [view, setView] = useState<'docs' | 'schedule' | 'grades'>('docs'); //state để lưu view hiện tại
  const [search, setSearch] = useState(''); //state để lưu từ khóa tìm kiếm
  const [sortKey, setSortKey] = useState<'date' | 'name'>('date'); //state để lưu key sắp xếp
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc'); //state để lưu direction sắp xếp
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]); //state để lưu toast
  const [showFavOnly, setShowFavOnly] = useState(false); //state để lưu view chỉ hiển thị tài liệu yêu thích
  const [page, setPage] = useState(1); //state để lưu trang hiện tại
  const pageSize = 6; //số tài liệu hiển thị trên mỗi trang
  const searchInputRef = useRef<HTMLInputElement | null>(null); //ref để focus vào input tìm kiếm
  const mainRef = useRef<HTMLDivElement | null>(null); //ref để scroll vào main
  const addFormRef = useRef<HTMLDivElement | null>(null); //ref đến form thêm tài liệu
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null); //state để lưu tài liệu được preview
  const [showAddForm, setShowAddForm] = useState<boolean>(false); // ẩn/hiện form thêm tài liệu
  const [currentSemester, setCurrentSemester] = useState<string>(() => {
    try {
      return localStorage.getItem('currentSemester') || '2025.1';
    } catch {
      return '2025.1';
    }
  });
  const [showImagesToPdf, setShowImagesToPdf] = useState<boolean>(false);
  const [showFreeOcr, setShowFreeOcr] = useState<boolean>(false);
  const [dashboardExpanded, setDashboardExpanded] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  // Inline login/register states removed (AuthCard handles UI and logic)
  // Theme state: light | dark
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    // Apply class to <html> for Tailwind dark mode
    const el = document.documentElement;
    if (theme === 'dark') el.classList.add('dark'); else el.classList.remove('dark');
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    // Xóa URL object khi component unmount
    return () => {
      docs.forEach(doc => {
        if (doc.fileUrl) {
          URL.revokeObjectURL(doc.fileUrl);
        }
      });
    };
  }, [docs]);

  // Tải dữ liệu từ backend nếu có cấu hình; nếu không thì từ localStorage
  useEffect(() => {
    (async () => {
      if (api.hasBackend()) {
        // Nếu có backend nhưng chưa có session -> chờ đăng nhập để tránh gọi 401
        if (!session) return;
        try {
          const subs = await api.listSubjects();
          setSubjects(subs);
          const pick = subs.find(s => s.semester === currentSemester) ?? subs[0];
          const firstId = pick?.id ?? null;
          setSelectedSubjectId(firstId);
          if (firstId) {
            const list = await api.listDocuments(firstId);
            setDocs(list);
          } else {
            setDocs([]);
          }
          return;
        } catch (e) {
          console.warn('Backend fetch failed, falling back to localStorage', e);
        }
      }
      try {
        const s = localStorage.getItem('subjects');
        const d = localStorage.getItem('docs');
        if (s) {
          const parsed = JSON.parse(s) as Subject[];
          if (Array.isArray(parsed)) {
            setSubjects(parsed);
            const pick = parsed.find(ss => ss.semester === currentSemester) ?? parsed[0];
            setSelectedSubjectId(pick?.id ?? null);
          }
        }
        if (d) {
          const parsed = JSON.parse(d) as Document[];
          if (Array.isArray(parsed)) {
            setDocs(parsed.map(doc => ({ ...doc, createdAt: doc.createdAt ?? Date.now() })));
          }
        }
      } catch {}
    })();
  }, [session]);

  // Lưu dữ liệu vào localStorage (exclude File objects) chỉ khi không có backend
  useEffect(() => {
    if (api.hasBackend()) return;
    try {
      localStorage.setItem('subjects', JSON.stringify(subjects));
      const serializableDocs = docs.map(({ file, ...rest }) => rest);
      localStorage.setItem('docs', JSON.stringify(serializableDocs));
    } catch {}
  }, [subjects, docs]);

  // Học kỳ hiện tại
  useEffect(() => {
    try { localStorage.setItem('currentSemester', currentSemester); } catch {}
  }, [currentSemester]);

  // Khi học kỳ thay đổi, chọn môn học trong học kỳ đó
  useEffect(() => {
    if (!subjects.length) return;
    const inCurrent = subjects.find(s => s.semester === currentSemester);
    if (!inCurrent) return;
    setSelectedSubjectId(prev => {
      const prevOk = subjects.find(s => s.id === prev && s.semester === currentSemester);
      return prevOk ? prev! : inCurrent.id;
    });
  }, [currentSemester, subjects]);

  // Xử lý keyboard: '/' focuses search, 'n' scrolls to form
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Do not trigger shortcuts when user is typing or using modifier keys
      const ae = (document.activeElement as HTMLElement | null);
      const isTyping = !!ae && (
        ae.tagName === 'INPUT' ||
        ae.tagName === 'TEXTAREA' ||
        ae.isContentEditable
      );
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // '/' focuses search when not typing in another field
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // 'n' scrolls to main only when not typing
      if (e.key.toLowerCase() === 'n' && !isTyping) {
        e.preventDefault();
        mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Xử lý Document CRUD
  const handleDocDelete = async (id: string) => {
    if (api.hasBackend()) {
      try {
        await api.deleteDocument(id);
        setDocs(docs.filter((doc) => doc.id !== id));
        showToast('Đã xóa tài liệu');
        return;
      } catch {
        showToast('Xóa tài liệu thất bại');
      }
    } else {
      setDocs(docs.filter((doc) => doc.id !== id));
      showToast('Đã xóa tài liệu');
    }
  };

  // Xử lý Document Create
  const handleDocAdd = async (doc: Omit<Document, 'id'>) => {
    if (api.hasBackend()) {
      try {
        const created = await api.createDocument(doc);
        setDocs([created, ...docs]);
        showToast('Đã thêm tài liệu');
        setShowAddForm(true);
        setPage(1);
        setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        return;
      } catch {
        showToast('Thêm tài liệu thất bại');
      }
    } else {
      const newDoc = { ...doc, id: Date.now().toString(), createdAt: Date.now() } as Document;
      setDocs([newDoc, ...docs]);
      showToast('Đã thêm tài liệu');
      setShowAddForm(true);
      setPage(1);
      setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  // Xử lý Document Update
  const handleDocUpdate = async (updatedDoc: Document) => {
    if (api.hasBackend()) {
      try {
        const saved = await api.updateDocument(updatedDoc);
        setDocs(docs.map(doc => doc.id === saved.id ? saved : doc));
        showToast('Đã cập nhật tài liệu');
        return;
      } catch {
        showToast('Cập nhật tài liệu thất bại');
      }
    } else {
      setDocs(docs.map(doc => doc.id === updatedDoc.id ? updatedDoc : doc));
      showToast('Đã cập nhật tài liệu');
    }
  };

  // Xử lý Subject CRUD
  const handleSubjectAdd = async (name: string, semester?: string) => {
    if (api.hasBackend()) {
      try {
        const created = await api.createSubject(name, undefined, semester);
        setSubjects([...subjects, created]);
        setSelectedSubjectId(created.id);
        showToast('Đã thêm môn học');
        return;
      } catch {
        showToast('Thêm môn học thất bại');
      }
    } else {
      const newSubject = { id: Date.now().toString(), name, semester } as Subject;
      setSubjects([...subjects, newSubject]);
      showToast('Đã thêm môn học');
    }
  };

  // Xử lý Subject Update
  const handleSubjectUpdate = async (updatedSubject: Subject) => {
    if (api.hasBackend()) {
      try {
        const saved = await api.updateSubject(updatedSubject);
        setSubjects(subjects.map(s => s.id === saved.id ? saved : s));
        return;
      } catch {
        showToast('Cập nhật môn học thất bại');
      }
    } else {
      setSubjects(subjects.map(s => s.id === updatedSubject.id ? updatedSubject : s));
    }
  };

  // Xử lý Subject Delete
  const handleSubjectDelete = async (id: string) => {
    if (api.hasBackend()) {
      try {
        await api.deleteSubject(id);
        setSubjects(subjects.filter(s => s.id !== id));
        setDocs(docs.filter(d => d.subjectId !== id));
        if (selectedSubjectId === id) {
          setSelectedSubjectId(subjects.find(s => s.id !== id)?.id || null);
        }
        showToast('Đã xóa môn học');
        return;
      } catch {
        showToast('Xóa môn học thất bại');
      }
    } else {
      setSubjects(subjects.filter(s => s.id !== id));
      setDocs(docs.filter(d => d.subjectId !== id));
      if (selectedSubjectId === id) {
        setSelectedSubjectId(subjects[0]?.id || null);
      }
      showToast('Đã xóa môn học');
    }
  };

  // Khi backend được bật, tải lại tài liệu khi thay đổi môn học
  useEffect(() => {
    (async () => {
      if (!api.hasBackend()) return;
      if (!session) { setDocs([]); return; }
      if (!selectedSubjectId) { setDocs([]); return; }
      try {
        const list = await api.listDocuments(selectedSubjectId);
        setDocs(list);
      } catch {
        // silent
      }
    })();
  }, [selectedSubjectId, session]);

  // Xử lý tìm kiếm tài liệu
  const normalize = (s: string) => s.toLowerCase();
  const filteredDocs = useMemo(() => {
    const q = normalize(search);
    const withinSubject = docs.filter(doc => doc.subjectId === selectedSubjectId);
    const favFiltered = showFavOnly ? withinSubject.filter(d => d.favorite) : withinSubject;
    const searched = q
      ? favFiltered.filter(d =>
          normalize(d.name).includes(q) ||
          normalize(d.author).includes(q) ||
          normalize(d.describes).includes(q) ||
          (d.tags?.some(t => normalize(t).includes(q)) ?? false)
        )
      : favFiltered;
    const sorted = [...searched].sort((a, b) => {
      if (sortKey === 'name') {
        const res = a.name.localeCompare(b.name);
        return sortDir === 'asc' ? res : -res;
      } else {
        const aT = a.createdAt ?? 0;
        const bT = b.createdAt ?? 0;
        return sortDir === 'asc' ? aT - bT : bT - aT;
      }
    });
    return sorted;
  }, [docs, selectedSubjectId, search, sortKey, sortDir, showFavOnly]);

  // Xử lý phân trang
  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [filteredDocs.length, totalPages]);
  const pagedDocs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredDocs.slice(start, start + pageSize);
  }, [filteredDocs, page]);

  // Dashboard counters (live from current state)
  const totalSubjects = subjects.filter(s => s.semester === currentSemester).length;
  const totalDocuments = docs.length;
  const subjectsPast = subjects.filter(s => s.semester && compareSemesters(s.semester, currentSemester) < 0).length;
  const subjectsFuture = subjects.filter(s => s.semester && compareSemesters(s.semester, currentSemester) > 0).length;
  const docsInCurrentSemester = useMemo(() => {
    const ids = new Set(subjects.filter(s => s.semester === currentSemester).map(s => s.id));
    return docs.filter(d => ids.has(d.subjectId)).length;
  }, [subjects, docs, currentSemester]);
  const favDocs = docs.filter(d => d.favorite).length;
  const recentUploads7d = (() => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    return docs.filter(d => (d.createdAt ?? 0) >= now - week).length;
  })();
  const uniqueTags = (() => {
    const set = new Set<string>();
    for (const d of docs) {
      (d.tags || []).forEach(t => set.add(t));
    }
    return set.size;
  })();
  const uniqueAuthors = (() => {
    const set = new Set<string>();
    for (const d of docs) {
      if (d.author) set.add(d.author);
    }
    return set.size;
  })();
  const favoriteRate = docs.length ? Math.round((favDocs / docs.length) * 100) : 0;
  const upcomingDeadlines = useMemo(() => {
    // Read optional schedule items from localStorage (if any) and count items within next 14 days
    try {
      const raw = localStorage.getItem('schedule');
      if (!raw) return 0;
      const items = JSON.parse(raw) as Array<{ startsAt: string; endsAt: string }>; // compatible with ScheduleItem
      const now = Date.now();
      const horizon = now + 14 * 24 * 60 * 60 * 1000;
      return items.filter((it) => {
        const t = new Date(it.startsAt).getTime();
        return !Number.isNaN(t) && t >= now && t <= horizon;
      }).length;
    } catch {
      return 0;
    }
  }, [subjects, docs, selectedSubjectId, view, page, filteredDocs.length]);

  // Xử lý toast
  const showToast = (message: string) => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, message }]);
    setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id));
    }, 2200);
  };

  // Gate: yêu cầu đăng nhập trước khi vào ứng dụng
  if (loading) {
    // eslint-disable-next-line no-console
    console.log('[boot] App() rendering loading gate');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-white to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center text-slate-700 dark:text-white/80">Đang tải...</div>
      </div>
    );
  }

  if (!session) {
    // eslint-disable-next-line no-console
    console.log('[boot] App() rendering login gate (no session)');
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-slate-200 dark:bg-white/5 dark:border-white/10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white/95 tracking-tight">Quản lý tài liệu sinh viên</h1>
              <p className="text-slate-600 dark:text-white/60 text-sm mt-1">Vui lòng đăng nhập/đăng ký để tiếp tục</p>
            </div>
            <AuthBar />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <AuthCard />
        </main>
      </div>
    );
  }

  // Render
  // eslint-disable-next-line no-console
  console.log('[boot] App() rendering main app (has session)');
  return (
    <div className="min-h-screen font-sans bg-gradient-to-br from-white via-white to-slate-100 text-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:text-slate-100">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-slate-200 dark:bg-white/5 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-3">
          {/* Hàng 1: Tiêu đề + Tab chuyển đổi giữa tài liệu và thời khóa biểu */}
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white/95 tracking-tight">Quản lý tài liệu sinh viên</h1>
              <p className="text-slate-600 dark:text-white/60 text-sm mt-1">Phục vụ cho sinh viên chuyên ngành Toán Tin ✨</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden bg-white border border-slate-200 text-slate-700 dark:bg-white/10 dark:border-white/15">
                <button onClick={() => setView('docs')} className={`px-3 py-2 text-sm transition ${view === 'docs' ? 'bg-slate-100 text-slate-900 dark:bg-white/20 dark:text-white' : 'hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/15'}`}>Tài liệu</button>
                <button onClick={() => setView('schedule')} className={`px-3 py-2 text-sm transition ${view === 'schedule' ? 'bg-slate-100 text-slate-900 dark:bg-white/20 dark:text-white' : 'hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/15'}`}>Thời khóa biểu</button>
                <button onClick={() => setView('grades')} className={`px-3 py-2 text-sm transition ${view === 'grades' ? 'bg-slate-100 text-slate-900 dark:bg-white/20 dark:text-white' : 'hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/15'}`}>Điểm</button>
              </div>
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Đổi giao diện" aria-label="Đổi giao diện" className="px-3 py-2 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:bg-white/10 dark:border-white/15 dark:text-white/90 dark:hover:bg-white/15">{theme === 'dark' ? '☀️' : '🌙'}</button>
              <AuthBar />
            </div>
          </div>

          {/* Hàng 2: Tìm kiếm */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm (/ để focus)"
              className="w-full pl-9 pr-3 py-2.5 rounded-md bg-white border border-slate-200 text-slate-900 placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white/10 dark:border-white/15 dark:text-white dark:placeholder-white/60"
            />
          </div>

          {/* Hàng 3: Cấu hình */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowFavOnly(v => !v)}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${showFavOnly ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-400/40' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-white/10 dark:text-white/80 dark:border-white/15 dark:hover:bg-white/15'}`}
              title="Chỉ hiện yêu thích"
            >
              ★ Yêu thích
            </button>
            <div className="flex items-center gap-2">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'date' | 'name')}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-white/10 dark:border-white/15 dark:text-white"
                title="Sắp xếp theo"
              >
                <option value="date">Ngày</option>
                <option value="name">Tên</option>
              </select>
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-white/10 dark:border-white/15 dark:text-white"
                title="Thứ tự"
              >
                <option value="desc">Giảm dần</option>
                <option value="asc">Tăng dần</option>
              </select>
              {/* Chọn kỳ đang học */}
              <label className="ml-2 text-white/80 text-sm">Kỳ đang học:</label>
              <select
                value={currentSemester}
                onChange={(e) => setCurrentSemester(e.target.value)}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-white/10 dark:border-white/15 dark:text-white"
                title="Kỳ đang học"
              >
                {semesters.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <details className="relative">
              <summary className="list-none px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 cursor-pointer select-none dark:bg-white/10 dark:border-white/15 dark:text-white/90 dark:hover:bg-white/15">Tùy chọn ▾</summary>
              <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white shadow-lg p-2 z-20 dark:border-white/15 dark:bg-slate-900/95">
                <button
                  onClick={() => {
                    const payload = {
                      subjects,
                      docs: docs.map(({ file, ...rest }) => rest),
                    };
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'documents-export.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Đã export dữ liệu');
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10"
                >Export dữ liệu</button>
                <label className="block w-full text-left px-3 py-2 rounded-md text-sm bg-slate-50 hover:bg-slate-100 cursor-pointer mt-1 dark:bg-white/5 dark:hover:bg-white/10">
                  Import dữ liệu
                  <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const data = JSON.parse(text) as { subjects: Subject[]; docs: Document[] };
                      if (Array.isArray(data.subjects) && Array.isArray(data.docs)) {
                        setSubjects(data.subjects);
                        setDocs(data.docs.map(d => ({ ...d, createdAt: d.createdAt ?? Date.now() })));
                        const pick = data.subjects.find(s => s.semester === currentSemester) ?? data.subjects[0];
                        setSelectedSubjectId(pick?.id ?? null);
                        showToast('Đã import dữ liệu');
                      } else {
                        showToast('File không hợp lệ');
                      }
                    } catch {
                      showToast('Import thất bại');
                    }
                  }} />
                </label>
              </div>
            </details>
            <button
              onClick={() => setShowImagesToPdf(true)}
              className="px-3 py-1.5 rounded-md text-sm bg-primary-600 text-white hover:bg-primary-700"
              title="Gộp ảnh thành PDF"
            >Ảnh → PDF</button>
            <button
              onClick={() => setShowFreeOcr(true)}
              className="px-3 py-1.5 rounded-md text-sm bg-primary-600 text-white hover:bg-primary-700"
              title="OCR miễn phí (Tesseract)"
            >OCR miễn phí</button>
          </div>
          
          {/* Hàng 4: Dashboard tổng quan */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white/85">Tổng quan</h3>
            <button
              onClick={() => setDashboardExpanded(v => !v)}
              className="px-3 py-1.5 rounded-md text-xs bg-white/10 border border-white/15 text-white/80 hover:bg-white/15"
            >{dashboardExpanded ? 'Thu gọn' : 'Mở rộng'}</button>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`}>
            <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-white/60">Môn đang học (kỳ {currentSemester})</div>
              <div className="mt-1 text-2xl font-extrabold text-white/95">{totalSubjects}</div>
            </div>
            {dashboardExpanded && (
              <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-white/60">Môn đã học</div>
                <div className="mt-1 text-2xl font-extrabold text-white/95">{subjectsPast}</div>
              </div>
            )}
            {dashboardExpanded && (
              <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-white/60">Môn chưa học</div>
                <div className="mt-1 text-2xl font-extrabold text-white/95">{subjectsFuture}</div>
              </div>
            )}
            <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-white/60">Deadline sắp tới (14 ngày)</div>
              <div className="mt-1 text-2xl font-extrabold text-white/95">{upcomingDeadlines}</div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-white/60">Tài liệu trong kỳ hiện tại</div>
              <div className="mt-1 text-2xl font-extrabold text-white/95">{docsInCurrentSemester}</div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-white/60">Tài liệu yêu thích</div>
              <div className="mt-1 text-2xl font-extrabold text-white/95">{favDocs} <span className="text-xs text-white/60">({favoriteRate}%)</span></div>
            </div>
            {dashboardExpanded && (
              <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-white/60">Tổng tài liệu</div>
                <div className="mt-1 text-2xl font-extrabold text-white/95">{totalDocuments}</div>
              </div>
            )}
            {dashboardExpanded && (
              <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-white/60">Upload 7 ngày gần đây</div>
                <div className="mt-1 text-2xl font-extrabold text-white/95">{recentUploads7d}</div>
              </div>
            )}
            {dashboardExpanded && (
              <div className="rounded-xl px-4 py-3 bg-white/10 border border-white/15 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-white/60">Thẻ khác nhau / Tác giả</div>
                <div className="mt-1 text-2xl font-extrabold text-white/95">{uniqueTags} / {uniqueAuthors}</div>
              </div>
            )}
          </div>

        </div>
      </header>
      {view === 'docs' ? (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="md:col-span-1">
            <AddSubjectForm onAddSubject={handleSubjectAdd} />
            <SubjectList 
              subjects={subjects} 
              selectedSubjectId={selectedSubjectId} 
              onSelectSubject={(id) => setSelectedSubjectId(id)} 
              onUpdateSubject={handleSubjectUpdate}
              onDeleteSubject={handleSubjectDelete}
              currentSemester={currentSemester}
            />
          </aside>
          <main ref={mainRef} className="md:col-span-3">
            {/* Danh sách tài liệu môn học trước */}
            <DocumentList documents={pagedDocs} onDelete={handleDocDelete} onUpdate={handleDocUpdate} onPreview={setPreviewDoc} />
            {/* Pagination */}
            <div className="mt-4 flex items-center justify-end gap-2 text-slate-700 dark:text-white/80">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 rounded-md bg-white border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white/10 dark:border-white/20">Trước</button>
              <span className="text-sm">Trang {page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded-md bg-white border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white/10 dark:border-white/20">Sau</button>
            </div>
            {/* Gập/mở form thêm tài liệu */}
            {selectedSubjectId && (
              <div className="mt-6" ref={addFormRef}>
                <button
                  onClick={() => {
                    setShowAddForm(v => !v);
                    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                  }}
                  className="px-3 py-2 rounded-md text-sm bg-primary-600 text-white hover:bg-primary-700"
                >{showAddForm ? '− Thu gọn' : '+ Thêm tài liệu mới'}</button>
                {showAddForm && (
                  <div className="mt-3">
                    <h3 className="mb-2 text-sm font-semibold text-white/85">Thêm tài liệu mới</h3>
                    <AddDocumentForm onAdd={handleDocAdd} subjectId={selectedSubjectId} />
                  </div>
                )}
              </div>
            )}

            {/* Subject Kanban Board sau tài liệu */}
            {selectedSubjectId && (() => {
              const subj = subjects.find(s => s.id === selectedSubjectId);
              if (!subj) return null;
              return (
                <div className="mt-8">
                  <h3 className="mb-2 text-sm font-semibold text-white/85">Bảng Kanban học tập</h3>
                  <SubjectKanban subject={subj} docs={docs.filter(d => d.subjectId === selectedSubjectId)} />
                </div>
              );
            })()}
          </main>
        </div>
      ) : view === 'schedule' ? (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <ScheduleWeek subjects={subjects} onToast={showToast} />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <GradesDashboard
            subjects={subjects}
            onOpenDocs={(subjectName) => {
              const target = subjects.find(s => s.name.trim().toLowerCase() === subjectName.trim().toLowerCase());
              if (target) {
                setSelectedSubjectId(target.id);
              }
              setSearch('');
              setView('docs');
              setPage(1);
            }}
          />
        </div>
      )}
      {/* Contact Footer */}
      <footer className="mt-10 border-t border-white/10 bg-white/5 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-white font-bold">Liên hệ</h3>
            <p className="text-white/70 text-sm mt-2">Nếu bạn có góp ý hoặc yêu cầu tính năng, hãy liên hệ:</p>
          </div>
          <div>
            <ul className="space-y-1 text-sm text-white/80">
              <li>Email: <a className="underline hover:text-white" href="mailto:contact@example.com">contact@example.com</a></li>
              <li>GitHub: <a className="underline hover:text-white" href="https://github.com/" target="_blank" rel="noreferrer">github.com/</a></li>
            </ul>
          </div>
          <div className="text-sm text-white/60 md:text-right">© {new Date().getFullYear()} Student Docs. All rights reserved.</div>
        </div>
      </footer>

      {/* Modal: Ảnh -> PDF */}
      {showImagesToPdf && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowImagesToPdf(false)} />
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <ImagesToPdf onClose={() => setShowImagesToPdf(false)} />
          </div>
        </div>
      )}

      {/* Modal: OCR miễn phí */}
      {showFreeOcr && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFreeOcr(false)} />
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <FreeOcr onClose={() => setShowFreeOcr(false)} />
          </div>
        </div>
      )}

      {/* Modal xem tài liệu - đã được cải tiến */}
      {previewDoc && (
        <div className="fixed inset-0 z-50" onKeyDown={(e) => { if (e.key === 'Escape') setPreviewDoc(null); }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreviewDoc(null)} />
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <div className="w-full max-w-7xl h-[90vh] rounded-xl bg-slate-900/90 backdrop-blur-md border border-white/15 shadow-2xl overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-black/30">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-white/95 font-semibold">{previewDoc.name}</div>
                  <div className="text-xs text-white/60 truncate">{previewDoc.author}</div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Tải xuống */}
                  {(previewDoc.fileUrl || previewDoc.link) && (
                    <a
                      href={(previewDoc.fileUrl || previewDoc.link)!}
                      download
                      target="_blank"
                      rel="noreferrer"
                      title="Tải xuống"
                      className="p-2 rounded-md bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
                    >
                      ⬇️
                    </a>
                  )}
                  {/* In: Mở tab mới (in trình duyệt) */}
                  {(previewDoc.fileUrl || previewDoc.link) && (
                    <button
                      onClick={() => window.open((previewDoc.fileUrl || previewDoc.link)!, '_blank')}
                      title="In"
                      className="p-2 rounded-md bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
                    >
                      🖨️
                    </button>
                  )}
                  {/* Mở tab mới */}
                  {previewDoc.link && (
                    <a
                      href={previewDoc.link}
                      target="_blank"
                      rel="noreferrer"
                      title="Mở tab mới"
                      className="p-2 rounded-md bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
                    >
                      ↗
                    </a>
                  )}
                  {/* Đóng */}
                  <button
                    onClick={() => setPreviewDoc(null)}
                    className="p-2 rounded-md bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
                    aria-label="Đóng"
                    title="Đóng (Esc)"
                  >✕</button>
                </div>
              </div>
              {/* Nội dung */}
              <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 bg-slate-900/60">
                  {(() => {
                    const src = previewDoc.link || previewDoc.fileUrl || '';
                    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(src);
                    const isPdf = /\.pdf$/i.test(src) || previewDoc.file?.type === 'application/pdf';
                    if (isImage) {
                      return <img src={src} alt={previewDoc.name} className="w-full h-full object-contain" />;
                    }
                    if (isPdf) {
                      return (
                        <iframe
                          title="preview-pdf"
                          src={src}
                          className="w-full h-full"
                        />
                      );
                    }
                    return <iframe title="preview" src={src} className="w-full h-full" />;
                  })()}
                </div>
                {/* Thông tin tài liệu */}
                <aside className="w-72 border-l border-white/10 bg-black/20 p-4 hidden lg:block">
                  <div className="text-white/80 text-sm mb-3">Thông tin</div>
                  <div className="space-y-2 text-white/80 text-sm">
                    <div><span className="text-white/50">Tác giả: </span>{previewDoc.author || '—'}</div>
                    <div><span className="text-white/50">Môn: </span>{subjects.find(s => s.id === previewDoc.subjectId)?.name || '—'}</div>
                    <div><span className="text-white/50">Thẻ: </span>{previewDoc.tags?.length ? previewDoc.tags.join(', ') : '—'}</div>
                    {previewDoc.describes && (
                      <div className="pt-2 border-t border-white/10 text-white/70 text-xs leading-relaxed whitespace-pre-wrap">{previewDoc.describes}</div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Thông báo */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-2 rounded-md bg-white/10 text-white shadow-lg border border-white/20 backdrop-blur-md">
            {t.message}
          </div>
        ))}
      </div>
      {/* Floating chat button */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          title="Mở Chatbot"
          aria-label="Mở Chatbot"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-white shadow-xl border border-emerald-200/50 flex items-center justify-center text-2xl"
        >
          🤖
        </button>
      )}
      {showChat && (
        <RAGChat subjectId={selectedSubjectId ?? undefined} onClose={() => setShowChat(false)} />
      )}
    </div>
  );
}

export default App;
