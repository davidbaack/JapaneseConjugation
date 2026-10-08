-- Atomic compare-and-set writes for multi-device learner sync.
alter table public.srs_sync
  add column if not exists revision bigint not null default 0;

create or replace function public.enforce_srs_sync_protocol()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- During rollout, legacy clients still issue direct upserts without a
  -- revision. Keep those writes monotonic only while the row is also legacy.
  if coalesce((old.data #>> '{syncMeta,version}')::integer, 0) < 1
     and coalesce((new.data #>> '{syncMeta,version}')::integer, 0) < 1 then
    new.revision := old.revision + 1;
    new.updated_at := now();
    return new;
  end if;

  if coalesce((old.data #>> '{syncMeta,version}')::integer, 0) >= 1
     and coalesce((new.data #>> '{syncMeta,version}')::integer, 0) < 1 then
    raise exception 'sync_protocol_downgrade_rejected' using errcode = '22023';
  end if;
  if new.revision <= old.revision then
    raise exception 'sync_revision_must_advance' using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_srs_sync_protocol on public.srs_sync;
create trigger enforce_srs_sync_protocol
before update on public.srs_sync
for each row execute function public.enforce_srs_sync_protocol();

drop function if exists public.cas_srs_sync(bigint, jsonb);
create or replace function public.cas_srs_sync(
  expected_revision bigint,
  next_data jsonb,
  expected_user_id text
)
returns table(sync_data jsonb, sync_updated_at timestamptz, sync_revision bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  learner_id uuid := auth.uid();
begin
  if learner_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if expected_user_id is null or learner_id::text <> expected_user_id then
    raise exception 'authenticated_user_changed' using errcode = '42501';
  end if;

  if expected_revision is null then
    insert into public.srs_sync (id, data, updated_at, revision)
    values (learner_id, next_data, now(), 1)
    on conflict (id) do nothing
    returning srs_sync.data, srs_sync.updated_at, srs_sync.revision
      into sync_data, sync_updated_at, sync_revision;
  else
    update public.srs_sync
      set data = next_data,
          updated_at = now(),
          revision = srs_sync.revision + 1
      where id = learner_id and revision = expected_revision
      returning srs_sync.data, srs_sync.updated_at, srs_sync.revision
        into sync_data, sync_updated_at, sync_revision;
  end if;

  if sync_revision is null then
    raise exception 'sync_revision_conflict' using errcode = '40001';
  end if;

  return next;
end;
$$;

revoke all on function public.cas_srs_sync(bigint, jsonb, text) from public;
grant execute on function public.cas_srs_sync(bigint, jsonb, text) to authenticated;
