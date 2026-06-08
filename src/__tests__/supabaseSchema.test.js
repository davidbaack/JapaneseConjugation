import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../supabase/migrations/', import.meta.url);

function loadSyncMigration() {
  const name = readdirSync(migrationsDir).find((entry) => entry.endsWith('_create_srs_sync.sql'));
  if (!name) throw new Error('Missing Supabase migration for public.srs_sync');
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
}

function loadSentencesMigration() {
  const name = readdirSync(migrationsDir).find((entry) => entry.endsWith('_create_sentences.sql'));
  if (!name) throw new Error('Missing Supabase migration for public.sentences');
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
}

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('Supabase cloud sync schema', () => {
  const migrationSql = loadSyncMigration();
  const sql = compactSql(migrationSql);

  it('creates the table shape used by cloudFetch and cloudUpsert', () => {
    expect(sql).toContain('create table if not exists public.srs_sync');
    expect(sql).toContain('id text primary key');
    expect(sql).toContain("data jsonb not null default '{}'::jsonb");
    expect(sql).toContain('updated_at timestamptz not null default now()');
  });

  it('enables RLS and grants access only to authenticated users', () => {
    expect(sql).toContain('alter table public.srs_sync enable row level security');
    expect(sql).toContain('alter table public.srs_sync force row level security');
    expect(sql).toContain('grant usage on schema public to authenticated');
    expect(sql).toContain(
      'grant select, insert, update, delete on table public.srs_sync to authenticated',
    );
  });

  it('limits each operation to the authenticated user row', () => {
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toContain(`for ${action} to authenticated`);
    }

    expect(sql.match(/using \(id = auth\.uid\(\)::text\)/g) || []).toHaveLength(3);
    expect(sql.match(/with check \(id = auth\.uid\(\)::text\)/g) || []).toHaveLength(2);
  });
});

describe('Supabase sentence library schema', () => {
  const migrationSql = loadSentencesMigration();
  const sql = compactSql(migrationSql);

  it('creates the shared sentence table used by the generated library importer', () => {
    expect(sql).toContain('create table if not exists public.sentences');
    expect(sql).toContain('primary key (word_key, type)');
    expect(sql).toContain('segments jsonb not null');
  });

  it('allows public reads and service-role upserts for the offline importer', () => {
    expect(sql).toContain('alter table public.sentences enable row level security');
    expect(sql).toContain('grant select on table public.sentences to anon, authenticated');
    expect(sql).toContain('grant usage on schema public to service_role');
    expect(sql).toContain('grant select, insert, update on table public.sentences to service_role');
    expect(sql).toContain('for select to anon, authenticated');
  });
});
