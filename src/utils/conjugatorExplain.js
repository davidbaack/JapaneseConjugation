// Explanation, hint, and diagnosis logic for conjugation forms.
// These functions build on the conjugation engine but are kept separate
// so the engine itself (conjugator.js) stays focused on producing forms.
import { toHiragana } from './romaji.js';
import { CONJ_TYPES, ADJ_TYPES, TYPE_LABEL, getTypeInfo } from '../data/conjugationTypes.js';
import {
  isAdjective,
  conjugate,
  conjugateAdjective,
  conjugateItem,
  getConjugationParts,
  adjectiveStem,
  A_ROW,
  I_ROW,
  E_ROW,
  O_ROW,
  PAST_END,
  TE_END,
  surfaceFormFor,
} from './conjugator.js';
import { buildOfflineCuedCloze } from './clozeSentences.js';
import { englishForForm } from './display.js';
import { GROUP_SENTENCE_LABELS, groupDisplayLabel, groupSentenceLabel } from './groupDisplay.js';

export function getOfflineTemplateSentence(word, type) {
  return buildOfflineCuedCloze(word, type);
}

// Maps compound form prefixes to their base conjugation type.
const COMPOUND_BASE_TYPE = {
  potential: 'potential',
  passive: 'passive',
  causative: 'causative',
};

// Simple endings that follow ichidan verb rules (drop final る, add ending).
const COMPOUND_SIMPLE_ENDING = {
  past: 'た',
  'past-negative': 'なかった',
  negative: 'ない',
  polite: 'ます',
  'polite-past': 'ました',
  'polite-negative': 'ません',
  'polite-past-negative': 'ませんでした',
  'conditional-ba': 'れば',
};

const COMPOUND_BASE_LABEL = {
  potential: 'potential',
  passive: 'passive',
  causative: 'causative',
};

function compoundBuildInfo(item, type) {
  for (const [basePrefix, baseType] of Object.entries(COMPOUND_BASE_TYPE)) {
    if (type !== baseType && type.startsWith(basePrefix + '-')) {
      const suffix = type.slice(basePrefix.length + 1);
      const ending = COMPOUND_SIMPLE_ENDING[suffix];
      if (!ending) continue;
      try {
        const baseForm = conjugateItem(item, baseType);
        if (!baseForm.endsWith('る')) continue;
        const baseStem = baseForm.slice(0, -1);
        const result = conjugateItem(item, type);
        return { basePrefix, baseType, baseForm, baseStem, ending, result };
      } catch {}
    }
  }
  return null;
}

function safeCompoundRecipe(info) {
  if (!info) return '';
  const baseLabel = COMPOUND_BASE_LABEL[info.basePrefix] || info.basePrefix;
  return `First make the ${baseLabel} form: ${info.baseForm}. Then drop final る and add ${info.ending}.`;
}

function quoteKana(value) {
  return `「${value}」`;
}

function kanaPrefixPhrase(count) {
  return count === 1 ? 'first kana' : `first ${count} kana`;
}

function prefixStatus(correct, got) {
  const prefix = quoteKana(got.slice(0, correct));
  return correct === 1
    ? `Your first kana (${prefix}) is on track.`
    : `Your ${kanaPrefixPhrase(correct)} (${prefix}) are on track.`;
}

function positionHint(type, got, expected, correct, compound) {
  const actual = got[correct] || '';
  const expectedNext = expected[correct] || '';

  if (compound) {
    const baseLabel = COMPOUND_BASE_LABEL[compound.basePrefix] || compound.basePrefix;
    if (correct < compound.baseForm.length) {
      const prefix = got.slice(0, correct);
      let detail = prefix
        ? `You are at ${quoteKana(prefix)}; build the ${baseLabel} form first: ${compound.baseForm}.`
        : `Build the ${baseLabel} form first: ${compound.baseForm}.`;
      if (actual) {
        const later = compound.baseForm.indexOf(actual, correct + 1);
        detail +=
          later !== -1
            ? ` ${quoteKana(actual)} comes later in that form; keep the kana order from ${compound.baseForm}.`
            : ` ${quoteKana(actual)} is not the next kana in that form.`;
      }
      return detail;
    }
    if (correct >= compound.baseStem.length) {
      return `The ${baseLabel} base is done; after ${compound.baseStem}, add ${compound.ending}.`;
    }
    return `Make ${compound.baseForm}, drop final る, then attach ${compound.ending}.`;
  }

  if (expectedNext && actual)
    return `The next kana should be ${quoteKana(expectedNext)}, not ${quoteKana(actual)}.`;
  if (expectedNext) return `The next kana should be ${quoteKana(expectedNext)}.`;
  return `Re-check the requested ${typeLabel(type).toLowerCase()} form.`;
}

function continuationHint(expected, correct, compound) {
  if (compound) {
    const baseLabel = COMPOUND_BASE_LABEL[compound.basePrefix] || compound.basePrefix;
    if (correct < compound.baseForm.length) {
      return `Keep building the ${baseLabel} form first: ${compound.baseForm}.`;
    }
    if (correct >= compound.baseStem.length) {
      return `Now add ${compound.ending}.`;
    }
    return `Drop final る from ${compound.baseForm}, then add ${compound.ending}.`;
  }

  const expectedNext = expected[correct] || '';
  return expectedNext
    ? `The next kana is ${quoteKana(expectedNext)}.`
    : 'Apply the next step above.';
}

function emptyAnswerNudge(item) {
  if (item?.group === 'godan') {
    return 'You have not typed anything yet. First identify the verb group, then look at the final kana of the dictionary form. Use those two facts to decide the first change before typing.';
  }
  if (item?.group === 'ichidan') {
    return 'You have not typed anything yet. First confirm whether this is ichidan, then decide what happens to the final る before typing.';
  }
  if (item?.group === 'suru' || item?.group === 'kuru' || item?.irregular) {
    return 'You have not typed anything yet. First recall the special base change for this irregular form before worrying about the ending.';
  }
  if (isAdjective(item)) {
    return 'You have not typed anything yet. First identify the adjective type, then decide what part changes before the ending.';
  }
  return 'You have not typed anything yet. First identify the word type, then decide the next change before typing.';
}

// For compound forms (e.g. potential-past-negative), show the intermediate
// form so the learner can see the two-step derivation.
function buildCompoundDerivation(item, type) {
  const info = compoundBuildInfo(item, type);
  return info ? `${info.baseForm} → ${info.baseStem} + ${info.ending} = ${info.result}` : null;
}

// Returns a short "why this rule applies" string for compound and tricky forms.
function buildReason(item, type) {
  const group = item.group;

  for (const basePrefix of Object.keys(COMPOUND_BASE_TYPE)) {
    if (type !== basePrefix && type.startsWith(basePrefix + '-')) {
      if (COMPOUND_SIMPLE_ENDING[type.slice(basePrefix.length + 1)]) {
        return `The ${basePrefix} form ends in る — it conjugates further like an ichidan verb. Build the ${basePrefix} form first, then drop る and attach the new ending.`;
      }
    }
  }

  if (type !== 'desiderative' && type.startsWith('desiderative-')) {
    return 'The desiderative suffix たい acts like an い-adjective — use い-adjective rules for all further modifications.';
  }

  if (type !== 'progressive' && type.startsWith('progressive-')) {
    return 'The progressive is て-form + いる. Further modifications (negative, past, polite) change that いる.';
  }

  if (group === 'godan' && type === 'plain-negative') {
    const reading = item.reading || '';
    if (reading.endsWith('う')) {
      return 'Godan verbs ending in う use わ (not あ) for the negative stem — giving ～わない, not ～あない.';
    }
  }

  return '';
}

const GODAN_ENDING_ROMAJI = {
  う: 'u',
  く: 'ku',
  ぐ: 'gu',
  す: 'su',
  つ: 'tsu',
  ぬ: 'nu',
  ぶ: 'bu',
  む: 'mu',
  る: 'ru',
};

const ONBIN_TAIL_RULES = {
  'te-form': {
    て: 'ichidan る -> て (ru -> te)',
    って: 'う/つ/る -> って (u/tsu/ru -> tte)',
    んで: 'む/ぶ/ぬ -> んで (mu/bu/nu -> nde)',
    いて: 'く -> いて (ku -> ite)',
    いで: 'ぐ -> いで (gu -> ide)',
    して: 'す -> して (su -> shite)',
    きて: '来る -> きて (kuru -> kite)',
  },
  'plain-past': {
    た: 'ichidan る -> た (ru -> ta)',
    った: 'う/つ/る -> った (u/tsu/ru -> tta)',
    んだ: 'む/ぶ/ぬ -> んだ (mu/bu/nu -> nda)',
    いた: 'く -> いた (ku -> ita)',
    いだ: 'ぐ -> いだ (gu -> ida)',
    した: 'す -> した (su -> shita)',
    きた: '来る -> きた (kuru -> kita)',
  },
};

const ONBIN_TAIL_ROMAJI = {
  て: 'te',
  って: 'tte',
  んで: 'nde',
  いて: 'ite',
  いで: 'ide',
  して: 'shite',
  きて: 'kite',
  た: 'ta',
  った: 'tta',
  んだ: 'nda',
  いた: 'ita',
  いだ: 'ida',
  した: 'shita',
  きた: 'kita',
};

function typeLabel(type) {
  return getTypeInfo(type)?.label || TYPE_LABEL[type] || type;
}

function groupLabel(item) {
  return groupSentenceLabel(item?.group) || item?.group || 'unknown group';
}

function originalEndingFor(item) {
  if (!item) return '';
  if (isAdjective(item)) {
    if (item.group === 'i-adjective') return 'い';
    if (item.group === 'na-adjective') return item.reading?.endsWith('な') ? 'な' : 'な-adj base';
    return item.reading?.slice(-1) || '';
  }
  if (item.group === 'ichidan') return 'る';
  if (item.group === 'suru') return 'する';
  if (item.group === 'kuru') return 'くる';
  return item.reading?.slice(-1) || '';
}

