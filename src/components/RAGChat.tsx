import { useState } from 'react';
import api from '../api';

interface Props {
  subjectId?: string | null;
  onClose: () => void;
}

export default function RAGChat({ subjectId, onClose }: Props) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setError(null);
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: q }]);
    try {
      setLoading(true);
      if (!api.hasBackend()) {
        setMessages((m) => [...m, { role: 'assistant', content: 'Backend chưa được cấu hình (VITE_API_URL). Vui lòng bật backend để dùng RAG.' }]);
        return;
      }
      const res = await api.ragQuery({ query: q, subjectId: subjectId ?? undefined, topK: 5 });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer || '(no answer)' }]);
    } catch (e: any) {
      setError(e?.message || 'Lỗi gọi RAG');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 p-4 flex items-center justify-center">
        <div className="w-full max-w-3xl h-[80vh] rounded-xl bg-slate-900/90 backdrop-blur-md border border-white/15 shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/30">
            <div className="text-white/90 font-semibold">Chatbot RAG (miễn phí, cục bộ)</div>
            <button onClick={onClose} className="p-2 rounded-md bg-white/10 border border-white/20 text-white/90 hover:bg-white/20">✕</button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-white/60 text-sm">Hỏi bất kỳ câu gì về tài liệu đã tải lên. Nếu đã cài Ollama, câu trả lời sẽ tự nhiên hơn; nếu không, hệ thống sẽ trích dẫn đoạn liên quan.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`px-3 py-2 rounded-lg max-w-[85%] ${m.role === 'user' ? 'bg-blue-500/20 border border-blue-400/30 self-end ml-auto' : 'bg-white/10 border border-white/20'}`}>
                <div className="text-xs text-white/60 mb-1">{m.role === 'user' ? 'Bạn' : 'Trợ lý'}</div>
                <div className="whitespace-pre-wrap text-white/90 text-sm">{m.content}</div>
              </div>
            ))}
            {error && <div className="text-red-300 text-sm">{error}</div>}
          </div>
          <div className="p-3 border-t border-white/10 bg-black/20 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Nhập câu hỏi..."
              className="flex-1 px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <button disabled={loading} onClick={send} className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white/90 hover:bg-white/20 disabled:opacity-40">Gửi</button>
          </div>
        </div>
      </div>
    </div>
  );
}
