import { conjugateItem, surfaceFormFor, surfaceStemPair } from './conjugator.js';
import { toHiragana } from './romaji.js';

function katakanaToHiragana(value) {
  return String(value || '').replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

export function normalizeVariantInput(value) {
  return toHiragana(katakanaToHiragana(value));
}

function isPotentialType(typeId) {
  return typeId === 'potential' || String(typeId || '').startsWith('potential-');
}

export function colloquialPotentialVariantFor(word, typeId) {
  if (!word || word.group !== 'ichidan' || !isPotentialType(typeId)) return null;

  const canonicalKana = conjugateItem(word, typeId);
  if (!canonicalKana) return null;

  const { readingStem, dictStem } = surfaceStemPair(word);
  const standardPrefix = `${readingStem}られ`;
  if (!readingStem || !canonicalKana.startsWith(standardPrefix)) return null;

  const variantTail = `れ${canonicalKana.slice(standardPrefix.length)}`;
  const kana = `${readingStem}${variantTail}`;
  const canonicalKanji = surfaceFormFor(word, typeId) || canonicalKana;
  const kanji = word.dict && word.dict !== word.reading ? `${dictStem}${variantTail}` : kana;

  return {
    kana,
    kanji,
    canonicalKana,
    canonicalKanji,
    variantKind: 'colloquial-potential',
    variantNote: `Recognized ${kanji} as conversational ら-dropping potential. Standard form: ${canonicalKanji}.`,
  };
}

export function matchColloquialPotentialVariant(input, word, typeId) {
  const variant = colloquialPotentialVariantFor(word, typeId);
  if (!variant) return null;

  const raw = String(input || '').trim();
  const normalized = normalizeVariantInput(raw);
  if (normalized === variant.kana || raw === variant.kanji || raw === variant.kana) {
    return { ...variant, hitText: raw || variant.kanji };
  }
  return null;
}