function fallbackStem(item, ending) {
  const reading = item?.reading || '';
  if (!reading) return '';
  if (ending && reading.endsWith(ending)) return reading.slice(0, -ending.length);
  if (item?.group === 'suru' && reading.endsWith('する')) return reading.slice(0, -2);
  if (item?.group === 'kuru' && reading.endsWith('くる')) return reading.slice(0, -2);
  return reading.slice(0, Math.max(0, reading.length - 1));
}

function replacementFromParts(parts, expected, stem) {
  const direct = `${parts?.change || ''}${parts?.suffix || ''}`;
  if (direct) return direct;
  if (expected && stem && expected.startsWith(stem)) return expected.slice(stem.length);
  return expected || '';
}

function longestCommonPrefix(a = '', b = '') {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  return a.slice(0, index);
}

function categoryExampleForm(item, type) {
  try {
    return surfaceFormFor(item, type) || conjugateItem(item, type) || '';
  } catch {
    return '';
  }
}

function slashList(values) {
  return values.filter(Boolean).join(' / ');
}

function dictStemForFinal(item, ending) {
  const dict = item?.dict || item?.reading || '';
  if (ending && dict.endsWith(ending)) return dict.slice(0, -ending.length);
  return fallbackStem(item, ending);
}

function learnerCategoryInfo(item) {
  const group = item?.group || '';
  const dict = item?.dict || item?.reading || '';
  const reading = item?.reading || '';
  const ending = reading.slice(-1);

  if (group === 'godan') {
    const polite = categoryExampleForm(item, 'polite-present');
    const negative = categoryExampleForm(item, 'plain-negative');
    const rowShift = slashList([A_ROW[ending], I_ROW[ending], E_ROW[ending], O_ROW[ending]]);
    const isRuTrap = ending === 'る';
    const isIkuException = reading === 'いく' || dict === '行く';
    return {
      label: 'godan / u-verb',
      why: isRuTrap
        ? `${dict} ends in る, so it looks like an ichidan (ru-verb) — but it is actually godan (u-verb). The giveaway: when it conjugates, the final る does not just drop. It shifts to the other sounds in its row (ら / り / れ / ろ), called row-shifting, instead of disappearing.`
        : `${dict} is a godan (u-verb): its final kana ${ending} row-shifts — it changes to the other sounds in its row (${ending} → ${rowShift}) depending on the ending, instead of dropping. That row-shifting is the defining godan trait.`,
      checks: [
        isRuTrap
          ? polite &&
            negative &&
            `Tell-tale sign: ${polite} and ${negative} keep a り / ら sound. A true ichidan verb would simply drop る (compare 食べる → 食べます / 食べない).`
          : polite &&
            negative &&
            `Tell-tale sign: the polite form keeps an い-sound and the plain negative keeps an あ-sound — ${polite} shows ${I_ROW[ending]}, ${negative} shows ${A_ROW[ending]}. The final kana changes rather than vanishes.`,
        isRuTrap &&
          'Common る-trap verbs to memorize: 帰る, 入る, 走る, and 切る. They look ichidan but row-shift like godan.',
        isIkuException &&
          `Heads-up: ${dict} is still godan, but its te / past forms are an exception (行って / 行った), so memorize those separately.`,
        !isRuTrap &&
          'Watch for る-ending godan verbs too: words like 帰る, 入る, 走る, and 切る look ichidan at first but row-shift like godan.',
      ].filter(Boolean),
    };
  }

  if (group === 'ichidan') {
    const stem = dictStemForFinal(item, 'る');
    const negative = categoryExampleForm(item, 'plain-negative');
    const polite = categoryExampleForm(item, 'polite-present');
    return {
      label: 'ichidan / ru-verb',
      why: `${dict} is an ichidan (ru-verb): the final る simply drops, and the stem ${stem || 'before る'} stays the same for every form. There is no row-shifting (sound change) like godan.`,
      checks: [
        polite &&
          negative &&
          `Tell-tale sign: ${polite} and ${negative} just drop る — no り / ら sound appears. A godan る-verb like 帰る would show 帰ります / 帰らない instead.`,
        'Contrast: a る-ending godan verb (帰る, 入る, 走る) row-shifts to ら / り / れ / ろ instead of only dropping る.',
      ].filter(Boolean),
    };
  }

  if (group === 'suru') {
    const stem = dictStemForFinal(item, 'する');
    return {
      label: 'irregular',
      why: `${dict} is in the irregular bucket: it is ${stem || 'a noun'} + する, and the する part does not follow godan or ichidan rules. The ${stem || 'first'} part stays put while する is the irregular piece.`,
      checks: [
        `Recognize it by the する ending: anything built on する is irregular, so its forms are memorized, not derived from a verb-group rule.`,
        `The ${stem || 'noun'} part never changes; only する does.`,
      ].filter(Boolean),
    };
  }

  if (group === 'kuru') {
    return {
      label: 'irregular',
      why: `${dict} is in the irregular bucket: its root sound changes (き / こ / く) depending on the form, so no single godan or ichidan rule fits it.`,
      checks: [
        'Recognize 来る as its own pattern and memorize its forms rather than deriving them from a verb group.',
      ],
    };
  }

  if (group === 'i-adjective') {
    const irregular = item?.irregular || reading === 'いい' || reading === 'かっこいい';
    const attributive = categoryExampleForm(item, 'adj-attributive');
    return {
      label: irregular ? 'irregular' : 'い-adjective',
      why: irregular
        ? `${dict} is in the irregular bucket: the visible いい is not the stem most forms use. They come from the older よい, so most non-present forms use a よ base instead of い.`
        : `${dict} is an い-adjective, not a verb. The final い is the part that changes, and there is no verb stem before ます here.`,
      checks: irregular
        ? [
            'Recognize いい (and かっこいい) as exceptions: the present stays いい, but other forms switch to a よ base, so memorize them rather than building from いい.',
          ]
        : [
            'Tell-tale sign: it ends in い and describes a thing. The い itself is what changes — there is no ます-stem like a verb.',
            attributive &&
              `Before a noun, the dictionary form stays as-is: ${attributive} + noun (no な needed).`,
          ].filter(Boolean),
    };
  }

  if (group === 'na-adjective') {
    const attributive = categoryExampleForm(item, 'adj-attributive');
    return {
      label: 'な-adjective',
      why: `${dict} is a な-adjective: the base stays the same, and the word after it (a copula like です / だ, or な before a noun) carries the grammar. It behaves more like a noun than like an い-adjective.`,
      checks: [
        attributive &&
          `Tell-tale sign: it does not end in a changing い. It takes な before a noun (${attributive} + noun) and です / だ to act as a predicate.`,
      ].filter(Boolean),
    };
  }

  if (group === 'noun') {
    return {
      label: 'noun',
      why: `${dict} is a noun, so the noun itself does not conjugate. Tense, politeness, and negativity live in the copula after it, such as だ, です, ではない, or でした.`,
      checks: [
        'Do not force a noun into ichidan or godan rules.',
        'If a noun can become a verb, it should appear as a する entry, like 勉強する, before verb rules apply.',
      ],
    };
  }

  return {
    label: group || 'category',
    why: group
      ? `${dict} is treated as ${group} for this form.`
      : `Use this word's stored category to choose the rule.`,
  };
}

const DIRECT_MASU_STEM_TYPES = new Set([
  'masu-stem',
  'polite-present',
  'polite-past',
  'polite-negative',
  'polite-past-negative',
  'polite-volitional',
  'polite-te',
  'polite-conditional-tara',
  'desiderative',
  'desiderative-polite',
  'desiderative-negative',
  'desiderative-polite-negative',
  'desiderative-past',
  'desiderative-polite-past',
  'desiderative-past-negative',
  'desiderative-polite-past-negative',
  'command-nasai',
]);

const TE_TA_BRIDGE_BASE = {
  'te-form': { type: 'te-form', role: 'te-form' },
  'plain-past': { type: 'plain-past', role: 'ta-form' },
  'conditional-tara': { type: 'plain-past', role: 'ta-form', after: 'ら' },
  'request-kudasai': { type: 'te-form', role: 'te-form', after: 'ください' },
  permission: { type: 'te-form', role: 'te-form', after: 'もいい' },
  progressive: { type: 'te-form', role: 'te-form', after: 'いる' },
  'progressive-polite': { type: 'te-form', role: 'te-form', after: 'います' },
  'progressive-negative': { type: 'te-form', role: 'te-form', after: 'いない' },
  'progressive-polite-negative': { type: 'te-form', role: 'te-form', after: 'いません' },
  'progressive-past': { type: 'te-form', role: 'te-form', after: 'いた' },
  'progressive-polite-past': { type: 'te-form', role: 'te-form', after: 'いました' },
  'progressive-past-negative': { type: 'te-form', role: 'te-form', after: 'いなかった' },
  'progressive-polite-past-negative': {
    type: 'te-form',
    role: 'te-form',
    after: 'いませんでした',
  },
};

