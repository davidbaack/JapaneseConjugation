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
    raise exception 'sync_revision_must_advance' using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_srs_sync_protocol on public.srs_sync;
create trigger enforce_srs_sync_protocol
before insert or update on public.srs_sync
for each row execute function public.enforce_srs_sync_protocol();
