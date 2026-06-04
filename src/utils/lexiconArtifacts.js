export const GENERATED_ARTIFACT_MEANING = /\bmath operator\b/i;

/**
 * @typedef {object} LexiconWord
 * @property {string} [dict]
 * @property {string} [reading]
 * @property {string} [meaning]
 * @property {string} [group]
 * @property {string} [jlpt]
 * @property {number[]} [genkiLessons]
 * @property {number[]} [minnaLessons]
 * @property {boolean} [common]
 */

const BLOCKED_ROW_KEYS = new Set(['godan:ある:ある:A certain ~, One ~']);

const ROW_REPAIRS = new Map([
  ['suru:掃除する:そじする', { reading: 'そうじする', meaning: 'to clean (a room)' }],
  ['suru:注意する:ちゅいする', { reading: 'ちゅういする', meaning: 'to be careful' }],
  ['suru:研究する:けんきょうする', { reading: 'けんきゅうする', meaning: 'to research' }],
  ['suru:用意する:よいする', { reading: 'よういする', meaning: 'to prepare' }],
  ['suru:遅刻する:ちこくする', { reading: 'ちこくする', meaning: 'to be late' }],
  ['suru:回する:まわする', { dict: '回す', reading: 'まわす', meaning: 'to turn', group: 'godan' }],
  [
    'suru:はんかする:はんかする',
    { dict: 'けんかする', reading: 'けんかする', meaning: 'to quarrel' },
  ],
]);

const RETIRED_WORD_KEYS = new Set([
  'godan:ある',
  'godan:ひく',
  'godan:たす',
  'godan:わる',
  'noun:は',
]);

const WORD_KEY_REPAIRS = new Map([
  ['suru:回する', 'godan:回す'],
  ['suru:はんかする', 'suru:けんかする'],
]);

function cleanMeaning(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowKey(dict, reading, group) {
  return `${group || ''}:${dict || ''}:${reading || ''}`;
}

function blockedRowKey(dict, reading, meaning, group) {
  return `${group || ''}:${dict || ''}:${reading || ''}:${cleanMeaning(meaning)}`;
}

export function isLexiconArtifactRow(row = []) {
  const [dict, reading, meaning, group] = row || [];
  return (
    Boolean(group) &&
    (GENERATED_ARTIFACT_MEANING.test(cleanMeaning(meaning)) ||
      BLOCKED_ROW_KEYS.has(blockedRowKey(dict, reading, meaning, group)))
  );
}

export function normalizeLexiconRow(row = []) {
  if (!Array.isArray(row)) return null;
  if (isLexiconArtifactRow(row)) return null;
  const [dict, reading, meaning, group, ...rest] = row;
  const repair = ROW_REPAIRS.get(rowKey(dict, reading, group));
  if (!repair) return row;
  return [
    repair.dict || dict,
    repair.reading || reading,
    repair.meaning || meaning,
    repair.group || group,
    ...rest,
  ];
}

/**
 * @param {LexiconWord | null | undefined} word
 */
export function isLexiconArtifactWord(word = {}) {
  const item = /** @type {LexiconWord} */ (word || {});
  if (!item.group) return false;
  return (
    GENERATED_ARTIFACT_MEANING.test(cleanMeaning(item.meaning)) ||
    BLOCKED_ROW_KEYS.has(blockedRowKey(item.dict, item.reading, item.meaning, item.group))
  );
}

/**
 * @param {LexiconWord | null | undefined} word
 * @returns {LexiconWord | null}
 */
export function normalizeLexiconWord(word = {}) {
  if (!word || typeof word !== 'object') return null;
  const item = /** @type {LexiconWord} */ (word);
  if (isLexiconArtifactWord(item)) return null;
  const repair = ROW_REPAIRS.get(rowKey(item.dict, item.reading, item.group));
  return repair ? { ...item, ...repair } : item;
}

export function normalizeWordListKey(key) {
  const clean = String(key || '').trim();
  if (!clean) return '';
  const repaired = WORD_KEY_REPAIRS.get(clean) || clean;
  return RETIRED_WORD_KEYS.has(repaired) ? '' : repaired;
}

export function normalizeWordListKeys(keys = []) {
  return [
    ...new Set(
      (Array.isArray(keys) ? keys : []).map((key) => normalizeWordListKey(key)).filter(Boolean),
    ),
  ];
}
