import { kanaToRomaji, toHiragana } from './romaji.js';

const dictionarySearchCache = new WeakMap();

export function normalizeWordSearchQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function dictionarySearchData(word) {
  const canCache = !!word && typeof word === 'object';
  const cached = canCache && dictionarySearchCache.get(word);
  if (cached) return cached;
  const reading = normalizeWordSearchQuery(word?.reading);
  const data = {
    dict: normalizeWordSearchQuery(word?.dict),
    reading,
    romaji: kanaToRomaji(reading),
    meaning: normalizeWordSearchQuery(word?.meaning),
  };
  if (canCache) dictionarySearchCache.set(word, data);
  return data;
}

// Match dictionary entries without generating conjugations for every inventory row.
export function createDictionaryWordMatcher(query) {
  const q = normalizeWordSearchQuery(query);
  const kana = toHiragana(q);
  return (word) => {
    if (!q) return true;
    const search = dictionarySearchData(word);
    return (
      search.dict.includes(q) ||
      search.reading.includes(q) ||
      (!!kana && search.reading.includes(kana)) ||
      search.romaji.includes(q) ||
      search.meaning.includes(q)
    );
  };
}
