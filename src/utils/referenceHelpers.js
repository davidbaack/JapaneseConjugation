// Pure reference/lookup helpers extracted from ReferenceViewSub (improvement #4).
// Search, reverse-conjugation candidate matching, kanji/stroke link builders,
// writing/pronunciation drill data, and favorites/history list transforms — all
// dependency-light functions kept out of the (large) view component so they can
// be tested and reused directly.
import { toHiragana, kanaToRomaji } from './romaji.js';
import {
  conjugateItem,
  isAdjective,
  wordKind,
  wordGroupId,
  getWordMeta,
  conjugate,
  conjugateAdjective,
  isIrregularAdjective,
} from './conjugator.js';
import { explainItem, GROUP_NAMES } from './conjugatorExplain.js';
import { CONJ_TYPES, ADJ_TYPES } from '../data/conjugationTypes.js';
import { normalizeReferenceState, referenceProgressFor, defaultState } from './storage.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export function classifyHint(word) {
  if (word.group === 'ichidan')
    return `${word.reading} is ichidan: remove る to make forms like ${conjugate(word, 'polite-present')}.`;
  if (word.group === 'godan')
    return `${word.reading} is godan: the final ${word.reading.slice(-1)} shifts rows, as in ${conjugate(word, 'plain-negative')}.`;
  if (word.group === 'suru') return 'する is irregular: する, した, しない, して, できる.';
  if (word.group === 'kuru') return '来る is irregular: くる, きた, こない, きて.';
  if (isIrregularAdjective(word)) {
    return `${word.reading} is an irregular い-adjective: present stays ${word.reading}, but other forms use よ, as in ${conjugateAdjective(word, 'adj-plain-past')} and ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  }
  if (word.group === 'i-adjective')
    return `${word.reading} conjugates as an い-adjective: ${conjugateAdjective(word, 'adj-plain-past')}, ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  return `${word.reading} is a な-adjective: ${conjugateAdjective(word, 'adj-attributive')} + noun, or ${conjugateAdjective(word, 'adj-polite-present')}.`;
}

const TRANSITIVE_VERB_PAIRS = [
  {
    transitive: {
      dict: '開ける',
      reading: 'あける',
      meaning: 'to open something',
      group: 'ichidan',
    },
    intransitive: {
      dict: '開く',
      reading: 'あく',
      meaning: 'to open / become open',
      group: 'godan',
    },
    scene: 'door, window, shop',
  },
  {
    transitive: {
      dict: '閉める',
      reading: 'しめる',
      meaning: 'to close something',
      group: 'ichidan',
    },
    intransitive: {
      dict: '閉まる',
      reading: 'しまる',
      meaning: 'to close / be closed',
      group: 'godan',
    },
    scene: 'door, lid, store',
  },
  {
    transitive: { dict: '出す', reading: 'だす', meaning: 'to take out / submit', group: 'godan' },
    intransitive: {
      dict: '出る',
      reading: 'でる',
      meaning: 'to go out / appear',
      group: 'ichidan',
    },
    scene: 'person, item, result',
  },
  {
    transitive: { dict: '入れる', reading: 'いれる', meaning: 'to put in', group: 'ichidan' },
    intransitive: { dict: '入る', reading: 'はいる', meaning: 'to enter / fit in', group: 'godan' },
    scene: 'room, container, group',
  },
  {
    transitive: { dict: '壊す', reading: 'こわす', meaning: 'to break something', group: 'godan' },
    intransitive: {
      dict: '壊れる',
      reading: 'こわれる',
      meaning: 'to break / be broken',
      group: 'ichidan',
    },
    scene: 'machine, object',
  },
  {
    transitive: {
      dict: '始める',
      reading: 'はじめる',
      meaning: 'to start something',
      group: 'ichidan',
    },
    intransitive: { dict: '始まる', reading: 'はじまる', meaning: 'to begin', group: 'godan' },
    scene: 'class, meeting, event',
  },
  {
    transitive: {
      dict: '終える',
      reading: 'おえる',
      meaning: 'to finish something',
      group: 'ichidan',
    },
    intransitive: { dict: '終わる', reading: 'おわる', meaning: 'to end / finish', group: 'godan' },
    scene: 'work, class, event',
  },
  {
    transitive: {
      dict: 'つける',
      reading: 'つける',
      meaning: 'to turn on / attach',
      group: 'ichidan',
    },
    intransitive: {
      dict: 'つく',
      reading: 'つく',
      meaning: 'to turn on / be attached',
      group: 'godan',
    },
    scene: 'light, mark, device',
  },
  {
    transitive: { dict: '消す', reading: 'けす', meaning: 'to turn off / erase', group: 'godan' },
    intransitive: {
      dict: '消える',
      reading: 'きえる',
      meaning: 'to disappear / go out',
      group: 'ichidan',
    },
    scene: 'light, text, fire',
  },
  {
    transitive: { dict: '落とす', reading: 'おとす', meaning: 'to drop something', group: 'godan' },
    intransitive: {
      dict: '落ちる',
      reading: 'おちる',
      meaning: 'to fall / drop',
      group: 'ichidan',
    },
    scene: 'object, score, leaf',
  },
  {
    transitive: {
      dict: '集める',
      reading: 'あつめる',
      meaning: 'to gather / collect something',
      group: 'ichidan',
    },
    intransitive: {
      dict: '集まる',
      reading: 'あつまる',
      meaning: 'to gather / assemble',
      group: 'godan',
    },
    scene: 'people, data, things',
  },
  {
    transitive: { dict: '直す', reading: 'なおす', meaning: 'to fix something', group: 'godan' },
    intransitive: {
      dict: '直る',
      reading: 'なおる',
      meaning: 'to be fixed / recover',
      group: 'godan',
    },
    scene: 'mistake, machine, habit',
  },
];

