begin;

-- Existing content stays pending until an explicit bilingual approval is published.
alter table public.sentences add column if not exists review jsonb;

drop policy if exists "Anyone can read sentences" on public.sentences;
drop policy if exists "Anyone can read reviewed sentences" on public.sentences;
create policy "Anyone can read reviewed sentences" on public.sentences
  for select to anon, authenticated
  using (review->>'status' = 'accepted' and review->>'version' = '1');
create index if not exists sentences_reviewed_lookup on public.sentences(word_key,type)
  where review->>'status' = 'accepted' and review->>'version' = '1';

create or replace function public.sentence_review_metadata(provenance text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare value jsonb;
begin
  value := provenance::jsonb;
  if jsonb_typeof(value) <> 'object' then return null; end if;
  value := coalesce(value->'review', value);
  if jsonb_typeof(value) = 'object' and jsonb_typeof(value->'status') = 'string' then return value; end if;
  return null;
exception when invalid_text_representation then return null;
end;
$$;

-- A batch locks existing rows and compares every content/approval field before
-- upsert. A concurrent edit or deletion aborts the entire batch, not just a row.
create or replace function public.publish_reviewed_sentences(batch jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; existing public.sentences%rowtype; target jsonb;
  metadata jsonb; signature jsonb; total integer := 0; affected integer;
begin
  if jsonb_typeof(batch) <> 'array' or jsonb_array_length(batch) > 500 then
    raise exception 'Invalid sentence publication batch';
  end if;
  for item in select value from jsonb_array_elements(batch) loop
    target := item->'row';
    select * into existing from public.sentences
      where word_key = target->>'word_key' and type = target->>'type' for update;
    if found then
      metadata := coalesce(existing.review, public.sentence_review_metadata(existing.model));
      signature := jsonb_build_array(existing.word_key, existing.type,
        coalesce(existing.dict,''), coalesce(existing.reading,''), coalesce(existing."group",''),
        coalesce(existing.surface,''), existing.ja_template, existing.en, existing.segments,
        coalesce(existing.model,''),
        case when metadata is null then null else jsonb_build_array(metadata->'status',metadata->'version',
          coalesce(metadata->>'hash',''),coalesce(metadata->>'basis',''),coalesce(metadata->>'sense','')) end);
      if signature is distinct from item->'expected' and signature is distinct from item->'target' then
        raise exception 'Concurrent sentence edit: % / %', target->>'word_key', target->>'type';
      end if;
    elsif item->'expected' is distinct from 'null'::jsonb then
      raise exception 'Concurrent sentence deletion: % / %', target->>'word_key', target->>'type';
    end if;
    insert into public.sentences as current_row(word_key,type,dict,reading,"group",ja_template,surface,segments,en,model,review,updated_at)
      values(target->>'word_key',target->>'type',target->>'dict',target->>'reading',target->>'group',
        target->>'ja_template',target->>'surface',target->'segments',target->>'en',target->>'model',
        target->'review',now())
      on conflict(word_key,type) do update set dict=excluded.dict, reading=excluded.reading,
        "group"=excluded."group",ja_template=excluded.ja_template,surface=excluded.surface,
        segments=excluded.segments,en=excluded.en,model=excluded.model,review=excluded.review,updated_at=now()
      where jsonb_build_array(current_row.word_key,current_row.type,
        coalesce(current_row.dict,''),coalesce(current_row.reading,''),coalesce(current_row."group",''),
        coalesce(current_row.surface,''),current_row.ja_template,current_row.en,current_row.segments,
        coalesce(current_row.model,''),
        case when coalesce(current_row.review,public.sentence_review_metadata(current_row.model)) is null then null
          else jsonb_build_array(coalesce(current_row.review,public.sentence_review_metadata(current_row.model))->'status',
            coalesce(current_row.review,public.sentence_review_metadata(current_row.model))->'version',
            coalesce(coalesce(current_row.review,public.sentence_review_metadata(current_row.model))->>'hash',''),
            coalesce(coalesce(current_row.review,public.sentence_review_metadata(current_row.model))->>'basis',''),
            coalesce(coalesce(current_row.review,public.sentence_review_metadata(current_row.model))->>'sense','')) end)
          in (item->'expected',item->'target');
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Concurrent sentence insertion: % / %',target->>'word_key',target->>'type'; end if;
    total := total + 1;
  end loop;
  return total;
end;
$$;

revoke all on function public.sentence_review_metadata(text) from public, anon, authenticated;
revoke all on function public.publish_reviewed_sentences(jsonb) from public, anon, authenticated;
grant execute on function public.sentence_review_metadata(text) to service_role;
grant execute on function public.publish_reviewed_sentences(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
