import { conjugateItem, surfaceFormFor } from './conjugator.js';

const RU_VERB_GROUPS = new Set(['ichidan', 'godan']);

export function ruMasuDiagnostic(word) {
  const reading = String(word?.reading || '');
  const group = word?.group || '';
  if (!RU_VERB_GROUPS.has(group) || !reading.endsWith('る')) return null;

  const dict = word.dict || reading;
  const politeKana = conjugateItem(word, 'polite-present');
  if (!politeKana) return null;

  const stemKana = reading.slice(0, -1);
  const dictStem = dict.endsWith('る') ? dict.slice(0, -1) : stemKana;
  const politeSurface = surfaceFormFor(word, 'polite-present') || politeKana;

  if (group === 'ichidan') {
    return {
      dict,
      reading,
      stemKana,
      politeKana,
      politeSurface,
      kind: 'stem-kept',
      title: 'Masu check: stem stays',
      clue: `${dict} keeps ${dictStem} before ます, so final る dropped away.`,
      contrast: 'That direct stem + ます pattern is ichidan.',
    };
  }

  return {
    dict,
    reading,
    stemKana,
    politeKana,
    politeSurface,
    kind: 'ri-shift',
    title: 'Masu check: る becomes り',
    clue: `${dict} becomes ${politeSurface}; the り before ます shows final る row-shifted.`,
    contrast: 'That る -> り + ます pattern is godan.',
  };
}