function buildMasuStemBridge(item, type, expected) {
  if (!item || isAdjective(item)) return null;
  const polite = surfaceFormFor(item, 'polite-present') || conjugateItem(item, 'polite-present');
  const masuStem = surfaceFormFor(item, 'masu-stem') || conjugateItem(item, 'masu-stem');
  const result = surfaceFormFor(item, type) || expected;
  if (!polite || !masuStem || !result) return null;

  if (DIRECT_MASU_STEM_TYPES.has(type) && result.startsWith(masuStem)) {
    const added = result.slice(masuStem.length);
    return {
      title: 'From polite/masu stem',
      kind: 'direct-masu-stem',
      cells: [
        { label: 'Polite', value: polite },
        { label: 'Drop ます', value: masuStem },
        { label: added ? 'Attach' : 'Use stem', value: added || 'same stem' },
        { label: 'Result', value: result },
      ],
      formula: added
        ? `${polite} -> ${masuStem} + ${added} = ${result}`
        : `${polite} -> ${masuStem}`,
      detail: added
        ? `If you start from polite form, drop ます to get the masu stem, then attach ${added}.`
        : 'If you start from polite form, drop ます; the remaining part is the masu stem.',
    };
  }

  const bridge = TE_TA_BRIDGE_BASE[type];
  if (!bridge) return null;

  const bridgeForm = surfaceFormFor(item, bridge.type) || conjugateItem(item, bridge.type);
  if (!bridgeForm) return null;
  const prefix = longestCommonPrefix(masuStem, bridgeForm);
  const fromEnding = masuStem.slice(prefix.length);
  const toEnding = bridgeForm.slice(prefix.length);
  const bridgePhrase = fromEnding ? `${fromEnding} -> ${toEnding}` : `add ${toEnding}`;
  const cells = [
    { label: 'Polite', value: polite },
    { label: 'Drop ます', value: masuStem },
    { label: bridge.role, value: bridgePhrase },
    { label: 'Result', value: result },
  ];
  const formula =
    bridgeForm === result
      ? `${polite} -> ${masuStem} -> ${bridgeForm}`
      : `${polite} -> ${masuStem} -> ${bridgeForm} -> ${result}`;

  return {
    title: 'From polite/masu stem',
    kind: 'te-ta-bridge',
    cells,
    formula,
    detail:
      bridgeForm === result
        ? `If you learned this through polite form, drop ます first, then bridge the masu stem into the ${bridge.role}: ${bridgePhrase}.`
        : `If you learned this through polite form, drop ます first, make the ${bridge.role}, then attach ${bridge.after || 'the rest of the form'}.`,
  };
}

function expectedOnbinRule(item, type, replacement) {
  const ending = originalEndingFor(item);
  const romaji = GODAN_ENDING_ROMAJI[ending];
  if (!romaji || !ONBIN_TAIL_RULES[type]) return '';
  const replacementRomaji = ONBIN_TAIL_ROMAJI[replacement] || replacement;
  return `${ending} -> ${replacement} (${romaji} -> ${replacementRomaji})`;
}

function ruleSummaryFor(item, type, parts, expected) {
  const ending = originalEndingFor(item);
  const stem = parts.stem || fallbackStem(item, ending);
  const replacement = replacementFromParts(parts, expected, stem);
  const label = typeLabel(type);

  if (isAdjective(item)) {
    if (item.group === 'i-adjective') {
      const irregular = item.irregular || item.reading === 'いい' || item.reading === 'かっこいい';
      return {
        family: irregular ? 'irregular i-adjective' : 'i-adjective',
        short: irregular
          ? `irregular いい/よい stem -> ${replacement || expected}`
          : `drop い -> ${replacement || expected}`,
        detail: irregular
          ? 'Use the よ stem, then attach the adjective ending.'
          : 'Remove the final い, then attach the requested adjective ending.',
      };
    }
    return {
      family: 'na-adjective',
      short: `base + ${replacement || expected}`,
      detail: 'Keep the adjective base and attach the requested copula or connector.',
    };
  }

  if (item.group === 'ichidan') {
    return {
      family: 'ichidan',
      short: `drop る -> ${replacement || expected}`,
      detail: 'Remove the final る and attach the requested ending.',
    };
  }

  if (item.group === 'godan') {
    const onbin = expectedOnbinRule(item, type, replacement);
    if (onbin && (type === 'te-form' || type === 'plain-past')) {
      return {
        family: 'godan sound change',
        short: onbin,
        detail: 'Use the godan sound-change cluster for past/te forms.',
      };
    }
    if (parts.change) {
      return {
        family: 'godan row shift',
        short: `${ending} -> ${parts.change}${parts.suffix ? ` + ${parts.suffix}` : ''}`,
        detail: `Shift the final ${ending} to the needed row, then attach the target ending.`,
      };
    }
    return {
      family: 'godan',
      short: replacement ? `${ending} -> ${replacement}` : 'dictionary form',
      detail: 'Use the dictionary form or the regular godan stem for this target.',
    };
  }

  if (item.group === 'suru') {
    return {
      family: 'suru irregular',
      short: `する -> ${replacement || expected}`,
      detail: 'Conjugate the する part irregularly; keep any compound noun before it.',
    };
  }

  if (item.group === 'kuru') {
    return {
      family: 'kuru irregular',
      short: `くる -> ${replacement || expected}`,
      detail: '来る changes its root sound irregularly by form.',
    };
  }

  return {
    family: item.group || 'rule',
    short: replacement ? `${ending || 'base'} -> ${replacement}` : label,
    detail: `Build the ${label} form from the dictionary form.`,
  };
}

function targetName(type) {
  return type === 'plain-negative' ? 'negative' : typeLabel(type).toLowerCase();
}

function groupRuleConnection(item, type, parts, expected) {
  if (!item || isAdjective(item)) return '';
  const label = groupDisplayLabel(item.group);
  const surface = surfaceFormFor(item, type) || expected;
  const ending = originalEndingFor(item);
  const replacement = replacementFromParts(
    parts,
    expected,
    parts.stem || fallbackStem(item, ending),
  );
  const target = targetName(type);

  if (item.group === 'ichidan') {
    if (type === 'plain-present')
      return `Because this is ${label}, the dictionary form stays as-is.`;
    return `Because this is ${label}, ${item.dict} removes final る before the ending: ${surface}.`;
  }

  if (item.group === 'godan') {
    if ((type === 'te-form' || type === 'plain-past') && replacement && type !== 'plain-present') {
      return `Because this is ${label}, ${item.dict}'s final ${ending} uses the ${replacement} sound change here: ${surface}.`;
    }
    if (parts.change) {
      return `Because this is ${label}, ${item.dict} uses the ${parts.change} row for ${target}: ${surface}.`;
    }
    if (replacement && type !== 'plain-present') {
      return `Because this is ${label}, ${item.dict}'s final ${ending} uses the ${replacement} sound change here: ${surface}.`;
    }
    return `Because this is ${label}, ${item.dict} keeps the dictionary-form ending here: ${surface}.`;
  }

  if (item.group === 'suru') {
    return `Because this is ${label}, the する core changes irregularly for ${target}: ${surface}.`;
  }

  if (item.group === 'kuru') {
    return `Because this is ${label}, 来る changes its root sound for ${target}: ${surface}.`;
  }

  return '';
}

function inferOnbinMistake(item, type, got, expected, expectedRule) {
  if (!item || isAdjective(item) || item.group !== 'godan') return null;
  const rules = ONBIN_TAIL_RULES[type];
  if (!rules) return null;
  const stem = item.reading?.slice(0, -1) || '';
  if (!stem || !got.startsWith(stem) || !expected.startsWith(stem)) return null;
  const gotTail = got.slice(stem.length);
  const expectedTail = expected.slice(stem.length);
  if (!gotTail || gotTail === expectedTail || !rules[gotTail]) return null;
  return {
    kind: 'onbin',
    userAnswer: got,
    userRule: rules[gotTail],
    userResult: got,
    expectedRule: expectedRule.short,
    expectedResult: expected,
    detail: 'The stem is right, but the sound-change ending comes from a different godan cluster.',
  };
}

function godanRowShiftRecipe(item, type) {
  if (!item || item.group !== 'godan') return null;
  const ending = originalEndingFor(item);
  const row = {
    'plain-negative': A_ROW[ending],
    'plain-past-negative': A_ROW[ending],
    'polite-present': I_ROW[ending],
    'polite-past': I_ROW[ending],
    'polite-negative': I_ROW[ending],
    'polite-past-negative': I_ROW[ending],
    potential: E_ROW[ending],
    'conditional-ba': E_ROW[ending],
    imperative: E_ROW[ending],
    passive: A_ROW[ending],
    causative: A_ROW[ending],
    'short-causative-passive': A_ROW[ending],
    volitional: O_ROW[ending],
  }[type];
  const suffix = {
    'plain-negative': 'ない',
    'plain-past-negative': 'なかった',
    'polite-present': 'ます',
    'polite-past': 'ました',
    'polite-negative': 'ません',
    'polite-past-negative': 'ませんでした',
    potential: 'る',
    'conditional-ba': 'ば',
    imperative: '',
    passive: 'れる',
    causative: 'せる',
    'short-causative-passive': 'される',
    volitional: 'う',
  }[type];
  if (!ending || !row || suffix === undefined) return null;
  return { ending, row, suffix };
}

const ROW_SHIFT_LABELS = [
  ['a-row', A_ROW],
  ['i-row', I_ROW],
  ['e-row', E_ROW],
  ['o-row', O_ROW],
];

const SOUND_CHANGE_CLUSTERS = [
  { label: 'く', endings: ['く'] },
  { label: 'ぐ', endings: ['ぐ'] },
  { label: 'す', endings: ['す'] },
  { label: 'う/つ/る', endings: ['う', 'つ', 'る'] },
  { label: 'む/ぶ/ぬ', endings: ['む', 'ぶ', 'ぬ'] },
];

function buildGodanRowShiftVisual(item, parts, expected) {
  if (!item || item.group !== 'godan' || !parts?.change) return null;
  const ending = originalEndingFor(item);
  const stem = parts.stem || fallbackStem(item, ending);
  const rows = ROW_SHIFT_LABELS.map(([label, map]) => ({
    label,
    kana: map[ending] || '',
    active: map[ending] === parts.change,
  })).filter((row) => row.kana);
  const activeRow = rows.find((row) => row.active);
  if (!ending || !stem || !activeRow) return null;
  return {
    ending,
    stem,
    rows,
    targetRow: activeRow.label,
    shiftedKana: parts.change,
    suffix: parts.suffix || '',
    result: expected,
    formula: `${stem} + ${parts.change}${parts.suffix ? ` + ${parts.suffix}` : ''} = ${expected}`,
  };
}

