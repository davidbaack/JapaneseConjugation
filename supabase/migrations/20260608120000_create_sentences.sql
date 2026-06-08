-- Tailored cloze sentence library for Katachiya.
--
-- Shared, read-only public content: one row per (word_key, conjugation type)
-- holding a natural example sentence with the conjugated word replaced by a
-- {w} placeholder, plus per-token furigana segments and an English gloss.
--
-- Unlike srs_sync (per-user, RLS to the owning user), this table is the same
-- for everyone. Clients (anon or authenticated) may only SELECT it; writes are
-- performed by the offline seed script using the service-role key, which
-- bypasses RLS.

create table if not exists public.sentences (
  word_key text not null,           -- `${group}:${dict}` (matches wordKey())
  dict text not null,
  reading text not null,
  "group" text not null,
  type text not null,               -- one of the conjugation type ids
  ja_template text not null,        -- sentence with `{w}` where the form goes
  surface text not null,            -- kanji surface `{w}` expands to (= surfaceFormFor)
  segments jsonb not null,          -- per-token furigana: [{ "t": surface, "r": ruby }],
                                    -- placeholder marked as { "w": true }
  en text not null,                 -- English translation
  model text,                       -- generator provenance
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (word_key, type)
);

alter table public.sentences enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.sentences to anon, authenticated;

drop policy if exists "Anyone can read sentences" on public.sentences;
create policy "Anyone can read sentences"
  on public.sentences
  for select
  to anon, authenticated
  using (true);
