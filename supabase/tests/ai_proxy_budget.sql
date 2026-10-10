-- Run against a disposable DB or with supabase db query --linked --file.
-- All fixtures and policy changes roll back; no Gemini call is made.
begin;
set local statement_timeout = '10s';
set local lock_timeout = '3s';
do $$
declare
  result jsonb;
  fixture_day date := (clock_timestamp() at time zone 'UTC')::date;
begin
  if has_function_privilege('anon', 'public.reserve_ai_proxy_request(text,date,integer,integer,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.reserve_ai_proxy_request(text,date,integer,integer,text)', 'EXECUTE')
    or has_table_privilege('anon', 'public.ai_proxy_policy', 'SELECT') then
    raise exception 'Public quota access is not revoked';
  end if;
  delete from public.ai_proxy_clients;
  delete from public.ai_proxy_days;
  update public.ai_proxy_policy set burst = 1000, refill_ms = 1,
    daily_budget_microusd = 5000000, per_ip_daily_requests = 100;
  for i in 1..100 loop
    result := public.reserve_ai_proxy_request(repeat('a',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
    if result->>'allowed' <> 'true' then raise exception 'Premature IP denial'; end if;
  end loop;
  result := public.reserve_ai_proxy_request(repeat('a',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
  if result->>'reason' <> 'ip_daily' then raise exception 'Daily IP limit was exceeded'; end if;
  if (select requests from public.ai_proxy_days where ai_proxy_days.day = fixture_day) <> 100 then
    raise exception 'A denied request consumed budget';
  end if;
  delete from public.ai_proxy_clients;
  delete from public.ai_proxy_days;
  update public.ai_proxy_policy set daily_budget_microusd = 10000;
  for i in 1..5 loop
    result := public.reserve_ai_proxy_request(repeat('b',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
    if result->>'allowed' <> 'true' then raise exception 'Premature global denial'; end if;
  end loop;
  result := public.reserve_ai_proxy_request(repeat('c',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
  if result->>'reason' <> 'global_daily' then raise exception 'Global budget was exceeded'; end if;
  if (select reserved_microusd from public.ai_proxy_days where ai_proxy_days.day = fixture_day) <> 9000 then
    raise exception 'Reservation accounting is incorrect';
  end if;
  delete from public.ai_proxy_clients;
  delete from public.ai_proxy_days;
  update public.ai_proxy_policy set daily_budget_microusd = 5000000, burst = 2, refill_ms = 6000;
  perform public.reserve_ai_proxy_request(repeat('d',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
  perform public.reserve_ai_proxy_request(repeat('d',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
  result := public.reserve_ai_proxy_request(repeat('d',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
  if result->>'reason' <> 'burst' then raise exception 'Burst limit was exceeded'; end if;
  update public.ai_proxy_clients set updated_at = updated_at - interval '7 seconds';
  result := public.reserve_ai_proxy_request(repeat('d',64),fixture_day,1000,600,'gemini-3.5-flash-lite');
  if result->>'allowed' <> 'true' then raise exception 'Burst refill failed'; end if;
  begin
    perform public.reserve_ai_proxy_request(repeat('e',64),fixture_day,1000,600,'unpriced-model');
    raise exception 'Unpriced model was admitted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'AI quota SQL checks passed: role boundaries, daily IP cap, global cap, debit accounting, burst and refill.';
end;
$$;
rollback;
