export const FORMATION_KEYS_ID = 'formation-keys';

const ROW_ALIASES = {
  a: 'a-row',
  'a-row': 'a-row',
  i: 'i-row',
  'i-row': 'i-row',
  u: 'u-row',
  'u-row': 'u-row',
  e: 'e-row',
  'e-row': 'e-row',
  o: 'o-row',
  'o-row': 'o-row',
};

export function normalizeRowLabel(row) {
  return (
    ROW_ALIASES[
      String(row || '')
        .trim()
        .toLowerCase()
    ] || ''
  );
}

export function buildFormationKeysHash(highlight = {}) {
  const params = new globalThis.URLSearchParams();
  const ending = String(highlight?.ending || '').trim();
  const row = normalizeRowLabel(highlight?.row || highlight?.targetRow);

  if (ending) params.set('ending', ending);
  if (row) params.set('row', row);

  const query = params.toString();
  return query ? `${FORMATION_KEYS_ID}?${query}` : FORMATION_KEYS_ID;
}

export function parseFormationKeysHash(hash = '') {
  const raw = String(hash || '').replace(/^#/, '');
  const [id, query = ''] = raw.split('?');
  if (id !== FORMATION_KEYS_ID) return null;

  const params = new globalThis.URLSearchParams(query);
  return {
    ending: params.get('ending') || '',
    row: normalizeRowLabel(params.get('row')),
  };
}
