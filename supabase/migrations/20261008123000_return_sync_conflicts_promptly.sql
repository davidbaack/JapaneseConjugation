-- PostgREST retries SQLSTATE 40001. A compare-and-set conflict is an
-- application-level HTTP 409, not a database serialization retry.
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
    raise exception 'sync_revision_conflict' using errcode = 'PT409';
  end if;

  return next;
end;
$$;


-- Preserve existing CAS enforcement and prohibit older open clients from
-- replacing concurrency-aware snapshots with a protocol that drops their ledger.
create or replace function public.enforce_srs_sync_protocol()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce((new.data #>> '{syncMeta,version}')::integer, 0) >= 2
     and (jsonb_typeof(new.data #> '{syncMeta,progressContributions}') is distinct from 'object'
       or new.data #> '{syncMeta,progressContributions,version}' is distinct from '1'::jsonb
       or jsonb_typeof(new.data #> '{syncMeta,progressContributions,epoch}') is distinct from 'string'
       or jsonb_typeof(new.data #> '{syncMeta,progressContributions,baseline}') is distinct from 'object'
       or jsonb_typeof(new.data #> '{syncMeta,progressContributions,writers}') is distinct from 'object') then
    raise exception 'sync_progress_metadata_required' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if coalesce((old.data #>> '{syncMeta,version}')::integer, 0) >= 2
     and coalesce((new.data #>> '{syncMeta,version}')::integer, 0) < 2 then
    raise exception 'sync_client_upgrade_required' using errcode = '22023';
  end if;

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
    raise exception 'sync_revision_must_advance' using errcode = 'PT409';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