function buildGodanSoundChangeVisual(item, type, parts, expected) {
  if (!item || item.group !== 'godan' || (type !== 'te-form' && type !== 'plain-past')) {
    return null;
  }
  const ending = originalEndingFor(item);
  const stem = parts.stem || fallbackStem(item, ending);
  const replacement = replacementFromParts(parts, expected, stem);
  const targetMap = type === 'te-form' ? TE_END : PAST_END;
  const reading = item.reading || '';
  const isIkuException = reading === 'いく' || reading.endsWith('いく');
  if (!ending || !stem || !replacement || !targetMap[ending]) return null;

  const rows = SOUND_CHANGE_CLUSTERS.map((cluster) => {
    const active = cluster.endings.includes(ending);
    const representative = cluster.endings[0];
    return {
      label: cluster.label,
      kana: active && isIkuException ? replacement : targetMap[representative] || '',
      active,
    };
  }).filter((row) => row.kana);
  const activeCluster = rows.find((row) => row.active);
  if (!activeCluster) return null;

  return {
    kind: 'sound-change',
    ending,
    targetLabel: isIkuException ? `${replacement} (行く exception)` : replacement,
    rows,
    formula: `${stem} + ${replacement} = ${expected}`,
  };
}

function inferGodanRowShiftMistake(item, type, got, expected, expectedRule) {
  if (!item || isAdjective(item) || item.group !== 'godan') return null;
  const recipe = godanRowShiftRecipe(item, type);
  if (!recipe) return null;
  const source = item.reading || item.dict || '';
  if (!source.endsWith(recipe.ending)) return null;
  const stem = source.slice(0, -recipe.ending.length);
  const keptDictionaryEnding = `${stem}${recipe.ending}${recipe.suffix}`;
  const shiftedEnding = `${stem}${recipe.row}${recipe.suffix}`;
  if (got !== keptDictionaryEnding || expected !== shiftedEnding) return null;

  const mistakeIntro = recipe.suffix
    ? `You added ${recipe.suffix}, but kept ${recipe.ending}.`
    : `You kept ${recipe.ending}, but this form needs a row shift.`;
  const suffixPhrase = recipe.suffix ? `, then add ${recipe.suffix}` : '';
  return {
    kind: 'row-shift',
    userAnswer: got,
    userRule: `Kept dictionary ending ${recipe.ending}${recipe.suffix ? ` + ${recipe.suffix}` : ''}`,
    userResult: got,
    expectedRule: expectedRule.short,
    expectedResult: expected,
    detail: `${mistakeIntro} For ${groupDisplayLabel(item.group)} ${typeLabel(type).toLowerCase()}, change ${recipe.ending} to ${recipe.row} first${suffixPhrase}: ${expected}.`,
  };
}

export function inferMistakenConjugationPattern(item, type, userAnswer) {
  const raw = String(userAnswer || '').trim();
  if (raw.startsWith('self-check:') || raw === '(revealed)') return null;
  const got = toHiragana(raw);
  const expected = conjugateItem(item, type);
  if (!got || !expected || got === expected) return null;

  const expectedParts = getConjugationParts(item, type, expected);
  const expectedRule = ruleSummaryFor(item, type, expectedParts, expected);
  const rowShift = inferGodanRowShiftMistake(item, type, got, expected, expectedRule);
  if (rowShift) return rowShift;

  const onbin = inferOnbinMistake(item, type, got, expected, expectedRule);
  if (onbin) return onbin;

  const types = isAdjective(item) ? ADJ_TYPES : CONJ_TYPES;
  for (const candidate of types) {
    if (candidate.id === type) continue;
    if (conjugateItem(item, candidate.id) === got) {
      const debug = getConjugationDebugInfo(item, candidate.id);
      return {
        kind: 'form',
        userAnswer: got,
        userRule: `${candidate.label}: ${debug.rule.short}`,
        userResult: got,
        expectedRule: expectedRule.short,
        expectedResult: expected,
        detail: `That is a valid ${candidate.label.toLowerCase()} form, but this card asks for ${typeLabel(type).toLowerCase()}.`,
      };
    }
  }

  const alternateGroups = isAdjective(item)
    ? [item.group === 'i-adjective' ? 'na-adjective' : 'i-adjective']
    : ['ichidan', 'godan'].filter((group) => group !== item.group);
  for (const group of alternateGroups) {
    const alt = { ...item, group };
    try {
      if (conjugateItem(alt, type) === got) {
        const debug = getConjugationDebugInfo(alt, type);
        return {
          kind: 'group',
          userAnswer: got,
          userRule: `${groupLabel(alt)}: ${debug.rule.short}`,
          userResult: got,
          expectedRule: expectedRule.short,
          expectedResult: expected,
          detail: `The answer follows the ${groupLabel(alt)} pattern, not ${groupLabel(item)}.`,
        };
      }
    } catch {}
  }

  return null;
}

export function getConjugationDebugInfo(word, type, userAnswer = '') {
  const ans = conjugateItem(word, type);
  const parts = getConjugationParts(word, type, ans);
  const originalEnding = originalEndingFor(word);
  const stem = parts.stem || fallbackStem(word, originalEnding);
  const replacement = replacementFromParts(parts, ans, stem);
  const rule = ruleSummaryFor(word, type, parts, ans);
  const label = typeLabel(type);
  const source = word?.reading || word?.dict || '';
  const category = learnerCategoryInfo(word);
  const bridge = buildMasuStemBridge(word, type, ans);
  const formula = {
    stem,
    originalEnding,
    replacement,
    result: ans,
    expression: replacement ? `${stem} + ${replacement} = ${ans}` : ans,
  };
  const steps = [
    {
      title: 'Identify Word Type & Group',
      desc: `"${word.dict}" (${word.reading}) means "${word.meaning}" and is ${groupSentenceLabel(word.group)}.`,
      key: 'group',
      label: 'group',
      value: groupLabel(word),
    },
    {
      title: 'Split Stem & Ending',
      desc: `Keep the stem "${stem || source}" and focus on the ending "${originalEnding}".`,
      key: 'split',
      label: 'stem',
      value: stem || source,
      ending: originalEnding,
    },
    {
      title: 'Apply Rule',
      desc: `${rule.short}. ${rule.detail}`,
      key: 'rule',
      label: 'rule',
      value: rule.short,
    },
    {
      title: 'Verify Conjugation Result',
      desc: `Combine the stem and replacement to get the ${label} form.`,
      key: 'result',
      label: 'result',
      value: ans,
      isResult: true,
      expected: ans,
    },
  ];

  return {
    source,
    targetType: type,
    targetLabel: label,
    category,
    groupLabel: groupLabel(word),
    stem,
    originalEnding,
    replacement,
    result: ans,
    formula,
    rule,
    soundChangeVisual: buildGodanSoundChangeVisual(word, type, parts, ans),
    rowShiftVisual: buildGodanRowShiftVisual(word, parts, ans),
    routes: {
      plain: {
        title: 'From dictionary/plain form',
        cells: [
          { label: 'Stem', value: stem || source },
          { label: 'Ending', value: originalEnding },
          { label: 'Replace', value: replacement || 'same form' },
          { label: 'Result', value: ans },
        ],
        formula: formula.expression,
        detail: rule.detail,
      },
      polite: bridge,
    },
    groupConnection: groupRuleConnection(word, type, parts, ans),
    steps,
    mistake: inferMistakenConjugationPattern(word, type, userAnswer),
  };
}

export function getConjugationSteps(word, type) {
  return getConjugationDebugInfo(word, type).steps;
}

export const GROUP_NAMES = GROUP_SENTENCE_LABELS;

