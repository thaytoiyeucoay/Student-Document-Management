import { useState, useRef } from 'react';
import type { Document } from '../../types';

interface AddDocumentFormProps {
  onAdd: (doc: Omit<Document, 'id'>) => Promise<void> | void;
  subjectId: string;
}

const AddDocumentForm = ({ onAdd, subjectId }: AddDocumentFormProps) => {
  const [name, setName] = useState('');
  const [describes, setDescribes] = useState('');
  const [author, setAuthor] = useState('');
  const [link, setLink] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [enableRag, setEnableRag] = useState<boolean>(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Vui lòng nhập tên tài liệu';
    if (!describes.trim()) newErrors.describes = 'Vui lòng nhập mô tả';
    if (!author.trim()) newErrors.author = 'Vui lòng nhập tác giả';
    // Validate file
    if (file) {
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) newErrors.file = 'File quá lớn (tối đa 10MB)';
      const allowed = [
        'application/pdf',
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowed.includes(file.type)) newErrors.file = 'Định dạng chưa hỗ trợ';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    if (submitting) return;
    setSubmitting(true);

    let fileUrl = '';
    if (file) {
      fileUrl = URL.createObjectURL(file);
    }

    const tags = tagsText
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    try {
      await onAdd({ subjectId, name, describes, author, link, file: file || undefined, fileUrl: fileUrl || undefined, tags, favorite: false, enableRag });
      // Reset form
      setName('');
      setDescribes('');
      setAuthor('');
      setLink('');
      setTagsText('');
      setFile(null);
      setEnableRag(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    setFile(f);
    setErrors(prev => ({ ...prev, file: '' }));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };

  return (
    <form onSubmit={handleSubmit} onPaste={onPaste} className="mb-8 rounded-xl p-6 bg-white/10 backdrop-blur-md border border-white/30 shadow-xl ring-1 ring-white/20">
      <h2 className="text-2xl font-extrabold mb-4 text-white/95 drop-shadow">Thêm tài liệu mới</h2>
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm
          focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
        {errors.name && <p className="text-sm text-rose-300">{errors.name}</p>}
        <input
          type="text"
          placeholder="Description"
          value={describes}
          onChange={(e) => setDescribes(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm
          focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
        {errors.describes && <p className="text-sm text-rose-300">{errors.describes}</p>}
        <input
          type="text"
          placeholder="Author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm
          focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
        {errors.author && <p className="text-sm text-rose-300">{errors.author}</p>}
        <input
          type="text"
          placeholder="External Link (optional)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm
          focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
        <input
          type="text"
          placeholder="Tags (phân tách bằng dấu phẩy)"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm
          focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Upload File (optional)</label>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`rounded-md border-2 border-dashed p-4 transition ${dragActive ? 'border-white/60 bg-white/10' : 'border-white/20 bg-white/5'} ${submitting ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <p className="text-sm text-white/80">Kéo-thả file vào đây, hoặc
              <button type="button" onClick={() => fileInputRef.current?.click()} className="ml-1 underline hover:text-white">chọn file</button>
              . Bạn cũng có thể dán (Ctrl/⌘+V).
            </p>
            {file && <p className="mt-2 text-white/90 text-sm">Đã chọn: {file.name}</p>}
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx,application/pdf,image/*,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
          </div>
          {errors.file && <p className="text-sm text-rose-300 mt-1">{errors.file}</p>}
          {submitting && !errors.file && (
            <p className="text-xs text-white/70 mt-2">Đang tải lên và xử lý tài liệu... Bạn có thể tiếp tục làm việc, việc lập chỉ mục RAG chạy nền.</p>
          )}
          <label className="mt-3 inline-flex items-center gap-2 text-white/90 text-sm select-none">
            <input
              type="checkbox"
              className="h-4 w-4 accent-slate-300"
              checked={enableRag}
              disabled={submitting}
              onChange={(e) => setEnableRag(e.target.checked)}
            />
            Cung cấp tài liệu này cho Chatbot (RAG)
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full py-2 rounded-md font-semibold text-white shadow-lg disabled:opacity-60 disabled:cursor-not-allowed
        bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 hover:from-slate-600 hover:via-slate-500 hover:to-slate-400
        focus:outline-none focus:ring-2 focus:ring-white/40 active:scale-[0.98] transition-all"
      >
        {submitting ? 'Đang tải lên...' : 'Thêm tài liệu'}
      </button>
    </form>
  );
};

export default AddDocumentForm;
