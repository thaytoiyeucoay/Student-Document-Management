import { useState, useEffect, useRef, type ReactNode, type ChangeEvent, type KeyboardEvent } from 'react';
import hljs from 'highlight.js';
import api from '../api';

interface Props {
  subjectId?: string | null;
  onClose: () => void;
}

type ContextItem = string | { title?: string; url?: string; page?: number | string; snippet?: string };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contexts?: ContextItem[];
  showCitations?: boolean;
  suggestions?: string[];
};

export default function RAGChat({ subjectId, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [mini, setMini] = useState(false);
  const streamUrl = (import.meta as ImportMeta).env?.VITE_RAG_STREAM_URL as string | undefined;
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [hljsTheme] = useState('github-dark');
  const controllerRef = useRef<AbortController | null>(null);
  // Chat memory toggle and thread id
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('chat_memory') !== '0'; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('chat_memory', memoryEnabled ? '1' : '0'); } catch { console.debug('persist chat_memory failed'); } }, [memoryEnabled]);
  const threadIdRef = useRef<string>(Math.random().toString(36).slice(2) + '-' + Date.now().toString(36));
  // Filters
  const [tagsText, setTagsText] = useState('');
  const [authorText, setAuthorText] = useState('');
  const [fromDate, setFromDate] = useState(''); // yyyy-mm-dd
  const [toDate, setToDate] = useState('');     // yyyy-mm-dd
  // Autocomplete state
  const [tagSuggest, setTagSuggest] = useState<string[]>([]);
  const [authorSuggest, setAuthorSuggest] = useState<string[]>([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showAuthorMenu, setShowAuthorMenu] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const ensureThemeLink = (theme: string) => {
    const id = 'hljs-theme-link';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = `https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/${theme}.min.css`;
  };

  const scrollToBottom = () => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  };

  const autoResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, 160); // cap at ~8 lines
    el.style.height = next + 'px';
  };

  // init theme
  useEffect(() => { ensureThemeLink(hljsTheme); }, [hljsTheme]);

  // Initialize thread from URL and load recent tag/author suggestions
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get('thread');
      const mem = url.searchParams.get('memory');
      if (t) threadIdRef.current = t;
      if (mem) setMemoryEnabled(mem === '1' || mem === 'true');
      const rTags = JSON.parse(localStorage.getItem('recent_tags') || '[]');
      const rAuthors = JSON.parse(localStorage.getItem('recent_authors') || '[]');
      if (Array.isArray(rTags)) setTagSuggest(rTags.slice(0, 50));
      if (Array.isArray(rAuthors)) setAuthorSuggest(rAuthors.slice(0, 50));
    } catch { console.debug('init thread parse failed'); }
  }, []);

  const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const attachContexts = (contexts: ContextItem[]) => {
    setMessages((prev) => {
      const idx = [...prev].map((m, j) => ({ m, j })).reverse().find(x => x.m.role === 'assistant')?.j;
      if (idx === undefined) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], contexts } as ChatMessage;
      return next;
    });
  };

  const streamAnswer = async (query: string, subj?: string) => {
    try {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const f = buildFilterParams();
      const res = await fetch(streamUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          subject_id: subj,
          top_k: 5,
          // filters parity with /rag/query
          tags: f.tags,
          author: f.author,
          time_from: f.timeFrom,
          time_to: f.timeTo,
          // chat memory controls
          thread_id: threadIdRef.current,
          memory: memoryEnabled,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error('stream failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        const text = decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
        if (text) {
          setMessages((prev) => {
            const idx = [...prev].map((m, j) => ({ m, j })).reverse().find(x => x.m.role === 'assistant')?.j;
            if (idx === undefined) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], content: (next[idx].content || '') + text } as ChatMessage;
            return next;
          });
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // stopped by user
        return;
      }
      // fallback: show error toast in chat
      attachContexts([]);
    }
  };

  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  // Persist mini dock state
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat_mini');
      if (saved === '1') setMini(true);
    } catch { console.debug('read mini failed'); }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('chat_mini', mini ? '1' : '0'); } catch { console.debug('store mini failed'); }
  }, [mini]);

  const buildFilterParams = () => {
    const tags = tagsText.split(',').map(s => s.trim()).filter(Boolean);
    const author = authorText.trim() || undefined;
    const timeFrom = fromDate ? `${fromDate}T00:00:00Z` : undefined;
    const timeTo = toDate ? `${toDate}T23:59:59Z` : undefined;
    return { tags: tags.length ? tags : undefined, author, timeFrom, timeTo } as const;
  };

  // Quick date range helpers for the filter UI
  const applyQuickRange = (key: '7d' | '30d' | 'thisMonth' | 'clear') => {
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (key === 'clear') {
      setFromDate('');
      setToDate('');
      return;
    }
    if (key === 'thisMonth') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFromDate(ymd(first));
      setToDate(ymd(last));
      return;
    }
    const start = new Date(now);
    if (key === '7d') start.setDate(start.getDate() - 7);
    if (key === '30d') start.setDate(start.getDate() - 30);
    setFromDate(ymd(start));
    setToDate(ymd(now));
  };

  // Persist recents after sending
  const persistRecents = () => {
    try {
      const tags = tagsText.split(',').map(s => s.trim()).filter(Boolean);
      if (tags.length) {
        const set = new Set<string>([...tagSuggest, ...tags]);
        const arr = Array.from(set).slice(0, 100);
        localStorage.setItem('recent_tags', JSON.stringify(arr));
        setTagSuggest(arr);
      }
      const author = authorText.trim();
      if (author) {
        const setA = new Set<string>([author, ...authorSuggest]);
        const arrA = Array.from(setA).slice(0, 100);
        localStorage.setItem('recent_authors', JSON.stringify(arrA));
        setAuthorSuggest(arrA);
      }
    } catch { console.debug('persist recents failed'); }
  };

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setError(null);
    setInput('');
    setMessages((m) => [...m, { id: newId(), role: 'user', content: q }]);
    try {
      setLoading(true);
      if (!api.hasBackend()) {
        setMessages((m) => [...m, { id: newId(), role: 'assistant', content: 'Backend chưa được cấu hình (VITE_API_URL). Vui lòng bật backend để dùng RAG.' }]);
        return;
      }
      const queryForModel = `${q}\n\nYêu cầu định dạng: Hãy trả lời bằng Markdown rõ ràng, có tiêu đề, danh sách, và code block (\`\`\`lang) khi cần.`;
      const f = buildFilterParams();
      if (streamUrl) {
        // Start streaming immediately
        setMessages((m) => [...m, { id: newId(), role: 'assistant', content: '', contexts: [], showCitations: true, suggestions: buildFollowUps(q) }]);
        await streamAnswer(queryForModel, subjectId ?? undefined);
        // Fetch contexts in background and attach
        try {
          const resC = await api.ragQuery({ query: queryForModel, subjectId: subjectId ?? undefined, topK: 5, ...f });
          attachContexts(resC.contexts || []);
        } catch { console.debug('ctx fetch failed'); }
      } else {
        const res = await api.ragQuery({ query: queryForModel, subjectId: subjectId ?? undefined, topK: 5, ...f });
        const answer = res.answer || '(no answer)';
        const ctx = (res.contexts as ContextItem[]) || [];
        // Streaming reveal (simulated)
        setMessages((m) => [...m, { id: newId(), role: 'assistant', content: '', contexts: ctx, showCitations: true, suggestions: buildFollowUps(q) }]);
        revealAnswer(answer, ctx);
      }
      persistRecents();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi gọi RAG');
    } finally {
      setLoading(false);
    }
  };

  const revealAnswer = (text: string, contexts: ContextItem[]) => {
    const speed = 12; // chars per tick
    let i = 0;
    const tick = () => {
      i = Math.min(text.length, i + speed);
      setMessages((prev) => {
        // find last assistant message that matches our contexts reference and is still shorter than full text
        const idx = [...prev].map((m, j) => ({ m, j })).reverse().find(x => x.m.role === 'assistant' && (x.m.contexts?.length || 0) === (contexts?.length || 0))?.j;
        if (idx === undefined) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], content: text.slice(0, i) };
        return next;
      });
      if (i < text.length) {
        setTimeout(tick, 20);
      }
    };
    setTimeout(tick, 0);
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // next tick resize to read updated value
    requestAnimationFrame(autoResize);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  useEffect(() => { autoResize(); }, [input]);

  // Build simple follow-up suggestions based on last query
  const buildFollowUps = (q: string): string[] => {
    const base = [
      'Giải thích chi tiết hơn với ví dụ',
      'Tóm tắt lại ngắn gọn các ý chính',
      'Cho biết nguồn trích dẫn quan trọng nhất',
    ];
    if (q.length > 0) base[0] = `Cho ví dụ minh họa cho: “${q.slice(0, 50)}${q.length > 50 ? '…' : ''}”`;
    return base.slice(0, 3);
  };

  const toggleCitations = (id: string) => {
    setMessages((prev) => prev.map(m => m.id === id ? { ...m, showCitations: !m.showCitations } : m));
  };

  const regenerate = async () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    setInput(lastUser.content);
    await send();
  };

  const pinMessage = (msg: ChatMessage) => {
    if (msg.role !== 'assistant') return;
    setPinned((p) => [msg, ...p.filter(x => x.id !== msg.id)]);
  };
  const unpinMessage = (id: string) => setPinned(p => p.filter(x => x.id !== id));

  // Share current thread link (thread_id + memory flag)
  const shareThread = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('thread', threadIdRef.current);
      url.searchParams.set('memory', memoryEnabled ? '1' : '0');
      navigator.clipboard.writeText(url.toString());
    } catch { void 0; }
  };

  const suggestions = [
    'Tóm tắt tài liệu mới nhất của môn này',
    'Tìm tài liệu có từ khóa “đại số tuyến tính”',
    'Các tài liệu yêu thích của tôi là gì?',
  ];

  const getAvatar = (role: 'user' | 'assistant') => role === 'user' ? '🧑‍🎓' : '🤖';

  const copy = (text: string) => {
    try { navigator.clipboard.writeText(text); } catch (e) {
      console.debug('Failed to copy:', e);
    }
  };

  // Lightweight Markdown renderer (safe subset)
  const escapeHtml = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const renderMarkdown = (src: string) => {
    // Handle fenced code blocks ```lang\ncode\n```
    const parts: ReactNode[] = [];
    const regex = /```([\w-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(src)) !== null) {
      const [full, lang, code] = match;
      const before = src.slice(lastIndex, match.index);
      if (before) parts.push(<div key={`t-${lastIndex}`} className="whitespace-pre-wrap leading-relaxed text-sm" dangerouslySetInnerHTML={{ __html: inlineMarkdown(escapeHtml(before)) }} />);
      // highlight code
      let html = '';
      try {
        if (lang) html = hljs.highlight(code, { language: lang }).value; else html = hljs.highlightAuto(code).value;
      } catch {
        html = escapeHtml(code);
      }
      parts.push(
        <pre key={`c-${match.index}`} data-lang={lang} className="mt-2 mb-1 overflow-auto rounded-lg border border-white/15 bg-black/40 p-3 text-xs text-white/90"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
      );
      lastIndex = match.index + full.length;
    }
    const rest = src.slice(lastIndex);
    if (rest) parts.push(<div key={`t-end`} className="whitespace-pre-wrap leading-relaxed text-sm" dangerouslySetInnerHTML={{ __html: inlineMarkdown(escapeHtml(rest)) }} />);
    return <>{parts}</>;
  };

  // Inline markdown: **bold**, *italic*, `code`, [text](url)
  const inlineMarkdown = (s: string) => {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+?)`/g, '<code class="px-1 py-0.5 rounded bg-black/40 border border-white/10 text-[0.85em]">$1</code>')
      .replace(/\[([^\]]+?)\]\((https?:[^)]+)\)/g, '<a class="underline hover:opacity-90" href="$2" target="_blank" rel="noreferrer">$1</a>');
  };

  const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
  const truncate = (s: string, n = 180) => (s.length > n ? s.slice(0, n) + '…' : s);
  const renderContextItem = (c: ContextItem) => {
    if (typeof c === 'string') {
      if (isUrl(c)) {
        return (
          <a href={c} target="_blank" rel="noreferrer" className="underline hover:opacity-90 break-words">
            {c}
          </a>
        );
      }
      return <span className="opacity-90">{truncate(c)}</span>;
    }
    const title = c.title || c.url || 'Nguồn';
    const page = c.page ? String(c.page) : null;
    const snippet = c.snippet ? truncate(c.snippet, 220) : null;
    if (c.url) {
      return (
        <a href={c.url} target="_blank" rel="noreferrer" className="block hover:opacity-90 break-words">
          <div className="underline">{title}</div>
          <div className="text-white/70 text-xs mt-0.5">{page ? `Trang ${page}` : null}</div>
          {snippet ? <div className="mt-1 text-white/80 text-[0.85rem]">{snippet}</div> : null}
        </a>
      );
    }
    return (
      <div className="break-words">
        <div className="font-medium">{title}</div>
        <div className="text-white/70 text-xs mt-0.5">{page ? `Trang ${page}` : null}</div>
        {snippet ? <div className="mt-1 text-white/80 text-[0.85rem]">{snippet}</div> : null}
      </div>
    );
  };

  return (
    <>
      {/* Mini dock mode */}
      {mini && (
        <button
          onClick={() => setMini(false)}
          title="Mở rộng chatbot"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-white shadow-xl border border-emerald-200/50 flex items-center justify-center text-2xl"
        >
          🤖
        </button>
      )}
      {!mini && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <div className="w-full max-w-3xl h-[82vh] rounded-2xl bg-gradient-to-b from-slate-900/95 to-slate-900/80 backdrop-blur-xl border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col">
              {/* Header: title + actions */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">🤖</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">Trợ lý học liệu</div>
                    <div className="text-[11px] text-white/60 truncate">Hỏi & nhận câu trả lời kèm nguồn trích dẫn</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-white/80 select-none">
                    <input
                      type="checkbox"
                      className="accent-emerald-500"
                      checked={memoryEnabled}
                      onChange={(e) => setMemoryEnabled(e.target.checked)}
                    />
                    Nhớ hội thoại
                  </label>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(v => !v)}
                    className="h-8 px-3 rounded-md bg-white/10 border border-white/15 text-white/90 hover:bg-white/15 text-xs"
                    title="Bật/tắt bộ lọc"
                  >Bộ lọc</button>
                  <button
                    type="button"
                    onClick={() => setMini(true)}
                    className="h-8 w-8 rounded-md bg-white/10 border border-white/15 text-white hover:bg-white/15"
                    title="Thu nhỏ"
                  >—</button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 w-8 rounded-md bg-white/10 border border-white/15 text-white hover:bg-white/15"
                    title="Đóng"
                  >✕</button>
                </div>
              </div>

              {/* Collapsible Filters */}
              {filtersOpen && (
                <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">Tags (phân cách bằng dấu phẩy)</label>
                      <div className="relative">
                        <input
                          value={tagsText}
                          onChange={(e) => { setTagsText(e.target.value); setShowTagMenu(true); }}
                          onFocus={() => setShowTagMenu(true)}
                          onBlur={() => setTimeout(() => setShowTagMenu(false), 100)}
                          placeholder="ai, thi-cuoi-ky"
                          className="w-full text-sm px-2 py-1.5 rounded-md bg-white/10 border border-white/20 text-white/90 placeholder-white/50"
                        />
                        {showTagMenu && tagSuggest.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full rounded-md bg-slate-900/95 border border-white/15 shadow-lg max-h-48 overflow-auto">
                            {tagSuggest.filter(s => {
                              const last = tagsText.split(',').map(x => x.trim()).filter(Boolean).pop() || '';
                              return !last || s.toLowerCase().includes(last.toLowerCase());
                            }).slice(0, 8).map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                className="block w-full text-left px-2 py-1 text-xs hover:bg-white/10"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const parts = tagsText.split(',').map(x => x.trim()).filter(Boolean);
                                  if (parts.length && tagsText.trim().endsWith(',')) {
                                    parts.push(s);
                                  } else if (parts.length) {
                                    parts[parts.length - 1] = s;
                                  } else {
                                    parts.push(s);
                                  }
                                  setTagsText(parts.join(', '));
                                  setShowTagMenu(false);
                                }}
                              >{s}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">Tác giả</label>
                      <div className="relative">
                        <input
                          value={authorText}
                          onChange={(e) => { setAuthorText(e.target.value); setShowAuthorMenu(true); }}
                          onFocus={() => setShowAuthorMenu(true)}
                          onBlur={() => setTimeout(() => setShowAuthorMenu(false), 100)}
                          placeholder="Nguyen Van A"
                          className="w-full text-sm px-2 py-1.5 rounded-md bg-white/10 border border-white/20 text-white/90 placeholder-white/50"
                        />
                        {showAuthorMenu && authorSuggest.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full rounded-md bg-slate-900/95 border border-white/15 shadow-lg max-h-48 overflow-auto">
                            {authorSuggest.filter(s => !authorText || s.toLowerCase().includes(authorText.toLowerCase())).slice(0, 8).map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                className="block w-full text-left px-2 py-1 text-xs hover:bg-white/10"
                                onMouseDown={(e) => { e.preventDefault(); setAuthorText(s); setShowAuthorMenu(false); }}
                              >{s}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">Từ ngày</label>
                      <div className="flex items-center gap-1">
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full text-sm px-2 py-1.5 rounded-md bg-white/10 border border-white/20 text-white/90" />
                        <button className="text-[11px] px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => applyQuickRange('7d')}>7d</button>
                        <button className="text-[11px] px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => applyQuickRange('30d')}>30d</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">Đến ngày</label>
                      <div className="flex items-center gap-1">
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full text-sm px-2 py-1.5 rounded-md bg-white/10 border border-white/20 text-white/90" />
                        <button className="text-[11px] px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => applyQuickRange('thisMonth')}>Tháng</button>
                        <button className="text-[11px] px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => applyQuickRange('clear')}>Xóa</button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-white/60">Bộ lọc chỉ ảnh hưởng đến NGỮ CẢNH truy hồi (contexts). Câu trả lời sẽ dựa trên các ngữ cảnh sau lọc.</div>
                </div>
              )}

              {/* Pinned section */}
              {pinned.length > 0 && (
                <div className="px-4 pt-3">
                  <div className="text-xs text-white/60 mb-2">Đã ghim</div>
                  <div className="space-y-2">
                    {pinned.map(p => (
                      <div key={p.id} className="rounded-lg border border-yellow-400/30 bg-yellow-500/10 p-3 text-white/90">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[11px] opacity-70">Trợ lý</div>
                          <button onClick={() => unpinMessage(p.id)} className="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/15 hover:bg-white/15">Bỏ ghim</button>
                        </div>
                        <div>{renderMarkdown(p.content)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages list */}
              <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-white/70 text-sm">
                    <div className="mb-2">Gợi ý:</div>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => { setInput(s); }} className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/15 text-white/80 border border-white/15">{s}</button>
                      ))}
                    </div>
                    <div className="mt-3 text-white/60 text-sm">Nhấn Enter để gửi, Shift+Enter để xuống dòng.</div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={m.id ?? i} className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="h-8 w-8 flex-none rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">{getAvatar('assistant')}</div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl border px-4 py-2.5 shadow-sm ${m.role === 'user' ? 'bg-blue-500/20 border-blue-400/30 text-white' : 'bg-white/10 border-white/15 text-white/90'}`}>
                      <div className="text-[11px] mb-1 opacity-70">{m.role === 'user' ? 'Bạn' : 'Trợ lý'}</div>
                      {m.role === 'assistant' ? (
                        <div>{renderMarkdown(m.content)}</div>
                      ) : (
                        <div className="whitespace-pre-wrap leading-relaxed text-sm">{m.content}</div>
                      )}
                      {m.role === 'assistant' && m.contexts && m.contexts.length > 0 && m.showCitations !== false && (
                        <details className="mt-2">
                          <summary className="text-xs text-white/70 cursor-pointer select-none">Nguồn tham chiếu</summary>
                          <ul className="mt-1 space-y-1 text-xs text-white/80 list-disc pl-5">
                            {m.contexts.map((c, idx) => (
                              <li key={idx} className="break-words">{renderContextItem(c)}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {m.role === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {m.suggestions.slice(0,3).map((sug, si) => (
                            <button key={si} onClick={() => { setInput(sug); }} className="px-2 py-1 rounded-full text-xs bg-white/10 hover:bg-white/15 text-white/80 border border-white/15">{sug}</button>
                          ))}
                        </div>
                      )}
                      {m.role === 'assistant' && (
                        <div className="mt-2 flex items-center gap-2 opacity-80">
                          <button className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => copy(m.content)}>Sao chép</button>
                          <button className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => regenerate()}>Regenerate</button>
                          <button className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => toggleCitations(m.id)}>Cite Toggle</button>
                          <button className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => pinMessage(m)}>Ghim</button>
                          <button className="text-xs px-2 py-1 rounded-md bg-white/10 border border-white/15 hover:bg-white/15" onClick={shareThread}>Chia sẻ liên kết</button>
                        </div>
                      )}
                    </div>
                    {m.role === 'user' && (
                      <div className="h-8 w-8 flex-none rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center">{getAvatar('user')}</div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 flex-none rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">🤖</div>
                    <div className="max-w-[80%] rounded-2xl border px-4 py-2.5 shadow-sm bg-white/10 border-white/15 text-white/90">
                      <div className="text-[11px] mb-1 opacity-70">Trợ lý</div>
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:-0.2s]"></span>
                        <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce"></span>
                        <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:0.2s]"></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {error && <div className="text-red-300 text-sm px-4 pb-2">{error}</div>}
              {/* Input (moved inside panel) */}
              <div className="mt-auto p-3 border-t border-emerald-400/20 bg-slate-900/60">
                <div className="rounded-2xl border border-emerald-400/30 bg-slate-800/60 backdrop-blur-md shadow-inner px-3 py-2">
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      title="Đề xuất"
                      className="flex-none h-9 w-9 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                      onClick={() => setInput(prev => prev || 'Hãy tóm tắt nội dung chính của tài liệu gần đây.')}
                    >💡</button>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Nhập câu hỏi của bạn…"
                      rows={1}
                      className="flex-1 max-h-40 resize-none px-3 py-2 rounded-xl bg-transparent text-white placeholder-white/60 focus:outline-none"
                    />
                    {input && (
                      <button
                        type="button"
                        title="Xóa"
                        onClick={() => { setInput(''); requestAnimationFrame(autoResize); }}
                        className="flex-none h-9 w-9 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                      >✖️</button>
                    )}
                    {streamUrl && loading && (
                      <button
                        type="button"
                        onClick={() => { controllerRef.current?.abort(); setTimeout(() => setLoading(false), 0); }}
                        className="flex-none h-9 px-3 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white border border-rose-300/60"
                        title="Dừng tạo"
                      >Dừng</button>
                    )}
                    <button
                      disabled={loading || !input.trim()}
                      onClick={send}
                      className="flex-none h-9 px-4 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 text-white border border-emerald-400/60 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Gửi (Enter)"
                    >{loading ? 'Đang gửi…' : 'Gửi ↵'}</button>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-100/80 px-1">
                    <div>Nhấn Enter để gửi • Shift+Enter để xuống dòng</div>
                    <div>{input.trim().length}/2000</div>
                  </div>
                </div>
              </div>
            </div>

          {/* Input moved inside panel above */}
        </div>
      </div>
    )}
    </>
  );
};
