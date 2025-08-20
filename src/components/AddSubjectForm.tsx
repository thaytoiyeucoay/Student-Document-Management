import { useState } from 'react';

interface AddSubjectFormProps {
  onAddSubject: (name: string) => void;
}

const AddSubjectForm = ({ onAddSubject }: AddSubjectFormProps) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddSubject(name);
    setName('');
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-xl p-5 bg-white/10 backdrop-blur-md border border-white/30 shadow-lg ring-1 ring-white/20">
      <h2 className="text-lg font-semibold text-white drop-shadow mb-3">Thêm môn học mới</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên môn học..."
          className="flex-grow px-3 py-2 rounded-md text-sm shadow-sm placeholder-white/60
            bg-white/15 border border-white/15 text-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
        />
        <button type="submit" className="inline-flex items-center justify-center px-4 py-2 font-semibold rounded-md shadow-lg text-white
          bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 hover:from-slate-600 hover:via-slate-500 hover:to-slate-400
          focus:outline-none focus:ring-2 focus:ring-white/40 active:scale-[0.98] transition-all">
          Thêm
        </button>
      </div>
    </form>
  );
};

export default AddSubjectForm;
