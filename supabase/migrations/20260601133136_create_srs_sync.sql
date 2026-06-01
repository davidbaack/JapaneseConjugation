-- Cloud sync storage for Katachiya.
--
-- The browser writes one row per authenticated Supabase user. The row id is the
-- auth.users.id value as text because src/utils/storage.js upserts with
-- session.user.id and later fetches the same id.

create table if not exists public.srs_sync (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.srs_sync enable row level security;
alter table public.srs_sync force row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.srs_sync to authenticated;

drop policy if exists "Users can read their own SRS sync row" on public.srs_sync;
create policy "Users can read their own SRS sync row"
  on public.srs_sync
  for select
  to authenticated
  using (id = auth.uid()::text);

drop policy if exists "Users can insert their own SRS sync row" on public.srs_sync;
create policy "Users can insert their own SRS sync row"
  on public.srs_sync
  for insert
  to authenticated
  with check (id = auth.uid()::text);

drop policy if exists "Users can update their own SRS sync row" on public.srs_sync;
create policy "Users can update their own SRS sync row"
  on public.srs_sync
  for update
  to authenticated
  using (id = auth.uid()::text)
  with check (id = auth.uid()::text);

drop policy if exists "Users can delete their own SRS sync row" on public.srs_sync;
create policy "Users can delete their own SRS sync row"
  on public.srs_sync
  for delete
  to authenticated
  using (id = auth.uid()::text);