export function explainConjugation(verb, type) {
  const { reading, group, dict } = verb;
  const result = conjugate(verb, type);
  const stem = reading.slice(0, -1),
    last = reading.slice(-1);
  const intro = `${dict} (${reading}) is ${GROUP_NAMES[group]}.`;
  let rule = '',
    derivation = result,
    note = '';
  if (group === 'ichidan') {
    const M = {
      'plain-present': ['Dictionary form.', result],
      'plain-past': ['Drop る, add た.', `${stem} + た = ${result}`],
      'plain-negative': ['Drop る, add ない.', `${stem} + ない = ${result}`],
      'plain-past-negative': ['Drop る, add なかった.', `${stem} + なかった = ${result}`],
      'polite-present': ['Drop る, add ます.', `${stem} + ます = ${result}`],
      'polite-past': ['Drop る, add ました.', `${stem} + ました = ${result}`],
      'polite-negative': ['Drop る, add ません.', `${stem} + ません = ${result}`],
      'polite-past-negative': ['Drop る, add ませんでした.', `${stem} + ませんでした = ${result}`],
      'te-form': ['Drop る, add て.', `${stem} + て = ${result}`],
      potential: ['Drop る, add られる.', `${stem} + られる = ${result}`],
      volitional: ['Drop る, add よう.', `${stem} + よう = ${result}`],
      'conditional-tara': ['Past form + ら.', `${stem} + たら = ${result}`],
      'negative-conditional-tara': [
        'Plain past negative + ら.',
        `${stem} + なかった + ら = ${result}`,
      ],
      'conditional-ba': ['Drop る, add れば.', `${stem} + れば = ${result}`],
      imperative: ['Drop る, add ろ.', `${stem} + ろ = ${result}`],
      passive: ['Drop る, add られる.', `${stem} + られる = ${result}`],
      causative: ['Drop る, add させる.', `${stem} + させる = ${result}`],
    };
    [rule, derivation] = M[type] || ['', result];
  } else if (group === 'godan') {
    const isIku = reading === 'いく' || reading.endsWith('いく');
    const ikuNote = isIku ? ' Note: 行く is irregular — past/te use った/って.' : '';
    const pEnd = isIku ? 'った' : PAST_END[last];
    const teEnd = isIku ? 'って' : TE_END[last];
    const negPast = conjugate(verb, 'plain-past-negative');
    const M = {
      'plain-present': ['Dictionary form.', result],
      'plain-past': [
        `Past: く→いた, ぐ→いだ, す→した, つ/う/る→った, ぬ/ぶ/む→んだ.${ikuNote}`,
        `${stem} + ${pEnd} = ${result}`,
      ],
      'plain-negative': [`あ-row (う→わ!) + ない.`, `${stem} + ${A_ROW[last]} + ない = ${result}`],
      'plain-past-negative': [
        `あ-row + なかった.`,
        `${stem} + ${A_ROW[last]} + なかった = ${result}`,
      ],
      'polite-present': [`い-row + ます.`, `${stem} + ${I_ROW[last]} + ます = ${result}`],
      'polite-past': [`い-row + ました.`, `${stem} + ${I_ROW[last]} + ました = ${result}`],
      'polite-negative': [`い-row + ません.`, `${stem} + ${I_ROW[last]} + ません = ${result}`],
      'polite-past-negative': [
        `い-row + ませんでした.`,
        `${stem} + ${I_ROW[last]} + ませんでした = ${result}`,
      ],
      'te-form': [
        `Te mirrors past with て/で: く→いて, ぐ→いで, す→して, つ/う/る→って, ぬ/ぶ/む→んで.${ikuNote}`,
        `${stem} + ${teEnd} = ${result}`,
      ],
      potential: [`え-row + る.`, `${stem} + ${E_ROW[last]} + る = ${result}`],
      volitional: [`お-row + う.`, `${stem} + ${O_ROW[last]} + う = ${result}`],
      'conditional-tara': ['Past form + ら.', `${stem} + ${pEnd} + ら = ${result}`],
      'negative-conditional-tara': [
        'Plain past negative + ら; う-ending verbs use わ.',
        `${negPast} + ら = ${result}`,
      ],
      'conditional-ba': [`え-row + ば.`, `${stem} + ${E_ROW[last]} + ば = ${result}`],
      imperative: [`え-row (blunt).`, `${stem} + ${E_ROW[last]} = ${result}`],
      passive: [`あ-row + れる.`, `${stem} + ${A_ROW[last]} + れる = ${result}`],
      causative: [`あ-row + せる.`, `${stem} + ${A_ROW[last]} + せる = ${result}`],
      'short-causative-passive': [
        `Short causative-passive: あ-row + される.`,
        `${stem} + ${A_ROW[last]} + される = ${result}`,
      ],
    };
    [rule, derivation] = M[type] || ['', result];
    if (/[いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ]る$/.test(reading)) {
      note = `Trap: ${dict} looks ichidan but is godan.`;
    }
    if (type === 'short-causative-passive' && last === 'す') {
      rule =
        'す-ending Godan verbs do not use the contracted short causative-passive in standard drills.';
      derivation = `Use regular causative-passive: ${conjugate(verb, 'causative-passive')}`;
      note = 'For forms like 話す, keep させられる instead of shortening.';
    }
  } else if (group === 'suru') {
    const compound = reading.endsWith('する') && reading !== 'する' ? reading.slice(0, -2) : '';
    const M = {
      'plain-present': 'Dictionary form.',
      'plain-past': 'する → した (irregular).',
      'plain-negative': 'する → しない.',
      'plain-past-negative': 'する → しなかった.',
      'polite-present': 'する → します.',
      'polite-past': 'する → しました.',
      'polite-negative': 'する → しません.',
      'polite-past-negative': 'する → しませんでした.',
      'te-form': 'する → して.',
      potential: 'Special: する → できる.',
      volitional: 'する → しよう.',
      'conditional-tara': 'する → したら.',
      'negative-conditional-tara': 'する → しなかったら.',
      'conditional-ba': 'する → すれば.',
      imperative: 'する → しろ.',
      passive: 'する → される.',
      causative: 'する → させる.',
    };
    rule = M[type] || '';
    derivation = compound ? `${compound} + (する conjugated) = ${result}` : result;
  } else if (group === 'kuru') {
    const M = {
      'plain-present': '来る (くる).',
      'plain-past': '来る → 来た (きた). く→き.',
      'plain-negative': '来る → 来ない (こない). く→こ.',
      'plain-past-negative': '来る → 来なかった. く→こ.',
      'polite-present': '来る → 来ます (きます). く→き.',
      'polite-past': '来る → 来ました. く→き.',
      'polite-negative': '来る → 来ません. く→き.',
      'polite-past-negative': '来る → 来ませんでした. く→き.',
      'te-form': '来る → 来て (きて). く→き.',
      potential: '来る → 来られる (こられる). く→こ.',
      volitional: '来る → 来よう (こよう). く→こ.',
      'conditional-tara': '来る → 来たら (きたら). く→き.',
      'negative-conditional-tara': '来る → 来なかったら (こなかったら). く→こ.',
      'conditional-ba': '来る → 来れば (くれば). く stays.',
      imperative: '来る → 来い (こい). く→こ.',
      passive: '来る → 来られる. く→こ.',
      causative: '来る → 来させる. く→こ.',
      'short-causative-passive': 'Short spoken form: 来さされる (こさされる).',
    };
    rule = `${dict} is irregular: く shifts to き (polite/past/te) or こ (negative/potential/volitional).`;
    note = M[type] || '';
  }
  return { intro, rule, derivation, note };
}

export function explainAdjective(adj, type) {
  const result = conjugateAdjective(adj, type);
  const stem = adjectiveStem(adj);
  const intro = `${adj.dict} (${adj.reading}) is ${GROUP_NAMES[adj.group]}.`;
  let rule = '',
    derivation = result,
    note = '';
  if (adj.group === 'i-adjective') {
    const irregular = adj.irregular || adj.reading === 'いい' || adj.reading === 'かっこいい';
    const M = {
      'adj-plain-present': ['Dictionary form.', result],
      'adj-plain-past': ['Drop い, add かった.', `${stem} + かった = ${result}`],
      'adj-plain-negative': ['Drop い, add くない.', `${stem} + くない = ${result}`],
      'adj-plain-past-negative': ['Drop い, add くなかった.', `${stem} + くなかった = ${result}`],
      'adj-polite-present': [
        'Add です to the dictionary form.',
        `${adj.reading} + です = ${result}`,
      ],
      'adj-polite-past': [
        'Make the plain past, then add です.',
        `${stem} + かった + です = ${result}`,
      ],
      'adj-polite-negative': [
        'Make the plain negative, then add です.',
        `${stem} + くない + です = ${result}`,
      ],
      'adj-polite-past-negative': [
        'Make the plain past negative, then add です.',
        `${stem} + くなかった + です = ${result}`,
      ],
      'adj-te-form': ['Drop い, add くて.', `${stem} + くて = ${result}`],
      'adj-negative-te-form': [
        'Make the plain negative, then replace ない with なくて.',
        `${stem} + くなくて = ${result}`,
      ],
      'adj-adverb': ['Drop い, add く.', `${stem} + く = ${result}`],
      'adj-attributive': ['Use the dictionary form before a noun.', result],
      'adj-conditional': ['Drop い, add ければ.', `${stem} + ければ = ${result}`],
      'adj-negative-conditional': [
        'Make the plain negative, then replace ない with なければ.',
        `${stem} + くなければ = ${result}`,
      ],
      'adj-tara': ['Plain past + ら.', `${stem} + かった + ら = ${result}`],
      'adj-negative-tara': ['Plain past negative + ら.', `${stem} + くなかった + ら = ${result}`],
      'adj-sou': ['Drop い, add そう.', `${stem} + そう = ${result}`],
      'adj-sugiru': ['Drop い, add すぎる.', `${stem} + すぎる = ${result}`],
      'adj-naru': ['Drop い, add くなる.', `${stem} + くなる = ${result}`],
    };
    [rule, derivation] = M[type] || ['', result];
    if (irregular) note = 'いい and かっこいい conjugate from よい, so the stem becomes よ.';
  } else {
    const s = adj.reading.replace(/な$/, '');
    const M = {
      'adj-plain-present': ['Add だ for the plain predicative form.', `${s} + だ = ${result}`],
      'adj-plain-past': ['Add だった.', `${s} + だった = ${result}`],
      'adj-plain-negative': ['Add ではない.', `${s} + ではない = ${result}`],
      'adj-plain-past-negative': ['Add ではなかった.', `${s} + ではなかった = ${result}`],
      'adj-polite-present': ['Add です.', `${s} + です = ${result}`],
      'adj-polite-past': ['Add でした.', `${s} + でした = ${result}`],
      'adj-polite-negative': ['Add ではありません.', `${s} + ではありません = ${result}`],
      'adj-polite-past-negative': [
        'Add ではありませんでした.',
        `${s} + ではありませんでした = ${result}`,
      ],
      'adj-te-form': ['Use で to connect clauses.', `${s} + で = ${result}`],
      'adj-negative-te-form': [
        'Make the plain negative, then replace ない with なくて.',
        `${s} + ではなくて = ${result}`,
      ],
      'adj-adverb': ['Add に for the adverbial form.', `${s} + に = ${result}`],
      'adj-attributive': ['Add な before a noun.', `${s} + な = ${result}`],
      'adj-conditional': ['Use なら for the common conditional.', `${s} + なら = ${result}`],
      'adj-negative-conditional': [
        'Make the plain negative, then replace ない with なければ.',
        `${s} + ではなければ = ${result}`,
      ],
      'adj-tara': ['Plain past + ら.', `${s} + だった + ら = ${result}`],
      'adj-negative-tara': ['Plain past negative + ら.', `${s} + ではなかった + ら = ${result}`],
      'adj-sou': ['Add そう.', `${s} + そう = ${result}`],
      'adj-sugiru': ['Add すぎる.', `${s} + すぎる = ${result}`],
      'adj-naru': ['Add になる.', `${s} + になる = ${result}`],
    };
    [rule, derivation] = M[type] || ['', result];
  }
  return { intro, rule, derivation, note };
}

