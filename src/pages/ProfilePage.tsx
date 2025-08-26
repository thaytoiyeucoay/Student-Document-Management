import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import useAuth, { type AppRole } from '../hooks/useAuth';

function fieldOrFallback<T>(v: T | undefined | null, fb: T): T { return (v ?? fb) as T; }

export default function ProfilePage() {
  const { session, user, profile, loading } = useAuth();

  const [fullName, setFullName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdVisible, setPwdVisible] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const email = user?.email || session?.user?.email || '';
  const appRole: AppRole | undefined = profile?.role;

  useEffect(() => {
    setFullName(fieldOrFallback(profile?.full_name, ''));
    setAvatarUrl(fieldOrFallback(profile?.avatar_url, ''));
  }, [profile?.full_name, profile?.avatar_url]);

  const canSave = useMemo(() => {
    return !saving && !!session;
  }, [saving, session]);

  const canChangePwd = useMemo(() => {
    const ok = pwd1.length >= 6 && pwd1 === pwd2;
    return !!session && ok && !changingPwd;
  }, [pwd1, pwd2, changingPwd, session]);

  const avatarPreview = useMemo(() => {
    const fallback = user?.id ? `https://api.dicebear.com/9.x/identicon/svg?seed=${user.id}` : '';
    return avatarUrl?.trim() ? avatarUrl.trim() : fallback;
  }, [avatarUrl, user?.id]);

  const onSaveProfile = async () => {
    if (!session) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const { error: err } = await supabase.from('profiles').update({
        full_name: fullName?.trim() || null,
        avatar_url: avatarUrl?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', session.user.id);
      if (err) throw err;
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

  const onChangePassword = async () => {
    if (!session) return;
    if (pwd1.length < 6 || pwd1 !== pwd2) return;
    setError('');
    setMessage('');
    setChangingPwd(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pwd1 });
      if (err) throw err;
      setMessage('Đã đổi mật khẩu');
      toast.success('Đã đổi mật khẩu');
      setPwd1('');
      setPwd2('');
    } catch (e: any) {
      const msg = e?.message || 'Đổi mật khẩu thất bại';
      setError(msg);
      toast.error(msg);
    } finally {
      setChangingPwd(false);
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
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-white to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center text-slate-700 dark:text-white/80">Vui lòng đăng nhập để xem hồ sơ.</div>
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
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-white/60">Email</div>
                <div className="font-semibold text-slate-900 dark:text-white/95">{email}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-white/60">Vai trò: <span className={`px-1.5 py-0.5 rounded text-[11px] ${appRole === 'admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-100' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100'}`}>{appRole ?? 'student'}</span></div>
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

          {/* Right: Security */}
          <section className="lg:col-span-2 rounded-2xl bg-white/70 border border-slate-200 shadow-sm p-6 dark:bg-white/5 dark:border-white/10">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white/95">Bảo mật tài khoản</h2>
            <p className="text-sm text-slate-600 dark:text-white/60 mt-1">Đổi mật khẩu để bảo vệ tài khoản. Mật khẩu tối thiểu 6 ký tự.</p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Mật khẩu mới</label>
                <div className="relative">
                  <input type={pwdVisible ? 'text' : 'password'} value={pwd1} onChange={(e) => setPwd1(e.target.value)} placeholder="Tối thiểu 6 ký tự" className="w-full pr-10 px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-900 placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white/10 dark:border-white/15 dark:text-white dark:placeholder-white/60" />
                  <button type="button" onClick={() => setPwdVisible(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-white/85">{pwdVisible ? 'Ẩn' : 'Hiện'}</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Xác nhận mật khẩu</label>
                <input type={pwdVisible ? 'text' : 'password'} value={pwd2} onChange={(e) => setPwd2(e.target.value)} placeholder="Nhập lại mật khẩu" className="w-full px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-900 placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white/10 dark:border-white/15 dark:text-white dark:placeholder-white/60" />
              </div>
            </div>

            <div className="mt-4">
              <button disabled={!canChangePwd} onClick={onChangePassword} className={`px-4 py-2 rounded-md text-sm font-medium transition ${canChangePwd ? 'bg-primary-600 hover:bg-primary-700 text-white' : 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-white/10 dark:text-white/40'}`}>{changingPwd ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
              <div className="mt-2 text-xs text-slate-500 dark:text-white/60">Yêu cầu: tối thiểu 6 ký tự và 2 ô phải trùng nhau.</div>
            </div>

            <div className="mt-8">
              <h3 className="text-sm font-semibold text-white/85">Phiên đăng nhập</h3>
              <div className="mt-2 text-sm text-slate-600 dark:text-white/60">
                <div>Provider: Email</div>
                <div>User ID: {user?.id}</div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
