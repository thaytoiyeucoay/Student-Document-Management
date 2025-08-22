# FastAPI Backend for React Study

## Prerequisites
- Python 3.10+
- Supabase project with:
  - Tables: `subjects`, `documents`
  - Storage bucket: `documents`
  - RLS and policies configured (see below)

## Setup
1) Create a virtual environment and install deps
```
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
```

2) Create `.env` in `backend/` (see `.env.example`)

3) Run the server
```
uvicorn backend.app.main:app --reload --port 8000
```

API base: `http://localhost:8000/api`

## Environment (.env)
See `.env.example` for all options.

## Supabase Tables (SQL)
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

## RLS and Policies
Enable RLS on both tables:
```
alter table public.subjects enable row level security;
alter table public.documents enable row level security;
```
Example permissive policy (adjust to your needs):
```
create policy if not exists subjects_owner on public.subjects
for all using (auth.uid() = user_id or user_id is null)
with check (auth.uid() = user_id or user_id is null);

create policy if not exists documents_owner on public.documents
for all using (auth.uid() = user_id or user_id is null)
with check (auth.uid() = user_id or user_id is null);
```

## Storage
- Create bucket `documents`.
- Public bucket: URLs returned by backend are public.
- Private bucket: adjust backend to return signed URLs (can add an endpoint to generate signed URLs on demand).

## Endpoints
- GET `/api/health`
- Subjects: GET/POST/PATCH/DELETE `/api/subjects`
- Documents: GET/POST/PATCH/DELETE `/api/documents`
- Upload file: POST `/api/documents/{id}/upload` (multipart)

## RAG Chatbot (100% free, local)

This backend ships with a fully local, free RAG pipeline using:

- Embeddings: `sentence-transformers/all-MiniLM-L6-v2`
- Vector DB: `ChromaDB` (persisted to `backend/rag_store` by default)
- Text extraction: `pypdf`, `python-docx`, plain text
- LLM (optional): `Ollama` if you already installed it. If not available, the API falls back to a simple extractive answer from retrieved chunks.

### Install dependencies

```
pip install -r backend/requirements.txt
```

### Optional: Local LLM with Ollama

Install Ollama from https://ollama.com/download, then pull a model, e.g.:

```
ollama pull llama3.1:8b
```

You can change the model via `OLLAMA_MODEL` in `.env`.

### Environment (optional)

See `backend/.env.example` for RAG options:

- `RAG_STORE_DIR` (default `./rag_store`)
- `RAG_EMBED_MODEL` (default `sentence-transformers/all-MiniLM-L6-v2`)
- `OLLAMA_MODEL` (default `llama3.1:8b`) if Ollama is installed

### How it works

When you upload a file to `/api/documents/{id}/upload`, the backend:

1. Uploads the bytes to Supabase Storage (as before)
2. Best-effort indexes the file contents into ChromaDB (per doc chunk)

Indexing errors do not block the upload.

### Query endpoint

```
POST /api/rag/query
{
  "query": "<your question>",
  "subject_id": "<optional subject id>",
  "top_k": 5
}
```

Response:

```
{
  "answer": "...",
  "contexts": ["chunk1", "chunk2", ...]
}
```

If Ollama is available, `answer` is LLM-generated from the retrieved context; otherwise, `answer` contains the top relevant snippets.
