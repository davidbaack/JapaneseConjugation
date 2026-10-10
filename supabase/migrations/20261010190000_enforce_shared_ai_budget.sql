-- All replicas reserve paid work in one transaction before contacting Gemini.
-- No learner, prompt, credential or raw IP data is stored here.
create table public.ai_proxy_policy (
  singleton boolean primary key default true check (singleton),
  model text not null default 'gemini-3.5-flash-lite',
  daily_budget_microusd bigint not null default 5000000 check (daily_budget_microusd >= 0),
  per_ip_daily_requests integer not null default 100 check (per_ip_daily_requests >= 0),
  burst integer not null default 10 check (burst > 0),
  refill_ms integer not null default 6000 check (refill_ms > 0),
  input_microusd_per_million bigint not null default 300000 check (input_microusd_per_million > 0),
  output_microusd_per_million bigint not null default 2500000 check (output_microusd_per_million > 0)
);
insert into public.ai_proxy_policy (singleton) values (true);

create table public.ai_proxy_days (
  day date primary key,
  reserved_microusd bigint not null default 0 check (reserved_microusd >= 0),
  requests integer not null default 0 check (requests >= 0)
);
create table public.ai_proxy_clients (
  day date not null,
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  requests integer not null default 0 check (requests >= 0),
  tokens numeric not null,
  updated_at timestamptz not null,
  primary key (day, client_hash)
);

alter table public.ai_proxy_policy enable row level security;
alter table public.ai_proxy_days enable row level security;
alter table public.ai_proxy_clients enable row level security;
revoke all on public.ai_proxy_policy, public.ai_proxy_days, public.ai_proxy_clients from public, anon, authenticated;
grant select, insert, update, delete on public.ai_proxy_policy, public.ai_proxy_days, public.ai_proxy_clients to service_role;

create function public.reserve_ai_proxy_request(
  client_hash text, client_day date, input_token_bound integer, output_token_bound integer, model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy public.ai_proxy_policy%rowtype;
  daily public.ai_proxy_days%rowtype;
  client public.ai_proxy_clients%rowtype;
  request_at timestamptz := clock_timestamp();
  current_day date := (request_at at time zone 'UTC')::date;
  retry_seconds integer := greatest(1, ceil(extract(epoch from
    ((current_day + 1)::timestamp at time zone 'UTC') - request_at))::integer);
  debit bigint;
  available numeric;
begin
  if client_hash is null or client_hash !~ '^[a-f0-9]{64}$' or client_day is distinct from current_day
     or input_token_bound is null or input_token_bound < 1 or input_token_bound > 100000
     or output_token_bound is null or output_token_bound < 1 or output_token_bound > 1200 then
    raise exception 'Invalid AI reservation.' using errcode = '22023';
  end if;
  select * into strict policy from public.ai_proxy_policy where singleton for share;
  if model is distinct from policy.model then
    raise exception 'AI pricing policy does not match the model.' using errcode = '22023';
  end if;
  debit := ceil((input_token_bound::numeric * policy.input_microusd_per_million
    + output_token_bound::numeric * policy.output_microusd_per_million) / 1000000)::bigint;

  insert into public.ai_proxy_days (day) values (current_day) on conflict do nothing;
  -- Every admission locks the global row first, then the client row. Concurrent
  -- isolates cannot overspend or race past the per-IP and burst limits.
  select * into strict daily from public.ai_proxy_days where day = current_day for update;
  if daily.reserved_microusd + debit > policy.daily_budget_microusd then
    return jsonb_build_object('allowed', false, 'reason', 'global_daily', 'retry_after_seconds', retry_seconds);
  end if;
  insert into public.ai_proxy_clients (day, client_hash, tokens, updated_at)
    values (current_day, client_hash, policy.burst, request_at) on conflict do nothing;
  select * into strict client from public.ai_proxy_clients c
    where c.day = current_day and c.client_hash = reserve_ai_proxy_request.client_hash for update;
  if client.requests >= policy.per_ip_daily_requests then
    return jsonb_build_object('allowed', false, 'reason', 'ip_daily', 'retry_after_seconds', retry_seconds);
  end if;
  available := least(policy.burst, client.tokens
    + greatest(0, extract(epoch from request_at - client.updated_at) * 1000) / policy.refill_ms);
  if available < 1 then
    return jsonb_build_object('allowed', false, 'reason', 'burst',
      'retry_after_seconds', greatest(1, ceil((1 - available) * policy.refill_ms / 1000)::integer));
  end if;
  update public.ai_proxy_clients c set requests = c.requests + 1,
    tokens = available - 1, updated_at = request_at
    where c.day = current_day and c.client_hash = reserve_ai_proxy_request.client_hash;
  update public.ai_proxy_days set reserved_microusd = reserved_microusd + debit,
    requests = requests + 1 where day = current_day;
  -- Unknown outcomes retain their debit: a timeout can still be billed.
  delete from public.ai_proxy_clients where day < current_day - 7;
  delete from public.ai_proxy_days where day < current_day - 30;
  return jsonb_build_object('allowed', true, 'reserved_microusd', debit);
end;
$$;
revoke all on function public.reserve_ai_proxy_request(text, date, integer, integer, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_proxy_request(text, date, integer, integer, text) to service_role;
