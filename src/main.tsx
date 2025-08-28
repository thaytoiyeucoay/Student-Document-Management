import { StrictMode, Component, type ReactNode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
// Auth removed: routes are public
import { Toaster } from 'react-hot-toast'
import ScrollToTop from './components/ScrollToTop'

// Debug: đánh dấu thời điểm file main.tsx được thực thi
// eslint-disable-next-line no-console
console.log('[boot] main.tsx loaded at', new Date().toISOString());

// Lightweight error boundary component (to tránh trang trắng nếu có lỗi runtime)
class ErrorBoundaryReact extends Component<{ children: ReactNode }, { hasError: boolean; error?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    // eslint-disable-next-line no-console
    console.error('Runtime error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 720 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Đã xảy ra lỗi khi render ứng dụng</h1>
            <p style={{ color: '#555', marginBottom: 12 }}>Kiểm tra Console để xem chi tiết lỗi. Nếu là lỗi extension trình duyệt, hãy thử Incognito.</p>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f8f8', padding: 12, borderRadius: 8, border: '1px solid #eee' }}>
              {String(this.state.error || '')}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

// Auth guard removed

// Fallback UI if React crashes at runtime
function Root() {
  // eslint-disable-next-line no-console
  console.log('[boot] Root render()');
  return (
    <StrictMode>
      <ErrorBoundaryReact>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/profile" element={
              <Suspense fallback={
                <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                    <span className="animate-spin inline-block h-4 w-4 border-2 border-slate-300 border-t-slate-500 rounded-full" />
                    <span>Đang tải trang hồ sơ...</span>
                  </div>
                </div>
              }>
                <ProfilePage />
              </Suspense>
            } />
            <Route path="/" element={<App />} />
            <Route path="*" element={
              <Suspense fallback={<div style={{ padding: 24, color: '#64748b' }}>Đang tải...</div>}> 
                <NotFoundPage />
              </Suspense>
            } />
          </Routes>
          <Toaster position="top-right" toastOptions={{ duration: 2500 }} />
        </BrowserRouter>
      </ErrorBoundaryReact>
    </StrictMode>
  );
}

const rootEl = document.getElementById('root');
// eslint-disable-next-line no-console
console.log('[boot] root element exists?', !!rootEl);
createRoot(rootEl!).render(<Root />)
