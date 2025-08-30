import { useState } from 'react';
import api from '../api';

type QuizQuestion = {
  id: string;
  question: string;
  choices: string[];
  answer_index: number;
  explanation?: string;
};

export default function QuizGenerator({
  subjectId,
  documentId,
  subjects,
  documents,
  onToast,
}: {
  subjectId?: string | null;
  documentId?: string | null;
  subjects?: Array<{ id: string; name: string }>;
  documents?: Array<{ id: string; name: string; subjectId?: string | null }>;
  onToast?: (m: string) => void;
}) {
  const [num, setNum] = useState(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [mode, setMode] = useState<'rule' | 'llm' | 'hybrid'>('rule');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selSubjectId, setSelSubjectId] = useState<string | null>(subjectId ?? null);
  const [selDocumentId, setSelDocumentId] = useState<string | null>(documentId ?? null);
  const [showAns, setShowAns] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  const canGenerate = Boolean(selDocumentId);

  function shuffleIndices(n: number): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function generate() {
    if (!canGenerate) return;
    if (!api.hasBackend()) {
      onToast?.('Cần cấu hình backend (VITE_API_URL) để tạo Quiz.');
      return;
    }
    try {
      setLoading(true);
      setShowAns({});
      setSelected({});
      setSubmitted(false);
      setScore(null);
      const res = await api.quizGenerate({
        subject_id: selSubjectId ?? undefined,
        document_id: selDocumentId ?? undefined,
        num_questions: num,
        difficulty,
        language,
        mode,
      } as any);
      const qs: QuizQuestion[] = (res.questions || []).map((q: QuizQuestion) => {
        const idx = shuffleIndices(q.choices.length);
        const newChoices = idx.map(i => q.choices[i]);
        const newAnswerIndex = idx.indexOf(q.answer_index);
        return { ...q, choices: newChoices, answer_index: newAnswerIndex };
      });
      setQuestions(qs);
      onToast?.(`Đã tạo ${res.questions?.length ?? 0} câu hỏi.`);
    } catch (e: any) {
      onToast?.(e?.message || 'Lỗi tạo Quiz');
    } finally {
      setLoading(false);
    }
  }

  function submitQuiz() {
    const correct = questions.reduce((acc, q) => acc + (selected[q.id] === q.answer_index ? 1 : 0), 0);
    setScore(correct);
    setSubmitted(true);
    // Reveal all answers
    const all: Record<string, boolean> = {};
    for (const q of questions) all[q.id] = true;
    setShowAns(all);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Môn học</label>
            <select
              value={selSubjectId ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                setSelSubjectId(v);
                // reset doc if không cùng môn
                if (v && selDocumentId && documents && documents.find(d => d.id === selDocumentId && d.subjectId !== v)) {
                  setSelDocumentId(null);
                }
              }}
              className="mt-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
            >
              <option value="">-- Chọn môn --</option>
              {(subjects ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Tài liệu</label>
            <select
              value={selDocumentId ?? ''}
              onChange={(e) => setSelDocumentId(e.target.value || null)}
              className="mt-1 min-w-[260px] rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
            >
              <option value="">-- Chọn tài liệu --</option>
              {(documents ?? []).filter(d => !selSubjectId || d.subjectId === selSubjectId).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Số câu hỏi</label>
          <input
            type="number"
            min={1}
            max={50}
            value={num}
            onChange={(e) => setNum(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Độ khó</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as any)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
          >
            <option value="easy">Dễ</option>
            <option value="medium">Trung bình</option>
            <option value="hard">Khó</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Ngôn ngữ</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Chế độ tạo</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
          >
            <option value="rule">Rule-based</option>
            <option value="llm">LLM + RAG</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <button
          onClick={generate}
          disabled={!canGenerate || loading}
          className={`px-4 py-2.5 rounded-xl font-semibold shadow-md transition-all duration-200 ${
            loading ? 'bg-slate-300 text-slate-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {loading ? 'Đang tạo...' : 'Tạo Quiz'}
        </button>
      </div>

      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500"></span>
            Đang tạo câu hỏi...
          </div>
        )}
        {submitted && score !== null && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-slate-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
            Kết quả: {score}/{questions.length} câu đúng
          </div>
        )}
        {questions.length === 0 ? (
          <div className="text-slate-500 dark:text-slate-400">Chưa có câu hỏi nào. Hãy bấm "Tạo Quiz".</div>
        ) : (
          questions.map((q, idx) => (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
              <div className="font-semibold text-slate-800 dark:text-slate-100">Câu {idx + 1}. {q.question}</div>
              <ul className="mt-2 space-y-2">
                {q.choices.map((c, i) => (
                  <li
                    key={i}
                    onClick={() => setSelected((prev) => ({ ...prev, [q.id]: i }))}
                    className={`rounded-lg px-3 py-2 border cursor-pointer transition-colors
                      ${showAns[q.id] && i === q.answer_index
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                        : selected[q.id] === i
                          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }
                    `}
                    role="button"
                    aria-pressed={selected[q.id] === i}
                  >
                    {String.fromCharCode(65 + i)}. {c}
                  </li>
                ))}
              </ul>
              {showAns[q.id] && q.explanation && (
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">Giải thích: {q.explanation}</div>
              )}
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => setShowAns((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  {showAns[q.id] ? 'Ẩn đáp án' : 'Hiện đáp án'}
                </button>
                {selected[q.id] !== undefined && submitted && (
                  <span className={`text-sm font-medium ${selected[q.id] === q.answer_index ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {selected[q.id] === q.answer_index ? 'Đúng' : 'Sai'}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Submit button pinned at the bottom */}
      {questions.length > 0 && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={submitQuiz}
            disabled={questions.length === 0 || loading}
            className="px-4 py-2.5 rounded-xl font-semibold shadow-md transition-all duration-200 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Nộp bài
          </button>
        </div>
      )}
    </div>
  );
}
