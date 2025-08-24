import { useState } from 'react';
import api from '../api';

export default function ImagesToPdf({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    setError(null);
  };

  const handleConvert = async () => {
    try {
      setLoading(true);
      setError(null);
      const blob = await api.aiImagesToPdf(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = files.length === 1 ? `${(files[0].name || 'image').replace(/\.[^.]+$/, '')}.pdf` : 'images.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-slate-900/90 border border-white/15 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/30">
        <div className="text-white/95 font-semibold">Gộp ảnh thành PDF</div>
        <button onClick={onClose} className="px-2 py-1 text-white/80 hover:text-white">✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-sm text-white/80">Chọn 1 hoặc nhiều ảnh (PNG/JPG/WebP) để gộp thành 1 file PDF.</div>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={onPick}
          className="block w-full text-sm text-white/90 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-white/10 file:text-white/90 hover:file:bg-white/15"
        />
        {files.length > 0 && (
          <div className="text-xs text-white/70">
            Đã chọn: {files.length} ảnh
          </div>
        )}
        {error && (
          <div className="text-sm text-red-300">{error}</div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button
            disabled={loading || files.length === 0}
            onClick={handleConvert}
            className="px-3 py-2 rounded-md text-sm bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700"
          >{loading ? 'Đang xử lý…' : 'Tạo PDF'}</button>
          <button onClick={onClose} className="px-3 py-2 rounded-md text-sm bg-white/10 text-white/90 hover:bg-white/15">Đóng</button>
        </div>
      </div>
    </div>
  );
}