export function explainItem(item, type) {
  if (isAdjective(item)) return explainAdjective(item, type);
  const e = explainConjugation(item, type);
  const common = {
    'masu-stem': 'Use the stem that appears before ます.',
    'polite-volitional': 'Use the ます stem, then add ましょう.',
    'polite-te': 'Use the ます stem, then add まして.',
    'polite-conditional-tara': 'Use the polite past ました, then add ら.',
    honorific:
      "Use a special honorific verb when one exists; otherwise use お + ます-stem + になる to raise someone else's action.",
    'honorific-polite':
      'Make the honorific form, then put it in polite ます style. Special verbs like なさる and いらっしゃる become なさいます and いらっしゃいます.',
    humble:
      'Use a special humble verb when one exists; otherwise use お + ます-stem + する to lower your own action.',
    'humble-polite':
      'Make the humble form, then put it in polite ます style. Suru-based humble forms become します / いたします.',
    'potential-negative': 'Make the potential form, then make it negative.',
    'potential-polite': 'Make the potential form, then replace final る with ます.',
    'potential-polite-negative': 'Make the potential form, then replace final る with ません.',
    'potential-polite-past': 'Make the potential form, then replace final る with ました.',
    'potential-polite-past-negative':
      'Make the potential form, then replace final る with ませんでした.',
    'potential-past': 'Make the potential form, then replace final る with た.',
    'potential-past-negative': 'Make the potential form, then replace final る with なかった.',
    'potential-conditional-ba': 'Make the potential form, then replace final る with れば.',
    'negative-conditional-ba': 'Make the plain negative form, then replace ない with なければ.',
    'potential-negative-conditional-ba':
      'Make the potential negative form, then replace ない with なければ.',
    'conditional-nara': 'Use the dictionary form, then add なら.',
    conjectural: 'Use the dictionary form, then add だろう.',
    'passive-polite': 'Make the passive form, then replace final る with ます.',
    'passive-negative': 'Make the passive form, then make it negative.',
    'passive-polite-negative': 'Make the passive form, then replace final る with ません.',
    'passive-polite-past': 'Make the passive form, then replace final る with ました.',
    'passive-polite-past-negative':
      'Make the passive form, then replace final る with ませんでした.',
    'passive-past': 'Make the passive form, then replace final る with た.',
    'passive-past-negative': 'Make the passive form, then replace final る with なかった.',
    'passive-conditional-ba': 'Make the passive form, then replace final る with れば.',
    'passive-negative-conditional-ba':
      'Make the passive negative form, then replace ない with なければ.',
    'causative-polite': 'Make the causative form, then replace final る with ます.',
    'causative-negative': 'Make the causative form, then make it negative.',
    'causative-polite-negative': 'Make the causative form, then replace final る with ません.',
    'causative-polite-past': 'Make the causative form, then replace final る with ました.',
    'causative-polite-past-negative':
      'Make the causative form, then replace final る with ませんでした.',
    'causative-past': 'Make the causative form, then replace final る with た.',
    'causative-past-negative': 'Make the causative form, then replace final る with なかった.',
    'causative-conditional-ba': 'Make the causative form, then replace final る with れば.',
    'causative-negative-conditional-ba':
      'Make the causative negative form, then replace ない with なければ.',
    'short-causative':
      'Use the colloquial short causative: あ-row + す for godan verbs, or replace させる with さす.',
    'short-causative-polite':
      'Make the short causative, then conjugate that す-ending form with ます.',
    'short-causative-negative':
      'Make the short causative, then conjugate that す-ending form with ない.',
    'short-causative-polite-negative':
      'Make the short causative, then conjugate that す-ending form with ません.',
    'short-causative-past': 'Make the short causative, then conjugate that す-ending form with た.',
    'short-causative-polite-past':
      'Make the short causative, then conjugate that す-ending form with ました.',
    'short-causative-past-negative':
      'Make the short causative, then conjugate that す-ending form with なかった.',
    'short-causative-polite-past-negative': 'Make the short causative-polite-past-negative form.',
    'short-causative-conditional-ba':
      'Make the short causative, then conjugate that す-ending form with ば.',
    'short-causative-negative-conditional-ba':
      'Make the short causative negative, then replace ない with なければ.',
    'causative-passive-polite': 'Make the causative-passive form, then replace final る with ます.',
    'causative-passive-polite-past':
      'Make the causative-passive form, then replace final る with ました.',
    'causative-passive-past': 'Make the causative-passive form, then replace final る with た.',
    'causative-passive-negative':
      'Make the causative-passive form, then replace final る with ない.',
    'causative-passive-polite-negative':
      'Make the causative-passive form, then replace final る with ません.',
    'causative-passive-polite-past-negative':
      'Make the causative-passive form, then replace final る with ませんでした.',
    'causative-passive-past-negative':
      'Make the causative-passive form, then replace final る with なかった.',
    'causative-passive-conditional-ba':
      'Make the causative-passive form, then replace final る with れば.',
    'causative-passive-negative-conditional-ba':
      'Make the causative-passive negative form, then replace ない with なければ.',
    'short-causative-passive-polite':
      'Make the short causative-passive form, then replace final る with ます.',
    'short-causative-passive-polite-past':
      'Make the short causative-passive form, then replace final る with ました.',
    'short-causative-passive-past':
      'Make the short causative-passive form, then replace final る with た.',
    'short-causative-passive-negative':
      'Make the short causative-passive form, then replace final る with ない.',
    'short-causative-passive-polite-negative':
      'Make the short causative-passive form, then replace final る with ません.',
    'short-causative-passive-polite-past-negative':
      'Make the short causative-passive form, then replace final る with ませんでした.',
    'short-causative-passive-past-negative':
      'Make the short causative-passive form, then replace final る with なかった.',
    'short-causative-passive-conditional-ba':
      'Make the short causative-passive form, then replace final る with れば.',
    'short-causative-passive-negative-conditional-ba':
      'Make the short causative-passive negative form, then replace ない with なければ.',
    'request-kudasai': 'Use the te-form, then add ください.',
    'negative-request': 'Use the negative te-form, then add ください.',
    'negative-te-connective': 'Make the plain negative form, then replace ない with なくて.',
    'negative-zu': 'Use the ない stem, then add ず. Irregulars: する → せず; 来る → こず.',
    'negative-zuni':
      'Use ず + に for formal or written "without doing." Irregulars: する → せずに; 来る → こずに.',
    permission: 'Use the te-form, then add もいい.',
    obligation: 'Use the negative stem before い, then add ければならない.',
    'desiderative-polite': 'Use the たい form, then add です.',
    'desiderative-negative':
      'Use the たい form, then conjugate たい like an い-adjective: たい → たくない.',
    'desiderative-polite-negative':
      'Use the たい form, conjugate it like an い-adjective to たくない, then add です.',
    'desiderative-past':
      'Use the たい form, then conjugate たい like an い-adjective: たい → たかった.',
    'desiderative-polite-past':
      'Use the たい form, conjugate it like an い-adjective to たかった, then add です.',
    'desiderative-past-negative':
      'Use the たい form, then conjugate たい like an い-adjective: たい → たくなかった.',
    'desiderative-polite-past-negative':
      'Use the たい form, conjugate it like an い-adjective to たくなかった, then add です.',
    'progressive-polite': 'Use the te-form, then add います.',
    'progressive-negative': 'Use the te-form, then add いない.',
    'progressive-polite-negative': 'Use the te-form, then add いません.',
    'progressive-past': 'Use the te-form, then add いた.',
    'progressive-polite-past': 'Use the te-form, then add いました.',
    'progressive-past-negative': 'Use the te-form, then add いなかった.',
    'progressive-polite-past-negative': 'Use the te-form, then add いませんでした.',
    'command-nasai':
      'Use the stem before ます, then add なさい. This is a firm instruction, often from a parent, teacher, sign, or test prompt.',
  };
  if (!e.rule && common[type]) e.rule = common[type];
  if (!e.rule && type === 'causative-passive')
    e.rule =
      item.group === 'godan'
        ? 'Use the あ-row stem, then add せられる.'
        : 'Use the causative stem and add られる.';
  if (!e.rule && type === 'short-causative-passive')
    e.rule =
      item.group === 'godan'
        ? String(item.reading || '').endsWith('す')
          ? 'す-ending Godan verbs keep the regular させられる causative-passive in standard practice.'
          : 'Use the あ-row stem, then add される for the shorter spoken causative-passive.'
        : 'Use 来さされる for the shorter spoken form of 来る.';
  if (!e.rule && type === 'desiderative')
    e.rule =
      item.group === 'godan'
        ? 'Use the い-row stem, then add たい.'
        : 'Use the verb stem, then add たい.';
  if (!e.rule && type === 'progressive') e.rule = 'Use the te-form, then add いる.';
  if (!e.rule && type === 'negative-te') e.rule = 'Use the plain negative form, then add で.';
  if (!e.rule && type === 'prohibition')
    e.rule = 'Use the dictionary form, then add な for a blunt prohibition.';
  if (!e.rule && type === 'command-nasai') e.rule = 'Use the stem before ます, then add なさい.';
  e.reason = buildReason(item, type);
  const compoundDeriv = buildCompoundDerivation(item, type);
  if (compoundDeriv) e.derivation = compoundDeriv;
  return e;
}