function matchesVerbBase(word, base) {
  return !!(
    word &&
    base &&
    word.group === base.group &&
    (word.dict === base.dict || word.reading === base.reading)
  );
}

export function transitivePairFor(word, words = []) {
  if (!word || isAdjective(word)) return null;
  for (const pair of TRANSITIVE_VERB_PAIRS) {
    const role = matchesVerbBase(word, pair.transitive)
      ? 'transitive'
      : matchesVerbBase(word, pair.intransitive)
        ? 'intransitive'
        : null;
    if (!role) continue;
    const partnerBase = role === 'transitive' ? pair.intransitive : pair.transitive;
    const partner = words.find((w) => matchesVerbBase(w, partnerBase)) || partnerBase;
    return {
      pair,
      role,
      partnerRole: role === 'transitive' ? 'intransitive' : 'transitive',
      partner,
      partnerInDeck: words.some((w) => matchesVerbBase(w, partnerBase)),
    };
  }
  return null;
}

export function wordKeyLocal(word) {
  return `${word.group}:${word.dict}`;
}

export function searchWords(query, words) {
  const q = query.trim().toLowerCase();
  if (!q) return words;
  const h = toHiragana(q);
  return words.filter((w) => {
    if (
      w.dict.includes(query) ||
      w.reading.includes(h) ||
      kanaToRomaji(w.reading).includes(q) ||
      w.meaning.toLowerCase().includes(q) ||
      GROUP_NAMES[w.group].toLowerCase().includes(q)
    )
      return true;
    return formRows(w).some(
      (r) => r.answer === h || r.answer.includes(h) || kanaToRomaji(r.answer).includes(q),
    );
  });
}

function surfaceStemPair(item) {
  if (!item || !item.reading || !item.dict) return { readingStem: '', dictStem: '' };
  if (item.group === 'suru')
    return {
      readingStem: item.reading.endsWith('する') ? item.reading.slice(0, -2) : '',
      dictStem: item.dict.endsWith('する') ? item.dict.slice(0, -2) : item.dict,
    };
  if (item.group === 'kuru')
    return {
      readingStem: item.reading.endsWith('くる') ? item.reading.slice(0, -2) : '',
      dictStem: item.dict.replace(/(来る|くる)$/, ''),
    };
  if (item.group === 'i-adjective') {
    if (item.irregular || item.reading === 'いい' || item.reading === 'かっこいい')
      return { readingStem: '', dictStem: '' };
    // Simple adjective reading stem: chop off final i
    return {
      readingStem: item.reading.endsWith('い') ? item.reading.slice(0, -1) : item.reading,
      dictStem: item.dict.endsWith('い') ? item.dict.slice(0, -1) : item.dict,
    };
  }
  if (item.group === 'na-adjective')
    return { readingStem: item.reading.replace(/な$/, ''), dictStem: item.dict.replace(/な$/, '') };
  return { readingStem: item.reading.slice(0, -1), dictStem: item.dict.slice(0, -1) };
}

