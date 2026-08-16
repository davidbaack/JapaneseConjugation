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

function loadSyncCasMigration() {
  const name = readdirSync(migrationsDir).find((entry) => entry.endsWith('_add_srs_sync_cas.sql'));
  if (!name) throw new Error('Missing Supabase migration for atomic sync writes');
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
    expect(sql).toContain('id uuid primary key');
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

    expect(sql.match(/using \(id = auth\.uid\(\)\)/g) || []).toHaveLength(3);
    expect(sql.match(/with check \(id = auth\.uid\(\)\)/g) || []).toHaveLength(2);
  });
});

describe('Supabase cloud sync compare-and-set protocol', () => {
  const sql = compactSql(loadSyncCasMigration());

  it('adds a server revision and an authenticated CAS function', () => {
    expect(sql).toContain('add column if not exists revision bigint not null default 0');
    expect(sql).toContain(
      'function public.cas_srs_sync( expected_revision bigint, next_data jsonb, expected_user_id text )',
    );
    expect(sql).toContain('revision = srs_sync.revision + 1');
    expect(sql).toContain('learner_id uuid := auth.uid()');
    expect(sql).toContain('learner_id::text <> expected_user_id');
    expect(sql).toContain("raise exception 'sync_revision_conflict'");
    expect(sql).toContain(
      'grant execute on function public.cas_srs_sync(bigint, jsonb, text) to authenticated',
    );
    expect(sql).toContain("raise exception 'authenticated_user_changed'");
  });

  it('keeps legacy upserts monotonic during rollout, then enforces the new protocol', () => {
    const legacyBridge =
      "if coalesce((old.data #>> '{syncmeta,version}')::integer, 0) < 1 and coalesce((new.data #>> '{syncmeta,version}')::integer, 0) < 1 then";
    expect(sql).toContain(legacyBridge);
    expect(sql).toContain('new.revision := old.revision + 1');
    expect(sql.match(/new\.updated_at := now\(\)/g) || []).toHaveLength(2);
    expect(sql.indexOf(legacyBridge)).toBeLessThan(
      sql.indexOf("raise exception 'sync_protocol_downgrade_rejected'"),
    );
    expect(sql.indexOf("raise exception 'sync_protocol_downgrade_rejected'")).toBeLessThan(
      sql.indexOf("raise exception 'sync_revision_must_advance'"),
    );
    expect(sql).toContain("raise exception 'sync_revision_must_advance'");
    expect(sql).toContain("old.data #>> '{syncmeta,version}'");
    expect(sql).toContain("raise exception 'sync_protocol_downgrade_rejected'");
    expect(sql).toContain('before update on public.srs_sync');
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
