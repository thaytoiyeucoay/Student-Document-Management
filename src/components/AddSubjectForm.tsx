import { useState } from 'react';
import { semesters } from '../semesters';

interface AddSubjectFormProps {
  onAddSubject: (name: string, semester?: string) => void;
}

const AddSubjectForm = ({ onAddSubject }: AddSubjectFormProps) => {
  const [name, setName] = useState('');
  const [semester, setSemester] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddSubject(name, semester || undefined);
    setName('');
    setSemester('');
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-xl p-5 bg-white/10 backdrop-blur-md border border-white/30 shadow-lg ring-1 ring-white/20">
      <h2 className="text-lg font-semibold text-white drop-shadow mb-3">Thêm môn học mới</h2>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên môn học..."
            className="flex-1 min-w-0 px-3 py-2 rounded-md text-sm shadow-sm placeholder-white/60
              bg-white/15 border border-white/15 text-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
          />
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="px-3 py-2 rounded-md bg-white text-slate-900 text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 w-25 shrink-0"
            title="Kỳ học"
          >
            <option value="">- Kỳ học -</option>
            {semesters.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="inline-flex items-center justify-center px-4 py-2 font-semibold rounded-md shadow-lg text-white w-full
          bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 hover:from-slate-600 hover:via-slate-500 hover:to-slate-400
          focus:outline-none focus:ring-2 focus:ring-white/40 active:scale-[0.98] transition-all">
          Thêm
        </button>
      </div>
    </form>
  );
};

export default AddSubjectForm;