export function surfaceFormForLocal(item, typeId) {
  const answer = conjugateItem(item, typeId);
  if (!answer || !item || !item.dict || item.dict === item.reading) return answer || '';
  const { readingStem, dictStem } = surfaceStemPair(item);
  if (item.group === 'kuru' && answer.startsWith(readingStem)) {
    const tail = answer.slice(readingStem.length);
    if (['き', 'こ', 'く'].includes(tail[0])) return dictStem + '来' + tail.slice(1);
    return dictStem + tail;
  }
  if (readingStem && answer.startsWith(readingStem))
    return dictStem + answer.slice(readingStem.length);
  return answer;
}

function compactLookupText(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[、。！？\s'"「」『』（）()[\]{}]/g, '')
    .toLowerCase();
}

function lookupVariantValues(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return [raw, compactLookupText(raw), kanaToRomaji(raw).toLowerCase()].filter(Boolean);
}

export function formLookupCandidates(query, words) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const queryVariants = new Set(
    [
      raw,
      compactLookupText(raw),
      toHiragana(raw),
      compactLookupText(toHiragana(raw)),
      raw.toLowerCase().replace(/\s+/g, ''),
    ].filter(Boolean),
  );
  const allowContext = /[\u3040-\u30ff\u3400-\u9fff]/.test(raw);
  const exact = [],
    context = [],
    seen = new Set();
  for (const word of words) {
    for (const row of formRows(word)) {
      const surface = surfaceFormForLocal(word, row.type.id);
      const variants = [...lookupVariantValues(row.answer), ...lookupVariantValues(surface)];
      const key = `${wordKeyLocal(word)}|${row.type.id}|${row.answer}`;
      const exactHit = variants.find((v) => queryVariants.has(v));
      const contextHit =
        allowContext &&
        !exactHit &&
        variants.find((v) => {
          const min = /^[a-z]+$/.test(v) ? 4 : 2;
          return (
            v.length >= min && [...queryVariants].some((q) => q.length > v.length && q.includes(v))
          );
        });
      if ((exactHit || contextHit) && !seen.has(key)) {
        seen.add(key);
        (exactHit ? exact : context).push({
          word,
          type: row.type,
          answer: row.answer,
          surface: surface || row.answer,
          explanation: row.explanation,
          matchKind: exactHit ? 'exact' : 'in context',
          hitText: exactHit || contextHit || row.answer,
        });
      }
    }
  }
  const chosen = exact.length
    ? exact
    : context.filter(
        (m, _, arr) =>
          !arr.some(
            (other) =>
              other !== m &&
              other.hitText.length > m.hitText.length &&
              other.hitText.includes(m.hitText),
          ),
      );
  return chosen
    .sort(
      (a, b) =>
        (a.matchKind === b.matchKind ? 0 : a.matchKind === 'exact' ? -1 : 1) ||
        b.hitText.length - a.hitText.length ||
        b.answer.length - a.answer.length,
    )
    .slice(0, 12);
}

