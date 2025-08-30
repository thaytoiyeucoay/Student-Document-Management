-- Enable pgvector extension
create extension if not exists vector;

-- IMPORTANT: choose the correct dimension to match your embedding model
-- OpenAI text-embedding-3-small => 1536
-- SentenceTransformers all-MiniLM-L6-v2 => 384
-- Gemini text-embedding-004 => 768
-- If you change providers/models later, you must recreate this table with the right dimension.

-- Drop existing objects (optional)
-- Note: update function signature to text for subject_id
-- drop function if exists match_rag_chunks(vector, int, text, uuid);
-- drop index if exists idx_rag_chunks_embedding;
-- drop table if exists rag_chunks;

create table if not exists rag_chunks (
  id bigserial primary key,
  -- Store as text to be UUID-safe and consistent with app logic
  document_id text,
  subject_id text,
  user_id uuid,
  file_name text,
  chunk_index int,
  content text,
  -- Set dimension to match your embedding model, default here uses 1536 (OpenAI text-embedding-3-small)
  embedding vector(768),
  created_at timestamptz not null default now()
);

-- HNSW index for fast ANN search (cosine distance)
create index if not exists idx_rag_chunks_embedding on rag_chunks using hnsw (embedding vector_cosine_ops);

-- RPC to perform similarity search with optional subject/user filters
-- In Supabase, create this as a SQL function and then expose via RPC name match_rag_chunks
create or replace function match_rag_chunks(
  query_embedding vector,
  match_count int,
  subject_id text default null,
  user_id uuid default null
) returns table (
  id bigint,
  document_id text,
  subject_id text,
  user_id uuid,
  file_name text,
  chunk_index int,
  content text,
  distance double precision
) language sql stable as $$
  select
    rc.id,
    rc.document_id,
    rc.subject_id,
    rc.user_id,
    rc.file_name,
    rc.chunk_index,
    rc.content,
    (rc.embedding <=> query_embedding) as distance
  from rag_chunks rc
  where (subject_id is null or rc.subject_id = subject_id)
    and (user_id is null or rc.user_id = user_id)
  order by rc.embedding <=> query_embedding
  limit match_count;
$$;
