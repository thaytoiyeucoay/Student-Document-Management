import { useMemo, useState } from 'react';
import useAuth from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

export default function AuthCard() {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [agree, setAgree] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const emailValid = useMemo(() => /.+@.+\..+/.test(email.trim()), [email]);
  const pwdStrength = useMemo(() => {
    const p = password;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[a-z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s; // 0..5
  }, [password]);
  const pwdBar = ['bg-red-500','bg-orange-500','bg-amber-500','bg-lime-500','bg-emerald-500'];

  async function handleLogin() {
    setLoading(true); setError(null); setSuccess(null);
    try {
      await signIn(email, password);
    } catch (e: any) {
      setError(e?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    setLoading(true); setError(null); setSuccess(null);
    try {
      if (password !== confirm) throw new Error('Mật khẩu xác nhận không khớp');
      if (!agree) throw new Error('Vui lòng đồng ý điều khoản sử dụng');
      await signUp(email, password);
      setSuccess('Đăng ký thành công. Vui lòng kiểm tra email để xác nhận (nếu bật). Sau đó bạn có thể đăng nhập.');
      setTab('login');
    } catch (e: any) {
      setError(e?.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: 'google' | 'github') {
    try {
      setLoading(true); setError(null); setSuccess(null);
      await supabase.auth.signInWithOAuth({ provider });
    } catch (e: any) {
      setError(e?.message || 'Đăng nhập OAuth thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white/85 backdrop-blur shadow-2xl dark:bg-slate-900/60 dark:border-white/10">
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Left: Brand / Hero (minimal) */}
        <div className="relative p-8 md:p-10 bg-white/70 text-slate-800 border-r border-slate-200 dark:bg-white/5 dark:text-white/90 dark:border-white/10">
          <h2 className="text-2xl font-extrabold tracking-tight">Quản lý tài liệu sinh viên</h2>
          <p className="mt-2 text-slate-600 dark:text-white/70 text-sm">Đăng nhập để đồng bộ tài liệu, thời khóa biểu, bảng điểm và nhiều tiện ích khác.</p>
          <ul className="mt-6 space-y-2 text-sm text-slate-700 dark:text-white/75">
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-white/70"></span> Lưu trữ tài liệu theo môn học</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-white/70"></span> Tìm kiếm, gắn thẻ, đánh dấu yêu thích</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-white/70"></span> Bảng Kanban học tập và thống kê</li>
          </ul>
          <div className="mt-8 hidden md:block text-xs text-slate-500 dark:text-white/60">© {new Date().getFullYear()} Student Document Manager</div>
        </div>

        {/* Right: Form */}
        <div className="p-8 md:p-10 bg-white/90 dark:bg-transparent">
          <div className="flex items-center gap-2 mb-6">
            <button
              type="button"
              onClick={() => { setTab('login'); setError(null); setSuccess(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab==='login' ? 'bg-primary-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15'}`}
            >Đăng nhập</button>
            <button
              type="button"
              onClick={() => { setTab('register'); setError(null); setSuccess(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab==='register' ? 'bg-primary-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15'}`}
            >Đăng ký</button>
          </div>

          {error && <div className="mb-3 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30">{error}</div>}
          {success && <div className="mb-3 rounded-md bg-emerald-50 text-emerald-700 text-sm px-3 py-2 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30">{success}</div>}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!emailValid) { setError('Email không hợp lệ'); return; }
              if (!password) { setError('Vui lòng nhập mật khẩu'); return; }
              if (tab === 'login') await handleLogin(); else await handleRegister();
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-700 dark:text-white/90">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-base text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white dark:text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-700 dark:text-white/90">Mật khẩu</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-base text-slate-900 bg-white pr-12 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white dark:text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600 hover:text-slate-900"
                >{showPwd ? 'Ẩn' : 'Hiện'}</button>
              </div>
              {/* Strength bar */}
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full transition-all duration-300 ${pwdBar[Math.max(0, Math.min(4, pwdStrength-1))]}`} style={{ width: `${(pwdStrength/5)*100}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-slate-500">Độ mạnh mật khẩu</div>
            </div>

            {tab === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-700 dark:text-white/90">Xác nhận mật khẩu</label>
                  <div className="relative">
                    <input
                      type={showPwd2 ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-base text-slate-900 bg-white pr-12 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-white dark:text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd2(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600 hover:text-slate-900"
                    >{showPwd2 ? 'Ẩn' : 'Hiện'}</button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4" />
                  Tôi đồng ý với <a className="underline hover:text-slate-900" href="#" onClick={(e)=>e.preventDefault()}>Điều khoản dịch vụ</a>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading || (tab==='register' && (!agree || !confirm))}
              className="w-full px-5 py-3 text-base font-semibold rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 shadow focus:outline-none focus:ring-2 focus:ring-primary-500"
            >{loading ? 'Đang xử lý...' : (tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản')}</button>
          </form>

          {/* OAuth */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-white/10" /></div>
              <div className="relative flex justify-center"><span className="bg-transparent px-2 text-xs text-slate-500">hoặc</span></div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={() => oauth('google')} disabled={loading} className="px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm dark:bg-white dark:text-slate-900">Đăng nhập với Google</button>
              <button onClick={() => oauth('github')} disabled={loading} className="px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm dark:bg-white dark:text-slate-900">Đăng nhập với GitHub</button>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-500">
            Khi tiếp tục, bạn đồng ý tuân thủ nguyên tắc cộng đồng. Nếu chưa bật OAuth/email confirm trong Supabase, vui lòng dùng đăng nhập bằng email/mật khẩu.
          </div>
        </div>
      </div>
    </div>
  );
}
