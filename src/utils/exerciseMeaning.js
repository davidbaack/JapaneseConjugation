import { englishForForm, simplePast, thirdPerson } from './display.js';

function firstTopLevelSense(meaning = '') {
  const source = String(meaning || '').trim();
  if (!source) return '';

  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (char === ';' || char === ',' || char === '/')) {
      return source.slice(0, index).trim();
    }
  }
  return source;
}

// Exercises need one stable, scannable sense while Lookup remains the place for
// complete dictionary coverage. Starter vocabulary can provide a curated
// exerciseMeaning; imported and custom words fall back to their first sense.
export function exerciseMeaningForWord(item) {
  if (!item) return '';
  return (
    preferenceExerciseGloss(item) ||
    String(item.exerciseMeaning || '').trim() ||
    firstTopLevelSense(item.meaning) ||
    String(item.meaning || '').trim()
  );
}

// These predicates describe someone's preference, not an object being liked.
// Bind display wording to the original senses without changing the lexical
// fields that identify approved sentences, or overriding custom homographs.
function preferenceExerciseGloss(item, type) {
  if (item?.group !== 'na-adjective') return '';
  const entry = {
    好き: ['すき', 'liking, fondness, love', 'liked', 'like'],
    嫌い: ['きらい', 'dislike', 'disliked', 'dislike'],
  }[item.dict];
  if (!entry || item.reading !== entry[0]) return '';
  const [, meaning, exerciseMeaning, action] = entry;
  if (
    ![meaning, exerciseMeaning].includes(item.meaning) ||
    (item.exerciseMeaning && item.exerciseMeaning !== exerciseMeaning)
  )
    return '';
  const base = `${action} (something)`;
  const past = `${simplePast(action)} (something)`;
  const negative = `do not ${base}`;
  const pastNegative = `did not ${base}`;
  const forms = {
    'adj-plain-past': past,
    'adj-plain-negative': negative,
    'adj-plain-past-negative': pastNegative,
    'adj-polite-present': `${base} (polite)`,
    'adj-polite-past': `${past} (polite)`,
    'adj-polite-negative': `${negative} (polite)`,
    'adj-polite-past-negative': `${pastNegative} (polite)`,
    'adj-te-form': `${base}, and… / because someone ${thirdPerson(action)} it`,
    'adj-negative-te-form': `${negative}, and… / because someone does not ${action} it`,
    'adj-adverb': `${action} (adverbial form; meaning depends on context)`,
    'adj-attributive': `a ${simplePast(action)} …`,
    'adj-conditional': `if someone ${thirdPerson(action)} it`,
    'adj-negative-conditional': `if someone does not ${action} it`,
    'adj-tara': `if/when someone ${simplePast(action)} it`,
    'adj-negative-tara': `if/when someone did not ${action} it`,
    'adj-sou': `seems to ${base}`,
    'adj-sugiru': `${thirdPerson(action)} (something) too much`,
    'adj-naru': `comes to ${base}`,
  };
  return forms[type] || base;
}

export function exerciseEnglishForForm(item, type) {
  if (!item) return '';
  const preferenceGloss = preferenceExerciseGloss(item, type);
  if (preferenceGloss) return preferenceGloss;
  return englishForForm({ ...item, meaning: exerciseMeaningForWord(item) }, type);
}
