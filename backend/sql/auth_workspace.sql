-- =============================================================
-- DEPRECATED: Workspace schema
-- This project has removed the Workspace feature entirely.
-- Do NOT run this SQL. Kept only for historical reference.
-- =============================================================
-- SQL setup for AuthN/AuthZ (Admin/Student) and Workspaces
-- Run this in Supabase SQL Editor

-- 1) Profiles: maps to auth.users (1-1)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null default 'student' check (role in ('admin','student')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Only the user can select/update own profile; admin can select all
create policy if not exists profiles_select_self_or_admin
on public.profiles for select
using (
  auth.uid() = id or exists (
    select 1 from public.profiles p2 where p2.id = auth.uid() and p2.role = 'admin'
  )
);

create policy if not exists profiles_update_self_or_admin
on public.profiles for update
using (
  auth.uid() = id or exists (
    select 1 from public.profiles p2 where p2.id = auth.uid() and p2.role = 'admin'
  )
);

create policy if not exists profiles_insert_self
on public.profiles for insert
with check (auth.uid() = id);

-- 2) Workspaces
create table if not exists public.workspaces (
  id bigserial primary key,
  name text not null,
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- 3) Workspace members
create table if not exists public.workspace_members (
  id bigserial primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null check (member_role in ('owner','editor','viewer')),
  unique(workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

-- Membership view policies
create policy if not exists workspace_members_select_member
on public.workspace_members for select
using (
  user_id = auth.uid() or exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where m.user_id = auth.uid() and m.workspace_id = workspace_id
  )
);

-- Members insert/update/delete only by owner of the workspace
create policy if not exists workspace_members_owner_manage
on public.workspace_members for all
using (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner = auth.uid()
  )
);

-- Workspaces policies: visible to members; updatable/deletable by owner
create policy if not exists workspaces_select_members
on public.workspaces for select
using (
  owner = auth.uid() or exists (
    select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy if not exists workspaces_insert_self_owner
on public.workspaces for insert
with check (owner = auth.uid());

create policy if not exists workspaces_update_delete_owner
on public.workspaces for update using (owner = auth.uid())
with check (owner = auth.uid());

create policy if not exists workspaces_delete_owner
on public.workspaces for delete using (owner = auth.uid());

-- 4) Extend existing subjects/documents to belong to a workspace
-- Add columns if not exist; ignore errors if already there
alter table if exists public.subjects add column if not exists workspace_id bigint references public.workspaces(id) on delete cascade;
create index if not exists idx_subjects_workspace on public.subjects(workspace_id);

alter table if exists public.documents add column if not exists workspace_id bigint references public.workspaces(id) on delete cascade;
create index if not exists idx_documents_workspace on public.documents(workspace_id);

-- Example RLS: subjects/documents visible to workspace members
alter table if exists public.subjects enable row level security;
alter table if exists public.documents enable row level security;

create policy if not exists subjects_select_members on public.subjects for select using (
  exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.id = subjects.workspace_id and (w.owner = auth.uid() or m.user_id = auth.uid())
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy if not exists subjects_write_members on public.subjects for all using (
  exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.id = subjects.workspace_id and (w.owner = auth.uid() or m.user_id = auth.uid())
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
) with check (
  exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.id = subjects.workspace_id and (w.owner = auth.uid() or m.user_id = auth.uid())
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy if not exists documents_select_members on public.documents for select using (
  exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.id = documents.workspace_id and (w.owner = auth.uid() or m.user_id = auth.uid())
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy if not exists documents_write_members on public.documents for all using (
  exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.id = documents.workspace_id and (w.owner = auth.uid() or m.user_id = auth.uid())
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
) with check (
  exists (
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.id = documents.workspace_id and (w.owner = auth.uid() or m.user_id = auth.uid())
  ) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);