// Deterministic, offline hint shown when the student clicks "Hint" while
// answering. Empty hints only nudge the next thinking step; once the learner
// has typed something, the hint states how the form is built and where the
// student currently is without printing the full final answer on first hint.
//
// Irregular forms (する, 来る, よい-based adjectives…) have no derivable rule —
// their "rule" text spells out the answer. To keep the first hint spoiler-free,
// such text is replaced with a nudge unless `reveal` is true (a second Hint
// click). Returns { text, masked }, where `masked` means more can be revealed.
export function stepCoachHint(item, type, typed, reveal = false) {
  const expected = conjugateItem(item, type);
  const exp = explainItem(item, type);
  const compound = compoundBuildInfo(item, type);
  let recipe = [exp.rule, exp.note, safeCompoundRecipe(compound)].filter(Boolean).join(' ').trim();
  // Only a genuine transformation can spoil — the unchanged dictionary form can't.
  const wouldReveal = !!expected && expected !== item.reading && recipe.includes(expected);
  let masked = false;
  if (wouldReveal && !reveal) {
    recipe = `This is an irregular form, so it doesn't follow the usual pattern — try to recall its special conjugation. Tap Hint again or use "Discuss further" to reveal the steps.`;
    masked = true;
  }
  const got = toHiragana(typed || '') || typed || '';
  if (!got && !(wouldReveal && reveal)) return { text: emptyAnswerNudge(item), masked };
  let correct = 0;
  while (correct < got.length && correct < expected.length && got[correct] === expected[correct])
    correct++;
  let status;
  if (!got) {
    status = emptyAnswerNudge(item);
  } else if (correct === 0) {
    status = `The very beginning doesn't match yet. ${positionHint(type, got, expected, correct, compound)}`;
  } else if (correct < got.length) {
    status = `${prefixStatus(correct, got)} ${positionHint(type, got, expected, correct, compound)}`;
  } else if (correct >= expected.length) {
    status = `That's the full length — press Enter to check it.`;
  } else {
    const remaining = expected.length - correct;
    status = `「${got}」 is correct so far — ${remaining} more kana to go. ${continuationHint(expected, correct, compound)}`;
  }
  return { text: recipe ? `${recipe}\n\n${status}` : status, masked };
}

export function diagnose(verb, type, userAnswer) {
  const got = toHiragana(userAnswer);
  if (!got) return '';
  for (const t of CONJ_TYPES) {
    if (t.id === type) continue;
    if (conjugate(verb, t.id) === got)
      return `That's the ${t.label.toLowerCase()} form — wrong conjugation pattern.`;
  }
  for (const g of ['ichidan', 'godan'].filter((g) => g !== verb.group)) {
    try {
      const alt = conjugate({ ...verb, group: g }, type);
      if (alt === got)
        return `You conjugated this as ${groupDisplayLabel(g)}, but ${verb.dict} is ${groupDisplayLabel(verb.group)}.`;
    } catch {}
  }
  return '';
}

export function diagnoseItem(item, type, userAnswer) {
  if (!isAdjective(item)) return diagnose(item, type, userAnswer);
  const got = toHiragana(userAnswer);
  if (!got) return '';
  for (const t of ADJ_TYPES) {
    if (t.id === type) continue;
    if (conjugateAdjective(item, t.id) === got)
      return `That's the ${t.label.toLowerCase()} form, but this card asks for ${getTypeInfo(type).label.toLowerCase()}.`;
  }
  const other = item.group === 'i-adjective' ? 'na-adjective' : 'i-adjective';
  try {
    if (conjugateAdjective({ ...item, group: other }, type) === got)
      return `You used the ${other === 'i-adjective' ? 'い-adjective' : 'な-adjective'} pattern, but ${item.dict} is ${GROUP_NAMES[item.group]}.`;
  } catch {}
  return '';
}

