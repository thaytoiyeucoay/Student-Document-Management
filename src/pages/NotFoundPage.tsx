import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gradient-to-br from-white via-white to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-lg text-center">
        <div className="text-7xl font-extrabold text-primary-600 dark:text-primary-400">404</div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white/95">Không tìm thấy trang</h1>
        <p className="mt-2 text-slate-600 dark:text-white/70">Có thể đường dẫn đã bị thay đổi hoặc bạn đã nhập sai URL.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            ← Quay về trang chủ
          </Link>
        </div>
      </div>
    </div>
  )
}
