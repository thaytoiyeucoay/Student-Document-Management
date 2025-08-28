import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../lib/toast';
import api from '../api';

function fieldOrFallback<T>(v: T | undefined | null, fb: T): T { return (v ?? fb) as T; }

export default function ProfilePage() {
  const [fullName, setFullName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [role, setRole] = useState<'admin' | 'student'>('student');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');


  useEffect(() => {
    (async () => {
      try {
        const me = await api.getMyProfile();
        setFullName(fieldOrFallback(me.full_name as any, ''));
        setAvatarUrl(fieldOrFallback(me.avatar_url as any, ''));
        setRole((me.role as any) || 'student');
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.warn('Tải hồ sơ thất bại', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canSave = useMemo(() => {
    return !saving;
  }, [saving]);

  const avatarPreview = useMemo(() => {
    const fallback = `https://api.dicebear.com/9.x/identicon/svg?seed=public-user`;
    return avatarUrl?.trim() ? avatarUrl.trim() : fallback;
  }, [avatarUrl]);

  const onSaveProfile = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api.updateMyProfile({
        full_name: fullName?.trim() || undefined,
        avatar_url: avatarUrl?.trim() || undefined,
      } as any);
      setMessage('Đã lưu hồ sơ');
      toast.success('Đã lưu hồ sơ');
    } catch (e: any) {
      const msg = e?.message || 'Lưu hồ sơ thất bại';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-white to-slate-100 text-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:text-slate-100">
        <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-slate-200 dark:bg-white/5 dark:border-white/10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="h-6 w-40 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left skeleton card */}
            <section className="lg:col-span-1 rounded-2xl bg-white/70 border border-slate-200 shadow-sm p-6 dark:bg-white/5 dark:border-white/10">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
                  <div className="h-3 w-24 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div className="h-10 w-full rounded-md bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="h-10 w-full rounded-md bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="h-9 w-full rounded-md bg-slate-300 dark:bg-white/15 animate-pulse" />
              </div>
            </section>
            {/* Right skeleton card */}
            <section className="lg:col-span-2 rounded-2xl bg-white/70 border border-slate-200 shadow-sm p-6 dark:bg-white/5 dark:border-white/10">
              <div className="h-5 w-52 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-10 w-full rounded-md bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="h-10 w-full rounded-md bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="h-10 w-full rounded-md bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="h-10 w-full rounded-md bg-slate-200 dark:bg-white/10 animate-pulse" />
              </div>
              <div className="mt-6 h-9 w-36 rounded-md bg-slate-300 dark:bg-white/15 animate-pulse" />
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-white to-slate-100 text-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:text-slate-100">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-slate-200 dark:bg-white/5 dark:border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white/95 tracking-tight">Hồ sơ cá nhân</h1>
            <p className="text-slate-600 dark:text-white/60 text-sm mt-1">Quản lý thông tin tài khoản và bảo mật</p>
          </div>
          <Link to="/" className="px-3 py-2 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:bg-white/10 dark:border-white/15 dark:text-white/90 dark:hover:bg-white/15">← Quay về</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(message || error) && (
          <div className={`mb-4 rounded-lg border p-3 text-sm ${error ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100' : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100'}`}>
            {error || message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Avatar + basic info */}
          <section className="lg:col-span-1 rounded-2xl bg-white/70 border border-slate-200 shadow-sm p-6 dark:bg-white/5 dark:border-white/10">
            <div className="flex items-center gap-4">
              <img src={avatarPreview} alt="avatar" className="h-20 w-20 rounded-full ring-2 ring-white/60 object-cover" />
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-white/60">Chế độ</div>
                <div className="font-semibold text-slate-900 dark:text-white/95">Công khai (không đăng nhập)</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-white/60">Vai trò: <span className={`px-1.5 py-0.5 rounded text-[11px] ${role === 'admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-100' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100'}`}>{role ?? 'student'}</span></div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Họ và tên</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nhập họ tên" className="w-full px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-900 placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white/10 dark:border-white/15 dark:text-white dark:placeholder-white/60" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ảnh đại diện (URL)</label>
                <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-900 placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white/10 dark:border-white/15 dark:text-white dark:placeholder-white/60" />
              </div>
              <div className="pt-1">
                <button disabled={!canSave} onClick={onSaveProfile} className={`w-full px-4 py-2 rounded-md text-sm font-medium transition ${canSave ? 'bg-primary-600 hover:bg-primary-700 text-white' : 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-white/10 dark:text-white/40'}`}>{saving ? 'Đang lưu...' : 'Lưu hồ sơ'}</button>
              </div>
            </div>
          </section>

          {/* Right: Gợi ý */}
          <section className="lg:col-span-2 rounded-2xl bg-white/70 border border-slate-200 shadow-sm p-6 dark:bg-white/5 dark:border-white/10">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white/95">Gợi ý</h2>
            <p className="text-sm text-slate-600 dark:text-white/60 mt-1">Phiên bản công khai không có tài khoản. Bạn có thể tùy chỉnh tên hiển thị và avatar cho chế độ công khai.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
