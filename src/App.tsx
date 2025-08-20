import { useState, useEffect, useMemo, useRef } from 'react';
import api from './api';
import ScheduleWeek from './components/ScheduleWeek';
import DocumentList from './components/DocumentList';
import AddDocumentForm from './components/AddDocumentForm';
import SubjectList from './components/SubjectList';
import AddSubjectForm from './components/AddSubjectForm';
import { initialSubjects, initialDocuments } from './data';
import type { Document, Subject } from '../types';

function App() {
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [docs, setDocs] = useState<Document[]>(initialDocuments);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(subjects[0]?.id || null);
  const [view, setView] = useState<'docs' | 'schedule'>('docs');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  useEffect(() => {
    // Cleanup for object URLs
    return () => {
      docs.forEach(doc => {
        if (doc.fileUrl) {
          URL.revokeObjectURL(doc.fileUrl);
        }
      });
    };
  }, [docs]);

  // Load data from backend if configured; else from localStorage
  useEffect(() => {
    (async () => {
      if (api.hasBackend()) {
        try {
          const subs = await api.listSubjects();
          setSubjects(subs);
          const firstId = subs[0]?.id ?? null;
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
          if (Array.isArray(parsed)) setSubjects(parsed);
        }
        if (d) {
          const parsed = JSON.parse(d) as Document[];
          if (Array.isArray(parsed)) {
            setDocs(parsed.map(doc => ({ ...doc, createdAt: doc.createdAt ?? Date.now() })));
          }
        }
      } catch {}
    })();
  }, []);

  // Persist to localStorage (exclude File objects) only when no backend
  useEffect(() => {
    if (api.hasBackend()) return;
    try {
      localStorage.setItem('subjects', JSON.stringify(subjects));
      const serializableDocs = docs.map(({ file, ...rest }) => rest);
      localStorage.setItem('docs', JSON.stringify(serializableDocs));
    } catch {}
  }, [subjects, docs]);

  // Keyboard: '/' focuses search, 'n' scrolls to form
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !('value' in (document.activeElement as any))) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Document CRUD
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

  const handleDocAdd = async (doc: Omit<Document, 'id'>) => {
    if (api.hasBackend()) {
      try {
        const created = await api.createDocument(doc);
        setDocs([created, ...docs]);
        showToast('Đã thêm tài liệu');
        return;
      } catch {
        showToast('Thêm tài liệu thất bại');
      }
    } else {
      const newDoc = { ...doc, id: Date.now().toString(), createdAt: Date.now() } as Document;
      setDocs([newDoc, ...docs]);
      showToast('Đã thêm tài liệu');
    }
  };

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

  // Subject CRUD
  const handleSubjectAdd = async (name: string) => {
    if (api.hasBackend()) {
      try {
        const created = await api.createSubject(name);
        setSubjects([...subjects, created]);
        setSelectedSubjectId(created.id);
        showToast('Đã thêm môn học');
        return;
      } catch {
        showToast('Thêm môn học thất bại');
      }
    } else {
      const newSubject = { id: Date.now().toString(), name } as Subject;
      setSubjects([...subjects, newSubject]);
      showToast('Đã thêm môn học');
    }
  };

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

  // When backend is enabled, refetch docs on subject change
  useEffect(() => {
    (async () => {
      if (!api.hasBackend()) return;
      if (!selectedSubjectId) { setDocs([]); return; }
      try {
        const list = await api.listDocuments(selectedSubjectId);
        setDocs(list);
      } catch {
        // silent
      }
    })();
  }, [selectedSubjectId]);

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

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [filteredDocs.length, totalPages]);
  const pagedDocs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredDocs.slice(start, start + pageSize);
  }, [filteredDocs, page]);

  const showToast = (message: string) => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, message }]);
    setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id));
    }, 2200);
  };

  return (
    <div className="min-h-screen font-sans bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-slate-100">
      <header className="sticky top-0 z-10 bg-white/10 backdrop-blur-md border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto py-5 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white drop-shadow-md tracking-tight">Quản lý tài liệu sinh viên</h1>
              <p className="text-white/60 text-sm mt-1">Nhanh, mượt, tối giản ✨</p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex bg-white/10 border border-white/20 rounded-md overflow-hidden">
                <button onClick={() => setView('docs')} className={`px-3 py-2 text-sm ${view === 'docs' ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/15'}`}>Tài liệu</button>
                <button onClick={() => setView('schedule')} className={`px-3 py-2 text-sm ${view === 'schedule' ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/15'}`}>Thời khóa biểu</button>
              </div>
              <div className="relative w-64">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm (/ để focus)"
                  className="w-full pl-9 pr-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setShowFavOnly(v => !v)}
                className={`px-3 py-2 rounded-md text-sm border transition ${showFavOnly ? 'bg-white/20 text-white border-white/30' : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/15'}`}
                title="Chỉ hiện yêu thích"
              >
                ★ Yêu thích
              </button>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'date' | 'name')}
                className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="date">Ngày</option>
                <option value="name">Tên</option>
              </select>
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="desc">Giảm dần</option>
                <option value="asc">Tăng dần</option>
              </select>
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
                className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white/90 text-sm hover:bg-white/15"
              >Export</button>
              <label className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white/90 text-sm hover:bg-white/15 cursor-pointer">
                Import
                <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text) as { subjects: Subject[]; docs: Document[] };
                    if (Array.isArray(data.subjects) && Array.isArray(data.docs)) {
                      setSubjects(data.subjects);
                      setDocs(data.docs.map(d => ({ ...d, createdAt: d.createdAt ?? Date.now() })));
                      setSelectedSubjectId(data.subjects[0]?.id ?? null);
                      showToast('Đã import dữ liệu');
                    } else {
                      showToast('File không hợp lệ');
                    }
                  } catch {
                    showToast('Không thể đọc file');
                  }
                }} />
              </label>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="md:col-span-1">
          <AddSubjectForm onAddSubject={handleSubjectAdd} />
          <SubjectList 
            subjects={subjects} 
            selectedSubjectId={selectedSubjectId} 
            onSelectSubject={(id) => setSelectedSubjectId(id)} 
            onUpdateSubject={handleSubjectUpdate}
            onDeleteSubject={handleSubjectDelete}
          />
        </aside>
        <main ref={mainRef} className="md:col-span-3">
          {view === 'docs' ? (
            <>
              {selectedSubjectId && <AddDocumentForm onAdd={handleDocAdd} subjectId={selectedSubjectId} />} 
              <DocumentList documents={pagedDocs} onDelete={handleDocDelete} onUpdate={handleDocUpdate} onPreview={setPreviewDoc} />
              {/* Pagination */}
              <div className="mt-4 flex items-center justify-end gap-2 text-white/80">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 rounded-md bg-white/10 border border-white/20 disabled:opacity-40">Trước</button>
                <span className="text-sm">Trang {page}/{totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded-md bg-white/10 border border-white/20 disabled:opacity-40">Sau</button>
              </div>
            </>
          ) : (
            <ScheduleWeek subjects={subjects} onToast={showToast} />
          )}
        </main>
      </div>
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

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPreviewDoc(null)} />
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <div className="w-full max-w-5xl h-[80vh] rounded-xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden relative">
              <button
                onClick={() => setPreviewDoc(null)}
                className="absolute top-3 right-3 p-2 rounded-md bg-white/10 border border-white/20 text-white/90 hover:bg-white/20"
                aria-label="Đóng"
              >
                ✕
              </button>
              <div className="w-full h-full bg-slate-900/60">
                {(() => {
                  const src = previewDoc.link || previewDoc.fileUrl || '';
                  const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(src);
                  const isPdf = /\.pdf$/i.test(src) || previewDoc.file?.type === 'application/pdf';
                  if (isImage) {
                    return <img src={src} alt={previewDoc.name} className="w-full h-full object-contain" />;
                  }
                  if (isPdf) {
                    return <iframe title="preview" src={src} className="w-full h-full" />;
                  }
                  // Fallback: try iframe for web links or other types
                  return <iframe title="preview" src={src} className="w-full h-full" />;
                })()}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-slate-900/80 to-transparent text-white text-sm">
                <div className="flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="font-semibold">{previewDoc.name}</span>
                    <span className="ml-2 text-white/70">{previewDoc.author}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {previewDoc.link && (
                      <a className="px-3 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20" href={previewDoc.link} target="_blank" rel="noreferrer">Mở tab mới</a>
                    )}
                    {previewDoc.fileUrl && (
                      <a className="px-3 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20" href={previewDoc.fileUrl} target="_blank" rel="noreferrer">Tải xuống</a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Toasts */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-2 rounded-md bg-white/10 text-white shadow-lg border border-white/20 backdrop-blur-md">
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
