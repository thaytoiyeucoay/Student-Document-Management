import { useMemo, useState } from 'react';
import api from '../api';

export default function FreeOcr({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [lang, setLang] = useState<'vie' | 'eng' | 'eng+vie'>('vie');
  const [psm, setPsm] = useState<number>(6);
  const [oem, setOem] = useState<number>(3);
  const [preprocess, setPreprocess] = useState<'none' | 'binary' | 'adaptive' | 'enhance'>('enhance');
  const [upscale, setUpscale] = useState<number>(2);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; pages: { filename: string; text: string; chars: number }[] } | null>(null);

  const handlePick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    setError(null);
    setResult(null);
  };

  const chars = useMemo(() => (result?.text?.length ?? 0), [result]);

  const onRun = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.aiFreeOcr(files, lang, { psm, oem, preprocess, upscale });
      setResult({ text: data.text, pages: data.pages });
    } catch (e: any) {
      setError(e?.message || 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  };

  const onCopy = async () => {
    try {
      if (result?.text) await navigator.clipboard.writeText(result.text);
    } catch {}
  };

  return (
    <div className="w-full max-w-4xl bg-slate-900/90 border border-white/15 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/30">
        <div className="text-white/95 font-semibold">OCR miễn phí (Tesseract)</div>
        <button onClick={onClose} className="px-2 py-1 text-white/80 hover:text-white">✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-sm text-white/80">Chọn ảnh chữ viết tay, sau đó chạy OCR để lấy văn bản đánh máy. Lưu ý: độ chính xác phụ thuộc chất lượng ảnh và font chữ.</div>
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePick}
            className="block w-full text-sm text-white/90 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-white/10 file:text-white/90 hover:file:bg-white/15"
          />
          <select value={lang} onChange={(e) => setLang(e.target.value as any)} className="px-3 py-2 rounded-md bg-white/10 text-white/90 border border-white/15">
            <option value="vie">Tiếng Việt (vie)</option>
            <option value="eng">English (eng)</option>
            <option value="eng+vie">eng+vie</option>
          </select>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="px-3 py-2 rounded-md text-sm bg-white/10 text-white/90 border border-white/15 hover:bg-white/15"
          >{showAdvanced ? 'Ẩn nâng cao' : 'Tùy chọn nâng cao'}</button>
          <button
            disabled={loading || files.length === 0}
            onClick={onRun}
            className="px-3 py-2 rounded-md text-sm bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700"
          >{loading ? 'Đang OCR…' : 'Chạy OCR'}</button>
        </div>
        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-white/90 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/70">PSM</span>
              <select value={psm} onChange={(e) => setPsm(parseInt(e.target.value))} className="px-2 py-1.5 rounded-md bg-white/10 border border-white/15">
                <option value={6}>6: Khối văn bản</option>
                <option value={7}>7: Một dòng</option>
                <option value={11}>11: Văn bản thưa</option>
                <option value={13}>13: Single raw line</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/70">OEM</span>
              <select value={oem} onChange={(e) => setOem(parseInt(e.target.value))} className="px-2 py-1.5 rounded-md bg-white/10 border border-white/15">
                <option value={1}>1: Legacy</option>
                <option value={3}>3: Default</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/70">Tiền xử lý</span>
              <select value={preprocess} onChange={(e) => setPreprocess(e.target.value as any)} className="px-2 py-1.5 rounded-md bg-white/10 border border-white/15">
                <option value="enhance">Tăng cường</option>
                <option value="adaptive">Nhị phân thích nghi</option>
                <option value="binary">Nhị phân</option>
                <option value="none">Không</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/70">Upscale</span>
              <select value={upscale} onChange={(e) => setUpscale(parseInt(e.target.value))} className="px-2 py-1.5 rounded-md bg-white/10 border border-white/15">
                <option value={1}>x1</option>
                <option value={2}>x2</option>
                <option value={3}>x3</option>
                <option value={4}>x4</option>
              </select>
            </label>
          </div>
        )}
        {files.length > 0 && (
          <div className="text-xs text-white/70">Đã chọn: {files.length} ảnh</div>
        )}
        {error && <div className="text-sm text-red-300">{error}</div>}

        {result && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-white/80">Kết quả tổng hợp ({chars} ký tự)</div>
              <div className="flex items-center gap-2">
                <button onClick={onCopy} className="px-3 py-1.5 rounded-md text-xs bg-white/10 text-white/90 hover:bg-white/15">Copy</button>
                <a
                  className="px-3 py-1.5 rounded-md text-xs bg-white/10 text-white/90 hover:bg-white/15"
                  href={URL.createObjectURL(new Blob([result.text], { type: 'text/plain' }))}
                  download="ocr.txt"
                >Tải .txt</a>
              </div>
            </div>
            <textarea
              className="w-full h-56 rounded-lg bg-black/30 border border-white/10 text-white/90 p-3 text-sm"
              value={result.text}
              readOnly
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-white/80">Chi tiết theo ảnh ▾</summary>
              <div className="mt-2 space-y-3">
                {result.pages.map((p, idx) => (
                  <div key={idx} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-white/60 mb-1">{p.filename} — {p.chars} ký tự</div>
                    <pre className="whitespace-pre-wrap text-sm text-white/90">{p.text}</pre>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