export function adHocReferenceCandidates(query) {
  const raw = String(query || '').trim();
  if (!raw || raw.length > 48) return [];
  const reading = compactLookupText(toHiragana(raw));
  if (!reading || /[a-z]/i.test(reading)) return [];
  // eslint-disable-next-line no-control-regex
  const dict = /^[\x00-\x7F\s'"-]+$/.test(raw) ? reading : compactLookupText(raw);
  const chars = Array.from(reading),
    last = chars[chars.length - 1],
    prev = chars[chars.length - 2] || '';
  const hasKanji = /[\u3400-\u9fff]/u.test(dict);
  const make = (group, note, overrideReading = reading) => ({
    dict,
    reading: overrideReading,
    meaning: `scratch conjugation for "${raw}"`,
    group,
    adHoc: true,
    sourceNote: note,
  });
  if (reading === 'くる' || dict.endsWith('来る'))
    return [
      make(
        'kuru',
        'Local irregular 来る / くる table.',
        dict.endsWith('来る') ? dict.slice(0, -2) + 'くる' : reading,
      ),
    ];
  if (reading.endsWith('する')) return [make('suru', 'Local する / compound する table.')];
  if (last === 'い' && !/[うくぐすつぬぶむる]$/u.test(reading))
    return [
      make(
        'i-adjective',
        'Local い-adjective guess. Some words ending in い are not い-adjectives, so verify if unsure.',
      ),
    ];
  if (last === 'な') return [make('na-adjective', 'Local な-adjective guess from a な ending.')];
  if ('うくぐすつぬぶむ'.includes(last))
    return [make('godan', 'Local godan guess from the dictionary-form final kana.')];
  if (last === 'る') {
    const likelyIchidan =
      !hasKanji && /[いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ]$/u.test(prev);
    if (likelyIchidan) {
      return [
        make(
          'ichidan',
          'Heuristic: -iru/-eru often behaves as ichidan. Some common verbs are godan exceptions.',
        ),
        make('godan', 'Alternate godan table for -iru/-eru exceptions like 帰る / かえる.'),
      ];
    }
    if (hasKanji) {
      return [
        make('ichidan', 'Kanji reading is unknown locally, so this table is a hypothesis.'),
        make('godan', 'Alternate godan hypothesis for a kanji verb ending in る.'),
      ];
    }
    return [
      make('godan', 'Local godan guess because this does not look like an -iru/-eru ichidan verb.'),
    ];
  }
  return [];
}

export function formRows(item) {
  const types = isAdjective(item) ? ADJ_TYPES : CONJ_TYPES;
  return types.map((t) => ({
    type: t,
    answer: conjugateItem(item, t.id),
    explanation: explainItem(item, t.id),
  }));
}

export function referenceRows(item, state = defaultState()) {
  return formRows(item).map((r) => ({
    ...r,
    progress: referenceProgressFor(state, item, r.type.id),
  }));
}

export function splitJapaneseMorae(text = '') {
  const small = 'ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ';
  const morae = [];
  for (const ch of String(text || '')) {
    if (small.includes(ch) && morae.length) morae[morae.length - 1] += ch;
    else morae.push(ch);
  }
  return morae.filter(Boolean);
}

export function kanjiCharsFor(text = '') {
  const seen = new Set();
  return Array.from(String(text || '')).filter((ch) => {
    if (!/[\u3400-\u9fff]/u.test(ch) || seen.has(ch)) return false;
    seen.add(ch);
    return true;
  });
}

export function referenceDictionaryLinks(item) {
  const q = encodeURIComponent(item?.dict || item?.reading || '');
  if (!q) return [];
  return [
    { id: 'jisho', label: 'Jisho', url: `https://jisho.org/search/${q}` },
    { id: 'takoboto', label: 'Takoboto', url: `https://takoboto.jp/?q=${q}` },
  ];
}

export function kanjiDictionaryLinks(ch) {
  const q = encodeURIComponent(ch);
  return [
    {
      id: `jisho-${ch}`,
      label: 'Jisho',
      url: `https://jisho.org/search/${encodeURIComponent(`${ch} #kanji`)}`,
    },
    { id: `takoboto-${ch}`, label: 'Takoboto', url: `https://takoboto.jp/?q=${q}` },
  ];
}

function kanjiStrokeFileName(ch) {
  const cp = String(ch || '').codePointAt(0);
  return cp ? `${cp.toString(16).padStart(5, '0')}.svg` : '';
}

function kanjiStrokeLinks(ch) {
  const file = kanjiStrokeFileName(ch);
  const links = [
    {
      id: `jisho-stroke-${ch}`,
      label: 'Jisho',
      url: `https://jisho.org/search/${encodeURIComponent(`${ch} #kanji`)}`,
    },
  ];
  if (file)
    links.unshift({
      id: `kanjivg-${ch}`,
      label: 'KanjiVG',
      url: `https://kanjivg.tagaini.net/viewer.html?file=${file}`,
    });
  return links;
}

export function writingPracticeUnits(item) {
  const kanji = kanjiCharsFor(item?.dict);
  if (kanji.length) return kanji.map((ch) => ({ ch, type: 'kanji', links: kanjiStrokeLinks(ch) }));
  return splitJapaneseMorae(item?.reading || item?.dict || '')
    .slice(0, 8)
    .map((ch) => ({
      ch,
      type: 'kana',
      links: [
        {
          id: `jisho-kana-${ch}`,
          label: 'Jisho',
          url: `https://jisho.org/search/${encodeURIComponent(ch)}`,
        },
      ],
    }));
}

export function writingDrillSteps(item, units = []) {
  const chars = units.map((u) => u.ch).join(' + ');
  const reading = item?.reading || item?.dict || 'the word';
  return [
    `Trace ${chars || reading} twice while saying ${reading}.`,
    `Cover the model, write it once, then compare the balance and endings.`,
    `Write one conjugated form from the table so the okurigana stays attached.`,
  ];
}

export function pronunciationPracticeForms(item) {
  const ids = isAdjective(item)
    ? [
        'adj-plain-present',
        'adj-plain-negative',
        'adj-plain-past',
        'adj-te-form',
        'adj-polite-present',
      ]
    : ['plain-present', 'plain-negative', 'plain-past', 'te-form', 'polite-present', 'potential'];
  const seen = new Set();
  return formRows(item)
    .filter((r) => ids.includes(r.type.id))
    .map((r) => r.answer)
    .filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    })
    .slice(0, 6);
}

