import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../lib/toast';
import useAuth from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 p-4 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-white/15 p-6 shadow-2xl backdrop-blur">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AuthBar() {
  const { user, profile, signIn, signUp, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const caretBtnRef = useRef<HTMLButtonElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showNewPwd2, setShowNewPwd2] = useState(false);

  const emailValid = useMemo(() => /.+@.+\..+/.test(email.trim()), [email]);

  // Close dropdown on outside click or ESC
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // When menu opens, focus the first item for accessibility
  useEffect(() => {
    if (menuOpen) {
      // Defer to ensure element is rendered
      const t = setTimeout(() => {
        firstItemRef.current?.focus();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [menuOpen]);

  // Handle keyboard navigation inside the menu
  const onContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!menuOpen) return;
    const key = e.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      // We have only one item now; just prevent scroll
      e.preventDefault();
      firstItemRef.current?.focus();
    } else if (key === 'Enter' && document.activeElement === firstItemRef.current) {
      e.preventDefault();
      firstItemRef.current?.click();
    } else if (key === 'Escape') {
      e.preventDefault();
      setMenuOpen(false);
      caretBtnRef.current?.focus();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!user ? (
        <>
          <button onClick={() => { setShowLogin(true); setError(null); }} className="px-3 py-1.5 rounded-md text-sm bg-white border border-slate-200 hover:bg-slate-50 dark:bg-white/10 dark:border-white/15 dark:text-white/90 dark:hover:bg-white/15">Đăng nhập</button>
          <button onClick={() => { setShowRegister(true); setError(null); }} className="px-3 py-1.5 rounded-md text-sm bg-primary-600 text-white hover:bg-primary-700">Đăng ký</button>
        </>
      ) : (
        <div
          ref={containerRef}
          className="relative flex items-center"
          onKeyDown={onContainerKeyDown}
          // Close when focus leaves the container completely
          onBlur={(e) => {
            if (!containerRef.current) return;
            const next = e.relatedTarget as Node | null;
            if (next && containerRef.current.contains(next)) return;
            setMenuOpen(false);
          }}
        >
          <button onClick={() => navigate('/profile')} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 dark:bg-white/10 dark:border-white/15 dark:text-white/90 dark:hover:bg-white/15">
            <img src={profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile?.full_name || user.email || 'U')}`} alt="avatar" className="h-6 w-6 rounded-full border border-white/20" />
            <span className="text-sm truncate max-w-[140px]">{profile?.full_name || user.email}</span>
          </button>
          <button
            ref={caretBtnRef}
            aria-label="Mở menu người dùng"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Mở menu"
            onClick={() => setMenuOpen(v=>!v)}
            className="ml-1 px-2 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 dark:bg-white/10 dark:border-white/15 dark:text-white/90 dark:hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <span className="block px-1 py-0.5 select-none" aria-hidden>▾</span>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg p-2 z-20 dark:border-white/15 dark:bg-slate-900/95"
              role="menu"
            >
              <button
                ref={firstItemRef}
                role="menuitem"
                tabIndex={-1}
                onClick={async () => {
                const ok = window.confirm('Bạn có chắc muốn đăng xuất?');
                if (!ok) return;
                try {
                  await signOut();
                  toast.success('Đã đăng xuất');
                  setMenuOpen(false);
                  navigate('/');
                } catch (e: any) {
                  const msg = e?.message || 'Đăng xuất thất bại';
                  toast.error(msg);
                }
              }}
                className="w-full text-left px-3 py-2 rounded-md text-sm bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-white/5 dark:hover:bg-white/10"
              >Đăng xuất</button>
            </div>
          )}
        </div>
      )}

      {/* Login */}
      <Modal open={showLogin} onClose={() => setShowLogin(false)}>
        <h3 className="text-lg font-semibold mb-3">Đăng nhập</h3>
        {error && <div className="mb-3 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30">{error}</div>}
        <div className="space-y-3">
          <div>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button type="button" onClick={() => setShowPwd(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">{showPwd ? 'Ẩn' : 'Hiện'}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} disabled={loading} className="px-3 py-2 rounded-md border border-slate-200 bg-white text-sm hover:bg-slate-50">Google</button>
            <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })} disabled={loading} className="px-3 py-2 rounded-md border border-slate-200 bg-white text-sm hover:bg-slate-50">GitHub</button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowLogin(false)} className="px-3 py-1.5 text-sm rounded-md border">Hủy</button>
            <button disabled={loading || !emailValid || !password} onClick={async () => {
              setLoading(true); setError(null);
              try { await signIn(email, password); setShowLogin(false); }
              catch (e: any) { setError(e?.message || 'Đăng nhập thất bại'); }
              finally { setLoading(false); }
            }} className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">{loading ? 'Đang xử lý...' : 'Đăng nhập'}</button>
          </div>
        </div>
      </Modal>

      {/* Register */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)}>
        <h3 className="text-lg font-semibold mb-3">Tạo tài khoản</h3>
        {error && <div className="mb-3 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30">{error}</div>}
        <div className="space-y-3">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button type="button" onClick={() => setShowPwd(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">{showPwd ? 'Ẩn' : 'Hiện'}</button>
          </div>
          <div className="relative">
            <input type={showPwd2 ? 'text' : 'password'} placeholder="Xác nhận mật khẩu" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button type="button" onClick={() => setShowPwd2(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">{showPwd2 ? 'Ẩn' : 'Hiện'}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} disabled={loading} className="px-3 py-2 rounded-md border border-slate-200 bg-white text-sm hover:bg-slate-50">Google</button>
            <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })} disabled={loading} className="px-3 py-2 rounded-md border border-slate-200 bg-white text-sm hover:bg-slate-50">GitHub</button>
          </div>
          <div className="text-xs text-slate-600">Sau khi đăng ký, kiểm tra email để xác nhận (nếu Supabase bật email confirm).</div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowRegister(false)} className="px-3 py-1.5 text-sm rounded-md border">Hủy</button>
            <button disabled={loading || !emailValid || !password || password !== confirm} onClick={async () => {
              setLoading(true); setError(null);
              try { await signUp(email, password); setShowRegister(false); }
              catch (e: any) { setError(e?.message || 'Đăng ký thất bại'); }
              finally { setLoading(false); }
            }} className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60">{loading ? 'Đang xử lý...' : 'Đăng ký'}</button>
          </div>
        </div>
      </Modal>

      {/* Profile */}
      <Modal open={showProfile} onClose={() => setShowProfile(false)}>
        <h3 className="text-lg font-semibold mb-3">Cập nhật hồ sơ</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[96px_1fr] gap-4">
          <div className="flex flex-col items-center gap-2">
            <img src={avatarUrl || profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile?.full_name || user?.email || 'U')}`} alt="avatar" className="h-24 w-24 rounded-full border border-slate-200 object-cover" />
            <span className="text-xs text-slate-500">Xem trước</span>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Email</label>
                <input value={user?.email || ''} readOnly className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Vai trò</label>
                <input value={profile?.role || ''} readOnly className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm bg-slate-50 capitalize" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Họ tên</label>
              <input type="text" placeholder="Họ tên" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Avatar URL</label>
              <input type="url" placeholder="https://..." value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="pt-1">
              <div className="text-sm font-medium mb-1">Đổi mật khẩu</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <input type={showNewPwd ? 'text' : 'password'} placeholder="Mật khẩu mới" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  <button type="button" onClick={() => setShowNewPwd(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">{showNewPwd ? 'Ẩn' : 'Hiện'}</button>
                </div>
                <div className="relative">
                  <input type={showNewPwd2 ? 'text' : 'password'} placeholder="Xác nhận mật khẩu" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  <button type="button" onClick={() => setShowNewPwd2(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">{showNewPwd2 ? 'Ẩn' : 'Hiện'}</button>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-1">Để trống nếu không muốn đổi mật khẩu.</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowProfile(false)} className="px-3 py-1.5 text-sm rounded-md border">Đóng</button>
              <button onClick={async () => {
                try {
                  // Update profile
                  await (await import('../api')).default.updateMyProfile({ full_name: fullName || undefined, avatar_url: avatarUrl || undefined });
                  // Change password if provided
                  if (newPwd || newPwd2) {
                    if (newPwd !== newPwd2) throw new Error('Mật khẩu xác nhận không khớp');
                    if (newPwd.length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự');
                    const { error: upErr } = await supabase.auth.updateUser({ password: newPwd });
                    if (upErr) throw upErr;
                  }
                  await refreshProfile();
                  setShowProfile(false);
                } catch (e: any) {
                  setError(e?.message || 'Cập nhật thất bại');
                }
              }} className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700">Lưu</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
