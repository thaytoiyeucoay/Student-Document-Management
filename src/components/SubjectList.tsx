import { useState } from 'react';
import type { Subject } from '../../types';

interface SubjectListProps {
  subjects: Subject[];
  selectedSubjectId: string | null;
  onSelectSubject: (id: string) => void | Promise<void>;
  onUpdateSubject: (subject: Subject) => void | Promise<void>;
  onDeleteSubject: (id: string) => void | Promise<void>;
}

const SubjectList = ({ subjects, selectedSubjectId, onSelectSubject, onUpdateSubject, onDeleteSubject }: SubjectListProps) => {
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleEdit = (subject: Subject) => {
    setEditingSubjectId(subject.id);
    setEditingText(subject.name);
  };

  const handleSave = (id: string) => {
    if (!editingText.trim()) return;
    onUpdateSubject({ id, name: editingText });
    setEditingSubjectId(null);
    setEditingText('');
  };

  return (
    <div className="rounded-xl p-4 bg-white/10 backdrop-blur-md border border-white/30 shadow-lg ring-1 ring-white/20">
      <h2 className="text-lg font-semibold text-white drop-shadow mb-3">Danh sách môn học</h2>
      <ul className="space-y-1">
        {subjects.map(subject => (
          <li key={subject.id} className="group flex items-center gap-2 rounded-md">
            {editingSubjectId === subject.id ? (
              <>
                <input
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  className="flex-grow px-3 py-2 rounded-md text-sm shadow-sm placeholder-white/60
                    bg-white/15 border border-white/15 text-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
                />
                <button onClick={() => handleSave(subject.id)} className="p-2 text-white/85 hover:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onSelectSubject(subject.id)}
                  className={`flex-grow text-left px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                    selectedSubjectId === subject.id
                      ? 'text-white bg-gradient-to-r from-slate-700/80 via-slate-600/80 to-slate-500/80 shadow-lg ring-1 ring-white/20'
                      : 'text-white/90 hover:bg-white/10 border border-transparent'
                  }`}>
                  {subject.name}
                </button>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button onClick={() => handleEdit(subject)} className="p-2 text-white/85 hover:bg-white/15 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" />
                    </svg>
                  </button>
                  <button onClick={() => onDeleteSubject(subject.id)} className="p-2 text-white/85 hover:bg-white/15 rounded-md">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SubjectList;