const FAVORITES_LIST_ID = 'favorites';
export const FAVORITES_LIST_NAME = 'Favorites';
const FOCUS_LIST_ID = 'focus-word';
const FOCUS_LIST_NAME = 'Focus word';

export function findFavoritesList(wordLists = []) {
  return (
    wordLists.find((l) => l.id === FAVORITES_LIST_ID) ||
    wordLists.find(
      (l) =>
        String(l.name || '')
          .trim()
          .toLowerCase() === FAVORITES_LIST_NAME.toLowerCase(),
    ) ||
    null
  );
}

export function favoriteListHasWord(wordLists = [], word) {
  const list = findFavoritesList(wordLists);
  return !!(list && word && (list.wordKeys || []).includes(wordKeyLocal(word)));
}

export function toggleFavoriteInLists(wordLists = [], word) {
  if (!word) return { wordLists, listId: FAVORITES_LIST_ID, favorited: false, count: 0 };
  const key = wordKeyLocal(word);
  const existing = findFavoritesList(wordLists);
  const id = existing?.id || FAVORITES_LIST_ID;
  const keys = new Set(existing?.wordKeys || []);
  const favorited = !keys.has(key);
  if (favorited) keys.add(key);
  else keys.delete(key);
  const nextList = {
    ...(existing || {}),
    id,
    name: existing?.name || FAVORITES_LIST_NAME,
    wordKeys: [...keys],
  };
  const nextLists = existing
    ? wordLists.map((l) => (l.id === existing.id ? nextList : l))
    : [nextList, ...wordLists];
  return { wordLists: nextLists, listId: id, favorited, count: nextList.wordKeys.length };
}

export function focusWordInLists(wordLists = [], word) {
  if (!word) return { wordLists, listId: FOCUS_LIST_ID, count: 0 };
  const key = wordKeyLocal(word);
  const index = wordLists.findIndex(
    (l) =>
      l.id === FOCUS_LIST_ID ||
      String(l.name || '')
        .trim()
        .toLowerCase() === FOCUS_LIST_NAME.toLowerCase(),
  );
  const nextList = {
    ...(index >= 0 ? wordLists[index] : {}),
    id: FOCUS_LIST_ID,
    name: FOCUS_LIST_NAME,
    wordKeys: [key],
  };
  const nextLists =
    index >= 0 ? wordLists.map((l, i) => (i === index ? nextList : l)) : [nextList, ...wordLists];
  return { wordLists: nextLists, listId: FOCUS_LIST_ID, count: 1 };
}

export function focusPracticePrefsForWord(prefs = DEFAULT_PREFS, word) {
  if (!word) return prefs;
  const meta = getWordMeta(word);
  return {
    ...prefs,
    practiceFocus: 'balanced',
    wordListIds: [FOCUS_LIST_ID],
    jlptLevels: [meta.jlpt || 'N3'],
    wordTypes: [wordKind(word)],
    wordGroups: [wordGroupId(word)],
    genkiLessons: [],
  };
}

function referenceWordSnapshot(word) {
  return {
    dict: word.dict,
    reading: word.reading,
    meaning: word.meaning || '',
    group: word.group,
    lastAt: Date.now(),
  };
}

export function referenceWithSearch(reference, query) {
  const q = String(query || '').trim();
  if (!q) return normalizeReferenceState(reference);
  const ref = normalizeReferenceState(reference);
  return { ...ref, recentSearches: [q, ...ref.recentSearches.filter((s) => s !== q)].slice(0, 12) };
}

export function referenceWithHistory(reference, word) {
  if (!word) return normalizeReferenceState(reference);
  const ref = normalizeReferenceState(reference);
  const key = wordKeyLocal(word);
  const prior = ref.history.find((w) => wordKeyLocal(w) === key);
  const fresh = { ...referenceWordSnapshot(word), count: (prior?.count || 0) + 1 };
  return {
    ...ref,
    history: [fresh, ...ref.history.filter((w) => wordKeyLocal(w) !== key)].slice(0, 24),
  };
}
