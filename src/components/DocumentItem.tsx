import { useState } from 'react';
import type { Document } from '../../types';

interface DocumentItemProps {
  document: Document;
  onDelete: (id: string) => void;
  onUpdate: (doc: Document) => void;
  onPreview?: (doc: Document) => void;
}

const DocumentItem = ({ document, onDelete, onUpdate, onPreview }: DocumentItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedDoc, setEditedDoc] = useState(document);
  const [tagsText, setTagsText] = useState((document.tags || []).join(', '));

  const handleSave = () => {
    const tags = tagsText
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    onUpdate({ ...editedDoc, tags });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="rounded-xl p-4 bg-white/15 backdrop-blur-md border border-white/30 shadow-lg ring-1 ring-white/20 space-y-3">
        <h3 className="text-md font-semibold text-white/95 drop-shadow mb-2">Chỉnh sửa tài liệu</h3>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Tên tài liệu"
            value={editedDoc.name}
            onChange={(e) => setEditedDoc({ ...editedDoc, name: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 text-sm shadow-sm
              focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
          />
          <input
            type="text"
            placeholder="Mô tả"
            value={editedDoc.describes}
            onChange={(e) => setEditedDoc({ ...editedDoc, describes: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 text-sm shadow-sm
              focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
          />
          <input
            type="text"
            placeholder="Tác giả"
            value={editedDoc.author}
            onChange={(e) => setEditedDoc({ ...editedDoc, author: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 text-sm shadow-sm
              focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
          />
          <input
            type="text"
            placeholder="Link tham khảo"
            value={editedDoc.link}
            onChange={(e) => setEditedDoc({ ...editedDoc, link: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 text-sm shadow-sm
              focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
          />
          <input
            type="text"
            placeholder="Tags (phân tách bằng dấu phẩy)"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-white/15 border border-white/15 text-white placeholder-white/60 text-sm shadow-sm
              focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
          />
        </div>
        <div className="flex justify-end space-x-2 pt-2">
          <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-semibold text-white/90 bg-white/10 border border-white/20 rounded-md shadow-sm hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 active:scale-[0.98] transition">
            Hủy
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-semibold text-white rounded-md shadow-lg
            bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 hover:from-slate-600 hover:via-slate-500 hover:to-slate-400
            focus:outline-none focus:ring-2 focus:ring-white/40 active:scale-[0.98] transition">
            Lưu thay đổi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 bg-white/10 backdrop-blur-md border border-white/20 shadow-lg ring-1 ring-white/10 transition-all hover:shadow-xl hover:translate-y-[-1px]">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 h-12 w-12 rounded-lg flex items-center justify-center bg-gradient-to-br from-white/40 to-white/20 text-slate-200 ring-1 ring-white/20">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-grow">
          <h3 className="text-md font-semibold text-white/95 drop-shadow">{document.name}</h3>
          <p className="text-sm text-white/85 mt-1">{document.describes}</p>
          <p className="text-xs text-white/70 mt-2">Tác giả: {document.author}</p>
          {document.tags && document.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {document.tags.map((t, idx) => (
                <span key={idx} className="px-2 py-0.5 text-[11px] rounded-full bg-white/10 border border-white/20 text-white/90">#{t}</span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-4">
            {document.link && (
              <a href={document.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Xem online
              </a>
            )}
            {document.fileUrl && (
              <a href={document.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Tải file
              </a>
            )}
            {(document.link || document.fileUrl) && (
              <button
                onClick={() => onPreview && onPreview(document)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white transition-colors px-3 py-1 rounded-md bg-white/10 border border-white/20"
                title="Xem nhanh trong ứng dụng"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 3a7 7 0 016.938 6.09A1 1 0 0117.95 10a1 1 0 01-.012.91A7 7 0 1110 3zm0 3a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
                Xem nhanh
              </button>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          <button
            onClick={() => onUpdate({ ...document, favorite: !document.favorite })}
            className={`p-2 rounded-md transition-colors ${document.favorite ? 'text-amber-300 hover:bg-white/15' : 'text-white/70 hover:bg-white/15'}`}
            title={document.favorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.036 3.19a1 1 0 00.95.69h3.356c.969 0 1.371 1.24.588 1.81l-2.716 1.973a1 1 0 00-.364 1.118l1.036 3.19c.3.921-.755 1.688-1.54 1.118l-2.716-1.973a1 1 0 00-1.175 0l-2.716 1.973c-.784.57-1.838-.197-1.539-1.118l1.036-3.19a1 1 0 00-.364-1.118L2.07 8.617c-.783-.57-.38-1.81.588-1.81h3.356a1 1 0 00.95-.69l1.036-3.19z" />
            </svg>
          </button>
          <button onClick={() => setIsEditing(true)} className="p-2 text-white/85 rounded-md hover:bg-white/15 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" />
            </svg>
          </button>
          <button onClick={() => onDelete(document.id)} className="p-2 text-white/85 rounded-md hover:bg-white/15 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentItem;
