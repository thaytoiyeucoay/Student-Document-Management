# Backend FastAPI cho hệ thống Quản lý Tài liệu Sinh viên

## Giới thiệu
Backend sử dụng FastAPI, tích hợp Supabase (Postgres + Storage, pgvector) và pipeline RAG dựa trên LLM API (OpenAI/Gemini) để lập chỉ mục và truy vấn văn bản.

Lưu ý: Tính năng "Bản đồ khái niệm (Concept Graph)" đã được gỡ bỏ hoàn toàn khỏi hệ thống.
Lưu ý: Tính năng "Workspace" cũng đã được gỡ bỏ hoàn toàn. Không còn bất kỳ endpoint, model hay UI liên quan tới workspace.

## Yêu cầu
- Python 3.10+
- Supabase project với:
  - Bảng: `subjects`, `documents`
  - Storage bucket: `documents`
  - Bật RLS và cấu hình Policy (bên dưới)

## Cài đặt
1) Tạo môi trường ảo và cài đặt phụ thuộc
```
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
```

2) Tạo file `.env` trong thư mục `backend/` (tham khảo `.env.example`)

## Khởi chạy
Chạy server phát triển:
```
uvicorn backend.app.main:app --reload --port 8000
```

API base: `http://localhost:8000/api`

## Cấu hình môi trường (.env)
Tham khảo đầy đủ trong `backend/.env.example`. Một số biến thường dùng:

- SUPABASE_URL, SUPABASE_SERVICE_KEY
- STORE_BACKEND (mặc định: supabase)
- EMBED_PROVIDER, LLM_PROVIDER (tùy chọn)
- RAG_* (các biến cấu hình pipeline RAG)
- TAVILY_API_KEY (tùy chọn, bật tìm kiếm web)

## Cấu trúc bảng Supabase (SQL)
```
create table if not exists public.subjects (
  id bigserial primary key,
  name text not null,
  describes text,
  user_id uuid
);

create table if not exists public.documents (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  name text not null,
  describes text,
  author text,
  link text,
  favorite boolean default false,
  tags jsonb default '[]',
  file_url text,
  file_path text,
  created_at timestamptz default now(),
  user_id uuid
);

create index if not exists documents_subject_id_idx on public.documents(subject_id);
create index if not exists subjects_user_id_idx on public.subjects(user_id);
create index if not exists documents_user_id_idx on public.documents(user_id);
```

## RLS và Policies
Bật RLS cho cả hai bảng:
```
alter table public.subjects enable row level security;
alter table public.documents enable row level security;
```
Ví dụ policy (tùy chỉnh theo nhu cầu):
```
create policy if not exists subjects_owner on public.subjects
for all using (auth.uid() = user_id or user_id is null)
with check (auth.uid() = user_id or user_id is null);

create policy if not exists documents_owner on public.documents
for all using (auth.uid() = user_id or user_id is null)
with check (auth.uid() = user_id or user_id is null);
```

## Lưu trữ tệp (Storage)
- Tạo bucket `documents`.
- Nếu bucket Public: URL trả về từ backend có thể truy cập trực tiếp.
- Nếu bucket Private: điều chỉnh backend để trả về Signed URL (có thể bổ sung endpoint tạo link ký).

## Các endpoint chính
- GET `/api/health`
- Subjects: GET/POST/PATCH/DELETE `/api/subjects`
- Documents: GET/POST/PATCH/DELETE `/api/documents`
- Upload file: POST `/api/documents/{id}/upload` (multipart)

## Tính năng RAG
Pipeline RAG hoạt động với:

- Vector store: Supabase (pgvector)
- Embeddings/LLM: qua API nhà cung cấp (OpenAI/Gemini)
- Trích xuất văn bản: `pypdf`, `python-docx`, văn bản thuần

### Cài đặt phụ thuộc

```
pip install -r backend/requirements.txt
```





### Cách hoạt động

Khi upload tệp qua `/api/documents/{id}/upload`, backend sẽ:

1. Tải bytes lên Supabase Storage
2. Lập chỉ mục nội dung vào Supabase (pgvector) theo từng đoạn (chunk)

Lỗi trong quá trình lập chỉ mục sẽ không chặn việc upload tệp.

### Truy vấn RAG

```
POST /api/rag/query
{
  "query": "<câu hỏi>",
  "subject_id": "<tùy chọn: id môn học>",
  "top_k": 5,
  "web_search": true,        // tùy chọn: bật bổ sung ngữ cảnh từ web (Tavily)
  "web_top_k": 3            // tùy chọn: số kết quả web (1-8)
}
```

Phản hồi:

```
{
  "answer": "...",
  "contexts": [
    // mỗi item có thể là chuỗi snippet, hoặc đối tượng kèm url/title
    { "title": "...", "url": "https://...", "snippet": "..." }
  ]
}
```

#### Bật tính năng tìm kiếm web (Tavily)

- Đăng ký tài khoản và lấy API key tại https://tavily.com (có free tier).
- Thêm biến sau vào `backend/.env`:

```
TAVILY_API_KEY=tvly-...
```

- Khi client gửi `web_search=true`, backend sẽ gọi Tavily Search API và hợp nhất các snippet web vào danh sách `contexts`. Nếu thiếu `TAVILY_API_KEY`, phần web search sẽ bị bỏ qua an toàn.

### Cấu hình: dùng LLM API + Supabase (pgvector)

Nếu bạn không dùng stack local miễn phí và muốn:
- Gọi API của nhà cung cấp LLM/Embeddings (OpenAI/Gemini), và
- Lưu vector trên Supabase (pgvector),

hãy cấu hình như sau:

1) Biến môi trường `.env` (ví dụ):
```
# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

# Vector store: Supabase
STORE_BACKEND=supabase

# Embeddings + LLM qua API cloud (chọn một nhà cung cấp)
# OpenAI
EMBED_PROVIDER=openai
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini

# Hoặc Gemini
# EMBED_PROVIDER=gemini
# LLM_PROVIDER=gemini
# GEMINI_API_KEY=...
# GEMINI_EMBED_MODEL=models/text-embedding-004
# GEMINI_CHAT_MODEL=gemini-1.5-flash
```

2) Khởi tạo schema pgvector trên Supabase:
- Mở file `backend/pgvector.sql` và chạy toàn bộ nội dung trên Supabase SQL Editor.
- File này tạo bảng/lược đồ cần thiết cho `SupabaseVectorStore` (pgvector) và các chỉ mục liên quan.

3) Sử dụng:
- Upload tài liệu: `POST /api/documents/{id}/upload` sẽ lập chỉ mục vào Supabase pgvector thay vì Chroma.
- Truy vấn: `POST /api/rag/query` sẽ truy hồi từ pgvector; phần tạo answer dùng LLM theo `LLM_PROVIDER` đã chọn.

### Gợi ý gỡ lỗi nhanh
- Kiểm tra biến môi trường trong `backend/.env` và quyền truy cập Supabase.
- Xem log server trong terminal khi chạy `uvicorn`.

