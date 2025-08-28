import { useState, useRef } from 'react';
import type { Document } from '../../types';
import api from '../api'

interface AddDocumentFormProps {
  onAdd: (doc: Omit<Document, 'id'>) => Promise<void> | void;
  subjectId: string;
  onImported?: (doc: Document) => void;
}

const AddDocumentForm = ({ onAdd, subjectId, onImported }: AddDocumentFormProps) => {
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

  // Import from cloud
  const [driveInput, setDriveInput] = useState(''); // link chia sẻ hoặc fileId
  const [oneShareLink, setOneShareLink] = useState('');
  const [importing, setImporting] = useState(false);

  // Helpers
  const extractDriveFileId = (input: string): string | null => {
    try {
      // Patterns: /file/d/{id}/, /d/{id}/, id={id}
      const d1 = input.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
      if (d1 && d1[1]) return d1[1];
      const idParam = new URL(input).searchParams.get('id');
      if (idParam) return idParam;
    } catch {}
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    // Cho phép để trống name/description/author nếu có đính kèm file (backend sẽ tự phân tích và điền)
    if (!file && !name.trim()) newErrors.name = 'Vui lòng nhập tên tài liệu (hoặc tải file để AI tự điền)';
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

  const doAfterImport = (doc: Document) => {
    try { onImported && onImported(doc); } catch {}
    // Reset minimal fields
    setDriveInput('');
    setOneShareLink('');
  };

  const importFromDrive = async () => {
    if (importing) return;
    if (!driveInput.trim()) {
      setErrors(prev => ({ ...prev, import: 'Nhập link chia sẻ hoặc fileId Google Drive' }));
      return;
    }
    setErrors(prev => ({ ...prev, import: '' }));
    setImporting(true);
    try {
      const value = driveInput.trim();
      const isLink = value.startsWith('http://') || value.startsWith('https://') || value.includes('drive.google.com') || value.includes('docs.google.com');
      const fileIdFromLink = isLink ? extractDriveFileId(value) : null;
      const doc = await api.importFromGoogleDrive({
        fileId: fileIdFromLink ?? (isLink ? undefined : value),
        shareLink: fileIdFromLink ? undefined : (isLink ? value : undefined),
        subjectId,
        name: name || undefined,
        enableRag,
      });
      doAfterImport(doc);
      alert('Đã nhập từ Google Drive');
    } catch (e: any) {
      alert(`Lỗi import Google Drive: ${e?.message || e}`);
    } finally {
      setImporting(false);
    }
  };

  const importFromOneDrive = async () => {
    if (importing) return;
    if (!oneShareLink.trim()) {
      setErrors(prev => ({ ...prev, import: 'Nhập link chia sẻ OneDrive' }));
      return;
    }
    setErrors(prev => ({ ...prev, import: '' }));
    setImporting(true);
    try {
      const doc = await api.importFromOneDrive({
        shareLink: oneShareLink,
        subjectId,
        name: name || undefined,
        enableRag,
      });
      doAfterImport(doc);
      alert('Đã nhập từ OneDrive');
    } catch (e: any) {
      alert(`Lỗi import OneDrive: ${e?.message || e}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} onPaste={onPaste} className="mb-8 rounded-xl p-6 bg-white/10 backdrop-blur-md border border-white/30 shadow-xl ring-1 ring-white/20">
      <h2 className="text-2xl font-extrabold mb-4 text-white/95 drop-shadow">Thêm tài liệu mới</h2>
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Tên tài liệu (có thể bỏ trống nếu tải file)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm
          focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
        {errors.name && <p className="text-sm text-rose-300">{errors.name}</p>}
        <input
          type="text"
          placeholder="Mô tả (có thể bỏ trống nếu tải file)"
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
          <label className="block text-sm font-medium text-white/80 mb-1">Upload File (khuyến nghị)</label>
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
            <p className="mt-1 text-xs text-white/60">Sau khi tải lên, hệ thống sẽ tự động đọc nội dung và điền tiêu đề, ngày/tháng/năm, loại văn bản và gắn thẻ (#cong-van, year:YYYY, ...).</p>
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
          <div className="mt-6 border-t border-white/20 pt-4">
            <div className="text-white/90 font-semibold mb-2">Hoặc nhập từ Google Drive / OneDrive</div>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="text"
                placeholder="Google Drive: link chia sẻ hoặc fileId"
                value={driveInput}
                onChange={(e) => setDriveInput(e.target.value)}
                disabled={importing || submitting}
                className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
              />
              <button type="button" onClick={importFromDrive} disabled={importing || submitting} className="px-3 py-2 rounded-md bg-emerald-600 text-white font-semibold disabled:opacity-60">Nhập từ Google Drive</button>
              <input
                type="text"
                placeholder="OneDrive: link chia sẻ"
                value={oneShareLink}
                onChange={(e) => setOneShareLink(e.target.value)}
                disabled={importing || submitting}
                className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
              />
              <button type="button" onClick={importFromOneDrive} disabled={importing || submitting} className="px-3 py-2 rounded-md bg-sky-600 text-white font-semibold disabled:opacity-60">Nhập từ OneDrive</button>
            </div>
            {errors.import && <p className="text-sm text-rose-300 mt-1">{errors.import}</p>}
          </div>
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
