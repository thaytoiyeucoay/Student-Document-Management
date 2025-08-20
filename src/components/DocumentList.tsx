import type { Document } from '../../types';
import DocumentItem from './DocumentItem';

interface DocumentListProps {
  documents: Document[];
  onDelete: (id: string) => void | Promise<void>;
  onUpdate: (doc: Document) => void | Promise<void>;
  onPreview?: (doc: Document) => void | Promise<void>;
}

const DocumentList = ({ documents, onDelete, onUpdate, onPreview }: DocumentListProps) => {
  return (
    <div className="space-y-6">
      <h2 className="text-xl md:text-2xl font-extrabold text-white drop-shadow">Tài liệu môn học</h2>
      {
        documents.length > 0 ? (
          <div className="space-y-4">
            {documents.map((doc) => (
              <DocumentItem key={doc.id} document={doc} onDelete={onDelete} onUpdate={onUpdate} onPreview={onPreview} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-6 rounded-2xl bg-white/10 backdrop-blur-md border-2 border-dashed border-white/30 ring-1 ring-white/10 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-white drop-shadow">Không có tài liệu</h3>
            <p className="mt-1 text-sm text-white/80">Hãy bắt đầu bằng cách thêm tài liệu mới cho môn học này.</p>
          </div>
        )
      }
    </div>
  );
};

export default DocumentList;
