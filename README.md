# Ứng dụng Quản lý Tài liệu Sinh viên (React + FastAPI)

Frontend: React + TypeScript + Vite (TailwindCSS).
Backend: FastAPI, tích hợp Supabase (Postgres + Storage, pgvector) và RAG dựa trên LLM API (OpenAI/Gemini).

## Kiến trúc
- Frontend: thư mục `src/` (Vite React TS).
- Backend: thư mục `backend/` (FastAPI, tài liệu ở `backend/README.md`).
- Supabase: bảng `subjects`, `documents`; bucket `documents`; pgvector để lưu embeddings.

## Yêu cầu
- Node.js 18+
- Python 3.10+
- Tài khoản Supabase và project đã tạo

## Cài đặt nhanh
1) Cài đặt phụ thuộc Frontend
```
npm install
```

2) Cài đặt phụ thuộc Backend
```
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
```

3) Cấu hình Supabase + RAG (bắt buộc)
- Tạo file `backend/.env` theo mẫu dưới (chọn OpenAI hoặc Gemini)
- Chạy toàn bộ file SQL `backend/pgvector.sql` trên Supabase SQL Editor để khởi tạo lược đồ pgvector

Mẫu `.env` (OpenAI):
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

STORE_BACKEND=supabase

EMBED_PROVIDER=openai
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
```

Mẫu `.env` (Gemini):
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

STORE_BACKEND=supabase

EMBED_PROVIDER=gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_EMBED_MODEL=models/text-embedding-004
GEMINI_CHAT_MODEL=gemini-1.5-flash
```

4) Bật RLS và Policy cho bảng
- Xem hướng dẫn chi tiết và SQL mẫu ở `backend/README.md` (mục RLS & Policies).

## Chạy ứng dụng
- Backend (dev):
```
uvicorn backend.app.main:app --reload --port 8000
```
API base: `http://localhost:8000/api`

- Frontend (dev):
```
npm run dev
```
Mặc định Vite chạy ở `http://localhost:5173`

## Luồng RAG
- Upload tài liệu: `POST /api/documents/{id}/upload` (multipart). Backend lưu file vào Supabase Storage và lập chỉ mục embedding vào Supabase pgvector.
- Truy vấn: `POST /api/rag/query` với `{ query, subject_id?, top_k? }`. Backend truy hồi từ pgvector và sinh câu trả lời bằng LLM đã cấu hình.

## Các endpoint chính (Backend)
- GET `/api/health`
- Subjects: GET/POST/PATCH/DELETE `/api/subjects`
- Documents: GET/POST/PATCH/DELETE `/api/documents`
- Upload file: POST `/api/documents/{id}/upload`
- RAG Query: POST `/api/rag/query`

## Lưu ý triển khai
- Bucket Supabase `documents` có thể public hoặc private. Nếu private, cần triển khai Signed URL ở backend.
- Kiểm tra quyền RLS để phù hợp với mô hình người dùng của bạn (owner, shared, v.v.).

## Gỡ lỗi nhanh
- Kiểm tra biến môi trường trong `backend/.env`.
- Xem log backend khi chạy `uvicorn`.
- Xác minh đã chạy `backend/pgvector.sql` và có bảng/extension pgvector ở Supabase.

## Tài liệu thêm
- Chi tiết backend: `backend/README.md`