export function contextSentenceFor(item, type) {
  const form = conjugateItem(item, type);
  const label = (TYPE_LABEL[type] || type).toLowerCase();
  if (isAdjective(item)) {
    const place = 'この場所';
    const M = {
      'adj-plain-present': [
        `${place}は${form}。`,
        'This place is described with the target adjective.',
      ],
      'adj-plain-past': [
        `昨日は${form}。`,
        'Yesterday it was described with the target adjective.',
      ],
      'adj-plain-negative': [`${place}は${form}。`, 'This place is not described that way.'],
      'adj-plain-past-negative': [`昨日は${form}。`, 'Yesterday it was not described that way.'],
      'adj-polite-present': [`${place}は${form}。`, 'Polite sentence using the adjective.'],
      'adj-polite-past': [`昨日は${form}。`, 'Polite past sentence using the adjective.'],
      'adj-polite-negative': [
        `${place}は${form}。`,
        'Polite negative sentence using the adjective.',
      ],
      'adj-polite-past-negative': [
        `昨日は${form}。`,
        'Polite past-negative sentence using the adjective.',
      ],
      'adj-te-form': [`${form}、便利です。`, 'Connects the adjective to another description.'],
      'adj-negative-te-form': [`${form}、困ります。`, 'Connects a negative adjective to a result.'],
      'adj-adverb': [`${form}話してください。`, 'Uses the adverbial form before a verb.'],
      'adj-attributive': [`${form}場所です。`, 'Uses the adjective before a noun.'],
      'adj-conditional': [`${form}、行きます。`, 'Uses the conditional before a result.'],
      'adj-negative-conditional': [
        `${form}、行きません。`,
        'If it is not that way, the result changes.',
      ],
      'adj-tara': [`${form}、行きます。`, 'Uses the tara conditional before a result.'],
      'adj-negative-tara': [`${form}、行きません。`, 'If it is not that way, the result changes.'],
      'adj-sou': [`${form}です。`, 'Looks or seems that way.'],
      'adj-sugiru': [`${form}ので、困ります。`, 'Too much of that quality causes a problem.'],
      'adj-naru': [`だんだん${form}。`, 'Shows a change into that state.'],
    };
    const picked = M[type] || [`${place}は${form}。`, `Short context using the ${label} form.`];
    return { ja: picked[0], en: picked[1], form, label };
  }
  const plainPastMeaning = englishForForm(item, 'plain-past');
  const plainPastNegativeMeaning = englishForForm(item, 'plain-past-negative');
  const politePastMeaning = englishForForm(item, 'polite-past');
  const politePastNegativeMeaning = englishForForm(item, 'polite-past-negative');
  const M = {
    'plain-present': [`毎日、${form}。`, 'I do this every day.'],
    'plain-past': [`昨日、${form}。`, `Plain past meaning: ${plainPastMeaning}.`],
    'plain-negative': [`今日は${form}。`, 'I will not do this today.'],
    'plain-past-negative': [
      `昨日は${form}。`,
      `Plain past negative meaning: ${plainPastNegativeMeaning}.`,
    ],
    'polite-present': [`毎日、${form}。`, 'Polite sentence for doing this every day.'],
    'polite-past': [`昨日、${form}。`, `Polite past meaning: ${politePastMeaning}.`],
    'polite-negative': [`今日は${form}。`, 'Polite sentence for not doing this today.'],
    'polite-past-negative': [
      `昨日は${form}。`,
      `Polite past negative meaning: ${politePastNegativeMeaning}.`,
    ],
    'masu-stem': [
      `${form}ながら、音楽を聞きます。`,
      'Uses the stem with ながら for doing two things together.',
    ],
    'polite-volitional': [`一緒に${form}。`, 'Polite invitation to do this together.'],
    'polite-te': [`${form}、少し休みます。`, 'Polite connective before the next action.'],
    'polite-conditional-tara': [`${form}、教えてください。`, 'Polite if/when sentence.'],
    honorific: [
      `先生はよく${form}。`,
      'Raises the teacher or customer as the doer of this action.',
    ],
    'honorific-polite': [
      `先生はよく${form}。`,
      'Politely raises the teacher or customer as the doer of this action.',
    ],
    humble: [
      `私はあとで${form}。`,
      "Lowers the speaker while describing the speaker's own action.",
    ],
    'humble-polite': [
      `私があとで${form}。`,
      "Politely lowers the speaker while describing the speaker's own action.",
    ],
    'te-form': [`${form}、少し休みます。`, 'Connects this action to another action.'],
    potential: [`ここで${form}。`, 'Says this can be done here.'],
    'potential-polite': [`ここで${form}。`, 'Politely says this can be done here.'],
    'potential-negative': [`今は${form}。`, 'Says this cannot be done now.'],
    'potential-polite-negative': [`今は${form}。`, 'Politely says this cannot be done now.'],
    'potential-polite-past': [`昨日は${form}。`, 'Politely says this could be done yesterday.'],
    'potential-polite-past-negative': [
      `昨日は${form}。`,
      'Politely says this could not be done yesterday.',
    ],
    'potential-past': [`昨日は${form}。`, 'Says this could be done yesterday.'],
    'potential-past-negative': [`昨日は${form}。`, 'Says this could not be done yesterday.'],
    'potential-conditional-ba': [
      `${form}、手伝います。`,
      'If this can be done, someone helps or responds.',
    ],
    volitional: [`明日、${form}。`, "Let's do this tomorrow."],
    'conditional-tara': [`${form}、教えてください。`, 'If or when this happens, please tell me.'],
    'negative-conditional-tara': [
      `${form}、教えてください。`,
      'If or when this does not happen, please tell me.',
    ],
    'conditional-ba': [`${form}、上手になります。`, 'If you do this, you improve.'],
    'negative-conditional-ba': [
      `${form}、別の方法にします。`,
      'If this does not happen, use another method.',
    ],
    'potential-negative-conditional-ba': [
      `${form}、手伝ってください。`,
      'If this cannot be done, ask for help.',
    ],
    'conditional-nara': [`${form}、今がいいです。`, 'If doing this, now is good.'],
    conjectural: [`たぶん${form}。`, 'Probably does this.'],
    imperative: [`今すぐ${form}。`, 'Blunt command form.'],
    'command-nasai': [
      `今、${form}。`,
      'Firm instruction using なさい, often from a parent, teacher, sign, or test prompt.',
    ],
    passive: [`友だちに${form}。`, 'Passive context with another person involved.'],
    'passive-polite': [`友だちに${form}。`, 'Polite passive context with another person involved.'],
    'passive-negative': [`友だちに${form}。`, 'Negative passive context.'],
    'passive-polite-negative': [`友だちに${form}。`, 'Polite negative passive context.'],
    'passive-polite-past': [
      `昨日、友だちに${form}。`,
      'Polite past passive context with another person involved.',
    ],
    'passive-polite-past-negative': [
      `昨日、友だちに${form}。`,
      'Polite past negative passive context.',
    ],
    'passive-past': [
      `昨日、友だちに${form}。`,
      'Past passive context with another person involved.',
    ],
    'passive-past-negative': [`昨日、友だちに${form}。`, 'Past negative passive context.'],
    'passive-conditional-ba': [
      `友だちに${form}、うれしいです。`,
      'If this is done to someone, there is a result.',
    ],
    'passive-negative-conditional-ba': [
      `友だちに${form}、安心です。`,
      'If this is not done to someone, there is relief.',
    ],
    causative: [`先生は学生に${form}。`, 'Someone makes or lets a student do it.'],
    'causative-polite': [
      `先生は学生に${form}。`,
      'Politely says someone makes or lets a student do it.',
    ],
    'causative-negative': [
      `先生は学生に${form}。`,
      'Someone does not make or let a student do it.',
    ],
    'causative-polite-negative': [
      `先生は学生に${form}。`,
      'Politely says someone does not make or let a student do it.',
    ],
    'causative-polite-past': [
      `昨日、先生は学生に${form}。`,
      'Politely says someone made or let a student do it yesterday.',
    ],
    'causative-polite-past-negative': [
      `昨日、先生は学生に${form}。`,
      'Politely says someone did not make or let a student do it yesterday.',
    ],
    'causative-past': [
      `昨日、先生は学生に${form}。`,
      'Someone made or let a student do it yesterday.',
    ],
    'causative-past-negative': [
      `昨日、先生は学生に${form}。`,
      'Someone did not make or let a student do it yesterday.',
    ],
    'causative-conditional-ba': [
      `先生が学生に${form}、練習になります。`,
      'If someone makes or lets a student do it, it becomes practice.',
    ],
    'causative-negative-conditional-ba': [
      `先生が学生に${form}、学生は自分でします。`,
      'If someone does not make or let a student do it, the student does it alone.',
    ],
    'short-causative': [
      `先生は学生に${form}。`,
      'Colloquial sentence where someone makes or lets a student do it.',
    ],
    'short-causative-polite': [
      `先生は学生に${form}。`,
      'Colloquial polite sentence where someone makes or lets a student do it.',
    ],
    'short-causative-negative': [
      `先生は学生に${form}。`,
      'Colloquial sentence where someone does not make or let a student do it.',
    ],
    'short-causative-polite-negative': [
      `先生は学生に${form}。`,
      'Colloquial polite sentence where someone does not make or let a student do it.',
    ],
    'short-causative-past': [
      `昨日、先生は学生に${form}。`,
      'Colloquial sentence where someone made or let a student do it yesterday.',
    ],
    'short-causative-polite-past': [
      `昨日、先生は学生に${form}。`,
      'Colloquial polite sentence where someone made or let a student do it yesterday.',
    ],
    'short-causative-past-negative': [
      `昨日、先生は学生に${form}。`,
      'Colloquial sentence where someone did not make or let a student do it yesterday.',
    ],
    'short-causative-polite-past-negative': [
      `昨日、先生は学生に${form}。`,
      'Colloquial polite sentence where someone did not make or let a student do it yesterday.',
    ],
    'short-causative-conditional-ba': [
      `先生が学生に${form}、練習になります。`,
      'Colloquial if-sentence for making or letting someone do it.',
    ],
    'short-causative-negative-conditional-ba': [
      `先生が学生に${form}、学生は自分でします。`,
      'Colloquial if-sentence for not making or letting someone do it.',
    ],
    'causative-passive': [`学生は先生に${form}。`, 'A student is made to do it.'],
    'causative-passive-polite': [
      `学生は先生に${form}。`,
      'Politely says a student is made to do it.',
    ],
    'causative-passive-polite-past': [
      `昨日、学生は先生に${form}。`,
      'Politely says a student was made to do it yesterday.',
    ],
    'causative-passive-past': [
      `昨日、学生は先生に${form}。`,
      'A student was made to do it yesterday.',
    ],
    'causative-passive-negative': [`学生は先生に${form}。`, 'A student is not made to do it.'],
    'causative-passive-polite-negative': [
      `学生は先生に${form}。`,
      'Politely says a student is not made to do it.',
    ],
    'causative-passive-polite-past-negative': [
      `昨日、学生は先生に${form}。`,
      'Politely says a student was not made to do it yesterday.',
    ],
    'causative-passive-past-negative': [
      `昨日、学生は先生に${form}。`,
      'A student was not made to do it yesterday.',
    ],
    'causative-passive-conditional-ba': [
      `学生が先生に${form}、大変です。`,
      'If a student is made to do it, it is difficult.',
    ],
    'causative-passive-negative-conditional-ba': [
      `学生が先生に${form}、安心です。`,
      'If a student is not made to do it, there is relief.',
    ],
    'short-causative-passive': [
      `学生は先生に${form}。`,
      'A student is made to do it, using the shorter spoken form.',
    ],
    'short-causative-passive-polite': [
      `学生は先生に${form}。`,
      'Polite sentence using the shorter spoken causative-passive form.',
    ],
    'short-causative-passive-polite-past': [
      `昨日、学生は先生に${form}。`,
      'Polite past sentence using the shorter spoken causative-passive form.',
    ],
    'short-causative-passive-past': [
      `昨日、学生は先生に${form}。`,
      'Past sentence using the shorter spoken causative-passive form.',
    ],
    'short-causative-passive-negative': [
      `学生は先生に${form}。`,
      'Negative sentence using the shorter spoken causative-passive form.',
    ],
    'short-causative-passive-polite-negative': [
      `学生は先生に${form}。`,
      'Polite negative sentence using the shorter spoken causative-passive form.',
    ],
    'short-causative-passive-polite-past-negative': [
      `昨日、学生は先生に${form}。`,
      'Polite past negative sentence using the shorter spoken causative-passive form.',
    ],
    'short-causative-passive-past-negative': [
      `昨日、学生は先生に${form}。`,
      'Past negative sentence using the shorter spoken causative-passive form.',
    ],
    'short-causative-passive-conditional-ba': [
      `学生が先生に${form}、大変です。`,
      'If a student is made to do it, using the shorter spoken form.',
    ],
    'short-causative-passive-negative-conditional-ba': [
      `学生が先生に${form}、安心です。`,
      'If a student is not made to do it, using the shorter spoken form.',
    ],
    desiderative: [`今、${form}。`, 'I want to do this now.'],
    'desiderative-polite': [`今、${form}。`, 'Polite way to say I want to do this now.'],
    'desiderative-negative': [`今は${form}。`, 'I do not want to do this now.'],
    'desiderative-polite-negative': [
      `内容は${form}。`,
      'Polite way to say I do not want to do this now.',
    ],
    'desiderative-past': [`昨日、${form}。`, 'I wanted to do this yesterday.'],
    'desiderative-polite-past': [
      `昨日、${form}。`,
      'Polite way to say I wanted to do this yesterday.',
    ],
    'desiderative-past-negative': [`昨日は${form}。`, 'I did not want to do this yesterday.'],
    'desiderative-polite-past-negative': [
      `昨日は${form}。`,
      'Polite way to say I did not want to do this yesterday.',
    ],
    progressive: [`今、${form}。`, 'This is happening now.'],
    'progressive-polite': [`今、${form}。`, 'Polite way to say this is happening now.'],
    'progressive-negative': [
      `まだ${form}。`,
      'This has not happened yet, or is not happening now.',
    ],
    'progressive-polite-negative': [
      `まだ${form}。`,
      'Polite way to say this has not happened yet, or is not happening now.',
    ],
    'progressive-past': [`昨日の夜、${form}。`, 'This was happening at that time.'],
    'progressive-polite-past': [
      `昨日の夜、${form}。`,
      'Polite way to say this was happening at that time.',
    ],
    'progressive-past-negative': [`その時、${form}。`, 'This was not happening at that time.'],
    'progressive-polite-past-negative': [
      `その時、${form}。`,
      'Polite way to say this was not happening at that time.',
    ],
    'negative-te': [`${form}、待ってください。`, 'Please wait without doing this.'],
    'negative-te-connective': [
      `${form}、困っています。`,
      'Not doing this connects to the next result.',
    ],
    'negative-zu': [
      `${form}、次に進みます。`,
      'Formal/written connector for not doing this before moving on.',
    ],
    'negative-zuni': [`${form}、出かけました。`, 'Formal/written way to say without doing this.'],
    prohibition: [`ここで${form}。`, 'Do not do this here.'],
    'request-kudasai': [`すみません、${form}。`, 'Excuse me, please do this.'],
    'negative-request': [`ここで${form}。`, 'Please do not do this here.'],
    permission: [`ここで${form}。`, 'It is okay to do this here.'],
    obligation: [`明日までに${form}。`, 'This must be done by tomorrow.'],
  };
  const picked = M[type] || [
    `短い文で${form}を使います。`,
    `Short context using the ${label} form.`,
  ];
  return { ja: picked[0], en: picked[1], form, label };
}
