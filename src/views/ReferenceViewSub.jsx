import React, { useState, useEffect, useMemo } from 'react';
import { IconList, IconStar, IconCheck, IconVolume, IconSpark, IconBook, IconPen, IconRefresh } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { PitchAccentSection } from '../components/PitchAccent.jsx';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import { toHiragana, kanaToRomaji, isAllKana } from '../utils/romaji.js';
import {
  conjugateItem,
  getTypeInfo,
  explainItem,
  diagnoseItem,
  compatibleTypes,
  GROUP_NAMES,
  isAdjective,
  wordKind,
  wordGroupId,
  getWordMeta,
  conjugate,
  conjugateAdjective,
  isIrregularAdjective
} from '../utils/conjugator.js';
import {
  normalizeReferenceState,
  referenceProgressFor,
  defaultState,
  ruleWeakScore
} from '../utils/storage.js';
import {
  formDisplay,
  promptDisplay,
  englishForForm,
  shuffled,
  drillDirectionFor
} from '../utils/display.js';
import { callGemini, aiSystemFromPrefs, extractJSON, AI_COACH_SYSTEM } from '../utils/gemini.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { explainReversePrompt } from './StudyView.jsx';

const CLASSIFY_OPTIONS = [
  { id: 'ichidan', label: 'る-verb', hint: 'Drop る and attach endings directly.' },
  { id: 'godan', label: 'う-verb', hint: 'The final kana shifts across あ/い/え/お rows.' },
  { id: 'suru', label: 'する', hint: 'Irregular する pattern.' },
  { id: 'kuru', label: '来る', hint: 'Irregular 来る pattern.' },
  { id: 'irregular-adjective', label: 'irregular い-adjective', hint: 'いい keeps its present form but conjugates from よい.' },
  { id: 'i-adjective', label: 'い-adjective', hint: 'Usually ends in い and conjugates like 高い → 高かった.' },
  { id: 'na-adjective', label: 'な-adjective', hint: 'Takes な before nouns and uses だ/です as a predicate.' }
];

export function classifyHint(word) {
  if (word.group === 'ichidan') return `${word.reading} is ichidan: remove る to make forms like ${conjugate(word, 'polite-present')}.`;
  if (word.group === 'godan') return `${word.reading} is godan: the final ${word.reading.slice(-1)} shifts rows, as in ${conjugate(word, 'plain-negative')}.`;
  if (word.group === 'suru') return 'する is irregular: する, した, しない, して, できる.';
  if (word.group === 'kuru') return '来る is irregular: くる, きた, こない, きて.';
  if (isIrregularAdjective(word)) {
    return `${word.reading} is an irregular い-adjective: present stays ${word.reading}, but other forms use よ, as in ${conjugateAdjective(word, 'adj-plain-past')} and ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  }
  if (word.group === 'i-adjective') return `${word.reading} conjugates as an い-adjective: ${conjugateAdjective(word, 'adj-plain-past')}, ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  return `${word.reading} is a な-adjective: ${conjugateAdjective(word, 'adj-attributive')} + noun, or ${conjugateAdjective(word, 'adj-polite-present')}.`;
}

const TRANSITIVE_VERB_PAIRS = [
  { transitive: { dict: '開ける', reading: 'あける', meaning: 'to open something', group: 'ichidan' }, intransitive: { dict: '開く', reading: 'あく', meaning: 'to open / become open', group: 'godan' }, scene: 'door, window, shop' },
  { transitive: { dict: '閉める', reading: 'しめる', meaning: 'to close something', group: 'ichidan' }, intransitive: { dict: '閉まる', reading: 'しまる', meaning: 'to close / be closed', group: 'godan' }, scene: 'door, lid, store' },
  { transitive: { dict: '出す', reading: 'だす', meaning: 'to take out / submit', group: 'godan' }, intransitive: { dict: '出る', reading: 'でる', meaning: 'to go out / appear', group: 'ichidan' }, scene: 'person, item, result' },
  { transitive: { dict: '入れる', reading: 'いれる', meaning: 'to put in', group: 'ichidan' }, intransitive: { dict: '入る', reading: 'はいる', meaning: 'to enter / fit in', group: 'godan' }, scene: 'room, container, group' },
  { transitive: { dict: '壊す', reading: 'こわす', meaning: 'to break something', group: 'godan' }, intransitive: { dict: '壊れる', reading: 'こわれる', meaning: 'to break / be broken', group: 'ichidan' }, scene: 'machine, object' },
  { transitive: { dict: '始める', reading: 'はじめる', meaning: 'to start something', group: 'ichidan' }, intransitive: { dict: '始まる', reading: 'はじまる', meaning: 'to begin', group: 'godan' }, scene: 'class, meeting, event' },
  { transitive: { dict: '終える', reading: 'おえる', meaning: 'to finish something', group: 'ichidan' }, intransitive: { dict: '終わる', reading: 'おわる', meaning: 'to end / finish', group: 'godan' }, scene: 'work, class, event' },
  { transitive: { dict: 'つける', reading: 'つける', meaning: 'to turn on / attach', group: 'ichidan' }, intransitive: { dict: 'つく', reading: 'つく', meaning: 'to turn on / be attached', group: 'godan' }, scene: 'light, mark, device' },
  { transitive: { dict: '消す', reading: 'けす', meaning: 'to turn off / erase', group: 'godan' }, intransitive: { dict: '消える', reading: 'きえる', meaning: 'to disappear / go out', group: 'ichidan' }, scene: 'light, text, fire' },
  { transitive: { dict: '落とす', reading: 'おとす', meaning: 'to drop something', group: 'godan' }, intransitive: { dict: '落ちる', reading: 'おちる', meaning: 'to fall / drop', group: 'ichidan' }, scene: 'object, score, leaf' },
  { transitive: { dict: '集める', reading: 'あつめる', meaning: 'to gather / collect something', group: 'ichidan' }, intransitive: { dict: '集まる', reading: 'あつまる', meaning: 'to gather / assemble', group: 'godan' }, scene: 'people, data, things' },
  { transitive: { dict: '直す', reading: 'なおす', meaning: 'to fix something', group: 'godan' }, intransitive: { dict: '直る', reading: 'なおる', meaning: 'to be fixed / recover', group: 'godan' }, scene: 'mistake, machine, habit' }
];

function matchesVerbBase(word, base) {
  return !!(word && base && word.group === base.group && (word.dict === base.dict || word.reading === base.reading));
}

function transitivePairFor(word, words = []) {
  if (!word || isAdjective(word)) return null;
  for (const pair of TRANSITIVE_VERB_PAIRS) {
    const role = matchesVerbBase(word, pair.transitive) ? 'transitive' : matchesVerbBase(word, pair.intransitive) ? 'intransitive' : null;
    if (!role) continue;
    const partnerBase = role === 'transitive' ? pair.intransitive : pair.transitive;
    const partner = words.find(w => matchesVerbBase(w, partnerBase)) || partnerBase;
    return {
      pair,
      role,
      partnerRole: role === 'transitive' ? 'intransitive' : 'transitive',
      partner,
      partnerInDeck: words.some(w => matchesVerbBase(w, partnerBase))
    };
  }
  return null;
}

function wordKeyLocal(word) {
  return `${word.group}:${word.dict}`;
}

export function searchWords(query, words) {
  const q = query.trim().toLowerCase();
  if (!q) return words;
  const h = toHiragana(q);
  return words.filter(w => {
    if (w.dict.includes(query) || w.reading.includes(h) || kanaToRomaji(w.reading).includes(q) || w.meaning.toLowerCase().includes(q) || GROUP_NAMES[w.group].toLowerCase().includes(q)) return true;
    return formRows(w).some(r => r.answer === h || r.answer.includes(h) || kanaToRomaji(r.answer).includes(q));
  });
}

function surfaceStemPair(item) {
  if (!item || !item.reading || !item.dict) return { readingStem: '', dictStem: '' };
  if (item.group === 'suru') return { readingStem: item.reading.endsWith('する') ? item.reading.slice(0, -2) : '', dictStem: item.dict.endsWith('する') ? item.dict.slice(0, -2) : item.dict };
  if (item.group === 'kuru') return { readingStem: item.reading.endsWith('くる') ? item.reading.slice(0, -2) : '', dictStem: item.dict.replace(/(来る|くる)$/, '') };
  if (item.group === 'i-adjective') {
    if (item.irregular || item.reading === 'いい' || item.reading === 'かっこいい') return { readingStem: '', dictStem: '' };
    // Simple adjective reading stem: chop off final i
    return { readingStem: item.reading.endsWith('い') ? item.reading.slice(0, -1) : item.reading, dictStem: item.dict.endsWith('い') ? item.dict.slice(0, -1) : item.dict };
  }
  if (item.group === 'na-adjective') return { readingStem: item.reading.replace(/な$/, ''), dictStem: item.dict.replace(/な$/, '') };
  return { readingStem: item.reading.slice(0, -1), dictStem: item.dict.slice(0, -1) };
}

function surfaceFormForLocal(item, typeId) {
  const answer = conjugateItem(item, typeId);
  if (!answer || !item || !item.dict || item.dict === item.reading) return answer || '';
  const { readingStem, dictStem } = surfaceStemPair(item);
  if (item.group === 'kuru' && answer.startsWith(readingStem)) {
    const tail = answer.slice(readingStem.length);
    if (['き', 'こ', 'く'].includes(tail[0])) return dictStem + '来' + tail.slice(1);
    return dictStem + tail;
  }
  if (readingStem && answer.startsWith(readingStem)) return dictStem + answer.slice(readingStem.length);
  return answer;
}

function compactLookupText(s) {
  return String(s || '').normalize('NFKC').replace(/[、。！？\s'"「」『』（）()\[\]{}]/g, '').toLowerCase();
}

function lookupVariantValues(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return [raw, compactLookupText(raw), kanaToRomaji(raw).toLowerCase()].filter(Boolean);
}

export function formLookupCandidates(query, words) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const queryVariants = new Set([raw, compactLookupText(raw), toHiragana(raw), compactLookupText(toHiragana(raw)), raw.toLowerCase().replace(/\s+/g, '')].filter(Boolean));
  const allowContext = /[\u3040-\u30ff\u3400-\u9fff]/.test(raw);
  const exact = [],
    context = [],
    seen = new Set();
  for (const word of words) {
    for (const row of formRows(word)) {
      const surface = surfaceFormForLocal(word, row.type.id);
      const variants = [...lookupVariantValues(row.answer), ...lookupVariantValues(surface)];
      const key = `${wordKeyLocal(word)}|${row.type.id}|${row.answer}`;
      const exactHit = variants.find(v => queryVariants.has(v));
      const contextHit = allowContext && !exactHit && variants.find(v => {
        const min = /^[a-z]+$/.test(v) ? 4 : 2;
        return v.length >= min && [...queryVariants].some(q => q.length > v.length && q.includes(v));
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
          hitText: exactHit || contextHit || row.answer
        });
      }
    }
  }
  const chosen = exact.length ? exact : context.filter((m, _, arr) => !arr.some(other => other !== m && other.hitText.length > m.hitText.length && other.hitText.includes(m.hitText)));
  return chosen.sort((a, b) => (a.matchKind === b.matchKind ? 0 : a.matchKind === 'exact' ? -1 : 1) || b.hitText.length - a.hitText.length || b.answer.length - a.answer.length).slice(0, 12);
}

export function adHocReferenceCandidates(query) {
  const raw = String(query || '').trim();
  if (!raw || raw.length > 48) return [];
  const reading = compactLookupText(toHiragana(raw));
  if (!reading || /[a-z]/i.test(reading)) return [];
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
    sourceNote: note
  });
  if (reading === 'くる' || dict.endsWith('来る')) return [make('kuru', 'Local irregular 来る / くる table.', dict.endsWith('来る') ? dict.slice(0, -2) + 'くる' : reading)];
  if (reading.endsWith('する')) return [make('suru', 'Local する / compound する table.')];
  if (last === 'い' && !/[うくぐすつぬぶむる]$/u.test(reading)) return [make('i-adjective', 'Local い-adjective guess. Some words ending in い are not い-adjectives, so verify if unsure.')];
  if (last === 'な') return [make('na-adjective', 'Local な-adjective guess from a な ending.')];
  if ('うくぐすつぬぶむ'.includes(last)) return [make('godan', 'Local godan guess from the dictionary-form final kana.')];
  if (last === 'る') {
    const likelyIchidan = !hasKanji && /[いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ]$/u.test(prev);
    if (likelyIchidan) {
      return [
        make('ichidan', 'Heuristic: -iru/-eru often behaves as ichidan. Some common verbs are godan exceptions.'),
        make('godan', 'Alternate godan table for -iru/-eru exceptions like 帰る / かえる.')
      ];
    }
    if (hasKanji) {
      return [
        make('ichidan', 'Kanji reading is unknown locally, so this table is a hypothesis.'),
        make('godan', 'Alternate godan hypothesis for a kanji verb ending in る.')
      ];
    }
    return [make('godan', 'Local godan guess because this does not look like an -iru/-eru ichidan verb.')];
  }
  return [];
}

export function formRows(item) {
  const types = isAdjective(item) ? ADJ_TYPES : CONJ_TYPES;
  return types.map(t => ({ type: t, answer: conjugateItem(item, t.id), explanation: explainItem(item, t.id) }));
}

export function referenceRows(item, state = defaultState()) {
  return formRows(item).map(r => ({ ...r, progress: referenceProgressFor(state, item, r.type.id) }));
}

function splitJapaneseMorae(text = '') {
  const small = 'ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ';
  const morae = [];
  for (const ch of String(text || '')) {
    if (small.includes(ch) && morae.length) morae[morae.length - 1] += ch;
    else morae.push(ch);
  }
  return morae.filter(Boolean);
}

function kanjiCharsFor(text = '') {
  const seen = new Set();
  return Array.from(String(text || '')).filter(ch => {
    if (!/[\u3400-\u9fff]/u.test(ch) || seen.has(ch)) return false;
    seen.add(ch);
    return true;
  });
}

function referenceDictionaryLinks(item) {
  const q = encodeURIComponent(item?.dict || item?.reading || '');
  if (!q) return [];
  return [
    { id: 'jisho', label: 'Jisho', url: `https://jisho.org/search/${q}` },
    { id: 'takoboto', label: 'Takoboto', url: `https://takoboto.jp/?q=${q}` }
  ];
}

function kanjiDictionaryLinks(ch) {
  const q = encodeURIComponent(ch);
  return [
    { id: `jisho-${ch}`, label: 'Jisho', url: `https://jisho.org/search/${encodeURIComponent(`${ch} #kanji`)}` },
    { id: `takoboto-${ch}`, label: 'Takoboto', url: `https://takoboto.jp/?q=${q}` }
  ];
}

function kanjiStrokeFileName(ch) {
  const cp = String(ch || '').codePointAt(0);
  return cp ? `${cp.toString(16).padStart(5, '0')}.svg` : '';
}

function kanjiStrokeLinks(ch) {
  const file = kanjiStrokeFileName(ch);
  const links = [
    { id: `jisho-stroke-${ch}`, label: 'Jisho', url: `https://jisho.org/search/${encodeURIComponent(`${ch} #kanji`)}` }
  ];
  if (file) links.unshift({ id: `kanjivg-${ch}`, label: 'KanjiVG', url: `https://kanjivg.tagaini.net/viewer.html?file=${file}` });
  return links;
}

function writingPracticeUnits(item) {
  const kanji = kanjiCharsFor(item?.dict);
  if (kanji.length) return kanji.map(ch => ({ ch, type: 'kanji', links: kanjiStrokeLinks(ch) }));
  return splitJapaneseMorae(item?.reading || item?.dict || '').slice(0, 8).map(ch => ({
    ch,
    type: 'kana',
    links: [{ id: `jisho-kana-${ch}`, label: 'Jisho', url: `https://jisho.org/search/${encodeURIComponent(ch)}` }]
  }));
}

function writingDrillSteps(item, units = []) {
  const chars = units.map(u => u.ch).join(' + ');
  const reading = item?.reading || item?.dict || 'the word';
  return [
    `Trace ${chars || reading} twice while saying ${reading}.`,
    `Cover the model, write it once, then compare the balance and endings.`,
    `Write one conjugated form from the table so the okurigana stays attached.`
  ];
}

function pronunciationPracticeForms(item) {
  const ids = isAdjective(item) ? ['adj-plain-present', 'adj-plain-negative', 'adj-plain-past', 'adj-te-form', 'adj-polite-present'] : ['plain-present', 'plain-negative', 'plain-past', 'te-form', 'polite-present', 'potential'];
  const seen = new Set();
  return formRows(item).filter(r => ids.includes(r.type.id)).map(r => r.answer).filter(v => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  }).slice(0, 6);
}

const FAVORITES_LIST_ID = 'favorites';
const FAVORITES_LIST_NAME = 'Favorites';
const FOCUS_LIST_ID = 'focus-word';
const FOCUS_LIST_NAME = 'Focus word';

export function findFavoritesList(wordLists = []) {
  return wordLists.find(l => l.id === FAVORITES_LIST_ID) || wordLists.find(l => String(l.name || '').trim().toLowerCase() === FAVORITES_LIST_NAME.toLowerCase()) || null;
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
  const nextList = { ...(existing || {}), id, name: existing?.name || FAVORITES_LIST_NAME, wordKeys: [...keys] };
  const nextLists = existing ? wordLists.map(l => l.id === existing.id ? nextList : l) : [nextList, ...wordLists];
  return { wordLists: nextLists, listId: id, favorited, count: nextList.wordKeys.length };
}

export function focusWordInLists(wordLists = [], word) {
  if (!word) return { wordLists, listId: FOCUS_LIST_ID, count: 0 };
  const key = wordKeyLocal(word);
  const index = wordLists.findIndex(l => l.id === FOCUS_LIST_ID || String(l.name || '').trim().toLowerCase() === FOCUS_LIST_NAME.toLowerCase());
  const nextList = { ...(index >= 0 ? wordLists[index] : {}), id: FOCUS_LIST_ID, name: FOCUS_LIST_NAME, wordKeys: [key] };
  const nextLists = index >= 0 ? wordLists.map((l, i) => i === index ? nextList : l) : [nextList, ...wordLists];
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
    genkiLessons: []
  };
}

function referenceWordSnapshot(word) {
  return { dict: word.dict, reading: word.reading, meaning: word.meaning || '', group: word.group, lastAt: Date.now() };
}

export function referenceWithSearch(reference, query) {
  const q = String(query || '').trim();
  if (!q) return normalizeReferenceState(reference);
  const ref = normalizeReferenceState(reference);
  return { ...ref, recentSearches: [q, ...ref.recentSearches.filter(s => s !== q)].slice(0, 12) };
}

export function referenceWithHistory(reference, word) {
  if (!word) return normalizeReferenceState(reference);
  const ref = normalizeReferenceState(reference);
  const key = wordKeyLocal(word);
  const prior = ref.history.find(w => wordKeyLocal(w) === key);
  const fresh = { ...referenceWordSnapshot(word), count: (prior?.count || 0) + 1 };
  return { ...ref, history: [fresh, ...ref.history.filter(w => wordKeyLocal(w) !== key)].slice(0, 24) };
}

export default function ReferenceViewSub({
  state,
  setState,
  verbs,
  adjectives,
  wordLists = [],
  setWordLists,
  geminiKey,
  practicePrefs = DEFAULT_PREFS,
  setPracticePrefs,
  setTab
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [scratchIndex, setScratchIndex] = useState(0);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [copyTableOk, setCopyTableOk] = useState(false);
  const [lookupAiText, setLookupAiText] = useState('');
  const [lookupAiLoading, setLookupAiLoading] = useState(false);
  const [lookupAiErr, setLookupAiErr] = useState('');
  const [accentText, setAccentText] = useState('');
  const [accentLoading, setAccentLoading] = useState(false);
  const [accentErr, setAccentErr] = useState('');
  const [kanjiText, setKanjiText] = useState('');
  const [kanjiLoading, setKanjiLoading] = useState(false);
  const [kanjiErr, setKanjiErr] = useState('');
  const [writingText, setWritingText] = useState('');
  const [writingLoading, setWritingLoading] = useState(false);
  const [writingErr, setWritingErr] = useState('');
  const [scratchAiText, setScratchAiText] = useState('');
  const [scratchAiLoading, setScratchAiLoading] = useState(false);
  const [scratchAiErr, setScratchAiErr] = useState('');
  const [pairAiText, setPairAiText] = useState('');
  const [pairAiLoading, setPairAiLoading] = useState(false);
  const [pairAiErr, setPairAiErr] = useState('');
  const [favoriteMsg, setFavoriteMsg] = useState('');

  const words = useMemo(() => [...verbs, ...adjectives], [verbs, adjectives]);
  const reference = normalizeReferenceState(state.reference);
  const historyWords = reference.history.map(h => words.find(w => wordKeyLocal(w) === wordKeyLocal(h)) || h);
  const matches = useMemo(() => searchWords(query, words), [query, words]);
  const lookupMatches = useMemo(() => formLookupCandidates(query, words), [query, words]);
  const scratchCandidates = useMemo(() => adHocReferenceCandidates(query), [query]);
  const scratchCandidate = scratchCandidates[Math.min(scratchIndex, Math.max(0, scratchCandidates.length - 1))] || null;
  const scratchMatchesKnown = !!(scratchCandidate && words.some(w => w.group === scratchCandidate.group && (w.dict === scratchCandidate.dict || w.reading === scratchCandidate.reading)));
  const showScratch = !!(query.trim() && scratchCandidate && !scratchMatchesKnown);
  const scratchRows = showScratch ? formRows(scratchCandidate) : [];
  const transitivePair = selected ? transitivePairFor(selected, words) : null;
  const transitivePartnerView = transitivePair ? promptDisplay(transitivePair.partner, null, practicePrefs) : null;

  useEffect(() => {
    if (!selected || !words.some(w => w.dict === selected.dict)) {
      setSelected(matches[0] || words[0] || null);
    }
  }, [matches, words, selected]);

  useEffect(() => {
    setLookupAiText('');
    setLookupAiErr('');
  }, [query]);

  useEffect(() => {
    setScratchIndex(0);
    setScratchAiText('');
    setScratchAiErr('');
    setScratchAiLoading(false);
  }, [query]);

  const rows = selected ? referenceRows(selected, state) : [];
  const selectedView = selected ? promptDisplay(selected, null, practicePrefs) : null;
  const selectedMorae = selected ? splitJapaneseMorae(selected.reading) : [];
  const pronunciationForms = selected ? pronunciationPracticeForms(selected) : [];
  const selectedKanji = selected ? kanjiCharsFor(selected.dict) : [];
  const writingUnits = selected ? writingPracticeUnits(selected) : [];
  const writingDrill = selected ? writingDrillSteps(selected, writingUnits) : [];
  const dictionaryLinks = selected ? referenceDictionaryLinks(selected) : [];
  const masteredRows = rows.filter(r => r.progress.status === 'mastered').length;
  const dueRows = rows.filter(r => r.progress.status === 'due').length;
  const favoritesList = findFavoritesList(wordLists);
  const selectedFavorited = favoriteListHasWord(wordLists, selected);
  const favoriteCount = (favoritesList?.wordKeys || []).length;

  useEffect(() => {
    setCopyTableOk(false);
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setExpandedRow(null);
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setAccentText('');
    setAccentErr('');
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setKanjiText('');
    setKanjiErr('');
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setWritingText('');
    setWritingErr('');
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setPairAiText('');
    setPairAiErr('');
    setPairAiLoading(false);
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setFavoriteMsg('');
  }, [selected?.dict, selected?.group]);

  function updateReference(fn) {
    setState(prev => ({ ...prev, reference: fn(prev.reference) }));
  }

  function rememberSearch(q = query) {
    updateReference(ref => referenceWithSearch(ref, q));
  }

  function chooseReferenceWord(word, q = query) {
    setSelected(word);
    if (String(q || '').trim()) rememberSearch(q);
    updateReference(ref => referenceWithHistory(ref, word));
  }

  function clearReferenceMemory() {
    updateReference(() => normalizeReferenceState());
  }

  function isSelectedWord(word) {
    return !!(selected && word && selected.dict === word.dict && selected.group === word.group);
  }

  function toggleFavorite() {
    if (!selected || !setWordLists) return;
    const result = toggleFavoriteInLists(wordLists, selected);
    setWordLists(result.wordLists);
    setFavoriteMsg(result.favorited ? `Added to ${FAVORITES_LIST_NAME}.` : `Removed from ${FAVORITES_LIST_NAME}.`);
  }

  function useFavoritesForDrill() {
    if (!setPracticePrefs) return;
    let list = findFavoritesList(wordLists);
    let nextLists = wordLists;
    if (!list && selected && setWordLists) {
      const result = toggleFavoriteInLists(wordLists, selected);
      nextLists = result.wordLists;
      list = findFavoritesList(nextLists);
      setWordLists(nextLists);
    }
    if (!list) return;
    const selectedIds = practicePrefs.wordListIds || [];
    setPracticePrefs({ ...practicePrefs, wordListIds: selectedIds.includes(list.id) ? selectedIds : [...selectedIds, list.id] });
    setFavoriteMsg(`${list.name || FAVORITES_LIST_NAME} will be used in drills.`);
  }

  function drillSelectedWord() {
    if (!selected || !setWordLists || !setPracticePrefs) return;
    const result = focusWordInLists(wordLists, selected);
    setWordLists(result.wordLists);
    setPracticePrefs(focusPracticePrefsForWord(practicePrefs, selected));
    setFavoriteMsg(`Drilling only ${selected.dict}.`);
    if (setTab) setTab('study');
  }

  async function copyTable() {
    if (!selected || !rows.length) return;
    const header = ['Word', 'Reading', 'Meaning', 'Group', 'Form', 'Answer', 'Romaji', 'Rule'].join('\t');
    const body = rows.map(r => [selected.dict, selected.reading, selected.meaning, GROUP_NAMES[selected.group] || selected.group, r.type.label, r.answer, kanaToRomaji(r.answer), r.explanation.rule].join('\t'));
    const text = [header, ...body].join('\n');
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        copied = document.execCommand('copy');
        document.body.removeChild(area);
      }
      if (copied) {
        setCopyTableOk(true);
        setTimeout(() => setCopyTableOk(false), 1800);
      }
    } catch (e) {}
  }

  async function generateExamples() {
    if (!selected || !geminiKey) return;
    setAiLoading(true);
    setAiErr('');
    setAiText('');
    try {
      const prompt = `Create three short learner-friendly example sentences for ${selected.dict} (${selected.reading}, ${selected.meaning}, ${GROUP_NAMES[selected.group]}). Include one common mistake to avoid. Focus on conjugation.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 900, 0.4, aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM));
      setAiText(reply);
    } catch (e) {
      setAiErr(e.message);
    }
    setAiLoading(false);
  }

  async function explainLookup() {
    if (!query.trim() || !geminiKey || !lookupMatches.length) return;
    setLookupAiLoading(true);
    setLookupAiErr('');
    setLookupAiText('');
    try {
      const candidates = lookupMatches.slice(0, 6).map((m, i) => `${i + 1}. ${m.surface} / ${m.answer} = ${m.word.dict} (${m.word.reading}), ${m.type.label}, ${GROUP_NAMES[m.word.group]}, ${m.word.meaning}, ${m.matchKind}`).join('\n');
      const prompt = `A Japanese learner searched this conjugated form or sentence fragment: "${query}".\n\nLocal reverse-conjugation candidates:\n${candidates}\n\nRank the likely intended candidate, explain the conjugation rule briefly, mention any ambiguity, and give one tiny practice prompt.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 900, 0.25, aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM));
      setLookupAiText(reply);
    } catch (e) {
      setLookupAiErr(e.message || 'AI lookup failed.');
    }
    setLookupAiLoading(false);
  }

  async function generateAccentGuide() {
    if (!selected || !geminiKey) return;
    setAccentLoading(true);
    setAccentErr('');
    setAccentText('');
    try {
      const keyForms = pronunciationForms.map(f => `${f} (${kanaToRomaji(f)})`).join(', ');
      const prompt = `Create a compact pronunciation and Tokyo pitch-accent coaching note for this Japanese ${isAdjective(selected) ? 'adjective' : 'verb'}.\n\nWord: ${selected.dict}\nReading: ${selected.reading}\nMeaning: ${selected.meaning}\nClass: ${GROUP_NAMES[selected.group] || selected.group}\nUseful conjugated forms to mention: ${keyForms}\n\nIf the exact accent is uncertain, say so clearly instead of pretending certainty. Include: likely accent label/number if known, mora-by-mora pitch shape in plain text, how pitch may shift in common conjugated forms, one shadowing drill, and one learner mistake to listen for. Keep it short and practical.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 900, 0.2, aiSystemFromPrefs(practicePrefs, 'You are a careful Japanese pronunciation coach. Be honest about uncertainty in pitch-accent data and focus on practical listening and speaking guidance.'));
      setAccentText(reply);
    } catch (e) {
      setAccentErr(e.message || 'Accent guide failed.');
    }
    setAccentLoading(false);
  }

  async function generateKanjiInsight() {
    if (!selected || !geminiKey) return;
    setKanjiLoading(true);
    setKanjiErr('');
    setKanjiText('');
    try {
      const chars = selectedKanji.length ? selectedKanji.join('、') : 'no kanji';
      const prompt = `Create a compact dictionary and kanji insight for this Japanese conjugation reference entry.\n\nWord: ${selected.dict}\nReading: ${selected.reading}\nMeaning: ${selected.meaning}\nClass: ${GROUP_NAMES[selected.group] || selected.group}\nKanji characters in writing: ${chars}\n\nInclude: what each kanji contributes to the word meaning, any useful on'yomi/kun'yomi contrast for this exact word, how okurigana or kana ending connects to conjugation, one memory hook, and one warning about a dictionary ambiguity or alternate writing if relevant. If the word is usually kana-only, explain that instead. Be honest when a detail is uncertain.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 950, 0.25, aiSystemFromPrefs(practicePrefs, 'You are a careful Japanese dictionary and kanji coach. Keep explanations practical for conjugation learners. Do not invent kanji readings, stroke counts, or etymology when uncertain.'));
      setKanjiText(reply);
    } catch (e) {
      setKanjiErr(e.message || 'Kanji insight failed.');
    }
    setKanjiLoading(false);
  }

  async function generateWritingGuide() {
    if (!selected || !geminiKey) return;
    setWritingLoading(true);
    setWritingErr('');
    setWritingText('');
    try {
      const chars = writingUnits.map(u => `${u.ch} (${u.type})`).join(', ') || 'none';
      const prompt = `Create a compact handwriting practice note for this Japanese conjugation reference entry.\n\nWord: ${selected.dict}\nReading: ${selected.reading}\nMeaning: ${selected.meaning}\nClass: ${GROUP_NAMES[selected.group] || selected.group}\nWriting units shown in the app: ${chars}\n\nInclude: per-character stroke-order attention points, likely radical/component or shape cues when useful, how the kana/okurigana ending connects to conjugation, a 30-second writing drill using one conjugated form, and one caution about verifying exact stroke order in the linked reference. If exact stroke order or component history is uncertain, say so clearly. Keep it practical and short.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 950, 0.2, aiSystemFromPrefs(practicePrefs, 'You are a careful Japanese handwriting coach. Be honest about uncertainty, avoid invented etymology, and turn dictionary entries into practical writing drills.'));
      setWritingText(reply);
    } catch (e) {
      setWritingErr(e.message || 'Writing guide failed.');
    }
    setWritingLoading(false);
  }

  async function verifyScratchWithAI() {
    if (!showScratch || !geminiKey) return;
    setScratchAiLoading(true);
    setScratchAiErr('');
    setScratchAiText('');
    try {
      const prompt = `Identify this Japanese conjugation reference query and verify its real dictionary entry.\n\nQuery: ${query}\nLocal guess: ${scratchCandidate.dict} (${scratchCandidate.reading}), ${GROUP_NAMES[scratchCandidate.group] || scratchCandidate.group}\n\nReturn ONLY JSON with this exact shape:\n{"words":[{"dict":"dictionary form or adjective stem","reading":"hiragana only","meaning":"short English meaning","group":"ichidan|godan|suru|kuru|i-adjective|na-adjective","evidence":"why this group is right"}]}\n\nIf the query is an impossible or incomplete Japanese dictionary form, return {"words":[]}.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 700, 0.1, aiSystemFromPrefs(practicePrefs, 'You verify Japanese verb and adjective dictionary forms for conjugation practice. Return valid JSON only.'));
      
      // Look up helper parser
      const parsedData = typeof reply === 'string' ? extractJSON(reply) : reply;
      const rowsList = Array.isArray(parsedData?.words) ? parsedData.words : [];
      const result = rowsList.map(row => {
        const gp = row.group === 'i-adjective' || row.group === 'na-adjective' ? row.group : row.group;
        return {
          dict: String(row.dict || '').trim(),
          reading: toHiragana(String(row.reading || '').trim()),
          meaning: String(row.meaning || '').trim(),
          group: gp
        };
      })[0];
      
      if (!result) throw new Error('AI could not verify a dictionary-form verb or adjective.');
      const local = scratchCandidate.group;
      const verdict = result.group === local ? 'Matches the local guess.' : `Gemini suggests ${GROUP_NAMES[result.group] || result.group}, not ${GROUP_NAMES[local] || local}.`;
      setScratchAiText(`${result.dict} (${result.reading}) — ${result.meaning}\n${verdict}`);
    } catch (e) {
      setScratchAiErr(e.message || 'AI verification failed.');
    }
    setScratchAiLoading(false);
  }

  async function explainTransitivePair() {
    if (!transitivePair || !geminiKey) return;
    setPairAiLoading(true);
    setPairAiErr('');
    setPairAiText('');
    try {
      const selectedRole = transitivePair.role === 'transitive' ? '他動詞 / transitive' : '自動詞 / intransitive';
      const partnerRole = transitivePair.partnerRole === 'transitive' ? '他動詞 / transitive' : '自動詞 / intransitive';
      const prompt = `Contrast this Japanese transitive/intransitive verb pair for a conjugation learner.\n\nSelected: ${selected.dict} (${selected.reading}) — ${selected.meaning} [${selectedRole}]\nPair: ${transitivePair.partner.dict} (${transitivePair.partner.reading}) — ${transitivePair.partner.meaning} [${partnerRole}]\nScene: ${transitivePair.pair.scene}\n\nExplain the difference with を vs が/は frames, give one natural sentence for each verb, and warn about any form that looks like passive/causative but is actually a separate lexical pair. Keep it concise and practical.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 1000, 0.25, aiSystemFromPrefs(practicePrefs, 'You are a careful Japanese grammar coach. Explain transitive and intransitive verb pairs with particles, context, and learner traps. Do not overgeneralize suffix patterns.'));
      setPairAiText(reply);
    } catch (e) {
      setPairAiErr(e.message || 'AI pair contrast failed.');
    }
    setPairAiLoading(false);
  }

  function speakJapaneseLocal(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.9;
    if (practicePrefs.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === practicePrefs.voiceURI);
      if (voice) u.voice = voice;
    }
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 text-left">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 overflow-hidden flex flex-col">
        <div className="p-3 border-b border-stone-105 dark:border-stone-800">
          <div className="relative">
            <IconList className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && query.trim()) rememberSearch(query);
              }}
              placeholder="Search word or form"
              className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 rounded-lg focus:border-indigo-500 focus:outline-none transition"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
          {!query.trim() && (reference.recentSearches.length || historyWords.length) ? (
            <div className="mt-3 border-t border-stone-100 dark:border-stone-800 pt-3 space-y-3">
              {reference.recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-stone-500">
                    <span>Recent searches</span>
                    <button onClick={clearReferenceMemory} className="normal-case tracking-normal text-stone-400 hover:text-stone-700">
                      Clear
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 font-sans">
                    {reference.recentSearches.map(s => (
                      <button
                        key={s}
                        onClick={() => setQuery(s)}
                        className="px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs text-stone-600 dark:text-stone-300 truncate max-w-full"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {historyWords.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">Lookup history</div>
                  <div className="space-y-1.5">
                    {historyWords.slice(0, 6).map(w => {
                      const wv = promptDisplay(w, null, practicePrefs);
                      return (
                        <button
                          key={w.dict + ':' + w.reading}
                          onClick={() => chooseReferenceWord(w, '')}
                          className={`w-full text-left px-2 py-2 rounded-lg border transition ${
                            isSelectedWord(w) ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20' : 'border-stone-100 dark:border-stone-850 hover:border-stone-200 dark:hover:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <ScriptDisplay view={wv} className="text-sm font-medium truncate text-stone-900 dark:text-stone-100" subClassName="text-[11px] text-stone-450 truncate" />
                              <div className="text-xs text-stone-500 truncate">{w.meaning}</div>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex-shrink-0">
                              x{w.count || 1}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {query.trim() && (
            <div className="mt-3 border-t border-stone-105 dark:border-stone-800 pt-3">
              <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-stone-500">
                <span>Reverse lookup</span>
                <span>
                  {lookupMatches.length ? `${lookupMatches.length} hit${lookupMatches.length === 1 ? '' : 's'}` : 'no exact hit'}
                </span>
              </div>
              {lookupMatches.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {lookupMatches.slice(0, 5).map(m => {
                    const av = formDisplay(m.answer, practicePrefs, m.word, m.type.id);
                    const bv = promptDisplay(m.word, null, practicePrefs);
                    return (
                      <button
                        key={`${wordKeyLocal(m.word)}-${m.type.id}-${m.matchKind}`}
                        onClick={() => chooseReferenceWord(m.word)}
                        className={`w-full text-left px-2 py-2 rounded-lg border transition ${
                          isSelectedWord(m.word) ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20' : 'border-stone-100 dark:border-stone-850 hover:border-stone-200 dark:hover:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <ScriptDisplay view={av} className="text-sm font-medium text-stone-900 dark:text-stone-50" subClassName="text-[11px] text-stone-450" />
                            <div className="text-[11px] text-stone-500 mt-0.5">{m.type.label}</div>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${m.matchKind === 'exact' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {m.matchKind}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-stone-500 truncate">
                          <span className="font-semibold text-stone-850 dark:text-stone-205" lang={bv.lang}>
                            {bv.main}
                          </span>
                          {bv.sub && <span className="text-stone-400"> ({bv.sub})</span>} · {m.word.meaning}
                        </div>
                        <div className="mt-1 text-[11px] text-stone-400 leading-tight">{m.explanation.rule}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-xs text-stone-400">
                  No local form match yet. Try a dictionary form, romaji, or paste the sentence into Scanner.
                </div>
              )}
              <button
                onClick={explainLookup}
                disabled={!geminiKey || lookupAiLoading || !lookupMatches.length}
                className="mt-2 w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center justify-center gap-1.5 transition"
              >
                <IconSpark className="w-4 h-4" />
                {lookupAiLoading ? 'Ranking...' : 'AI disambiguate'}
              </button>
              {!geminiKey && (
                <div className="mt-1 text-[11px] text-stone-400 text-center">Add a Gemini key for contextual ranking.</div>
              )}
              {lookupAiErr && <div className="mt-2 text-xs text-rose-600">{lookupAiErr}</div>}
              {lookupAiText && <div className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-stone-300">{lookupAiText}</div>}
              {showScratch && (
                <div className="mt-3 rounded-xl border border-indigo-150 bg-indigo-50/60 dark:bg-indigo-950/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wider text-indigo-750 font-medium">Scratch conjugator</div>
                    <span className="text-[10px] rounded-full bg-white dark:bg-stone-800 px-2 py-0.5 text-indigo-700 dark:text-indigo-300">{GROUP_NAMES[scratchCandidate.group] || scratchCandidate.group}</span>
                  </div>
                  <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    Local table for <span className="font-semibold text-stone-800 dark:text-stone-200" lang="ja">{scratchCandidate.dict}</span>. {scratchCandidate.sourceNote}
                  </div>
                  {scratchCandidates.length > 1 && (
                    <div className="mt-2 flex gap-1.5">
                      {scratchCandidates.map((c, i) => (
                        <button
                          key={c.group}
                          onClick={() => setScratchIndex(i)}
                          className={`px-2 py-1 rounded-lg border text-[11px] transition ${
                            scratchCandidate.group === c.group
                              ? 'bg-stone-800 text-white border-stone-800 dark:bg-stone-200 dark:text-stone-900 dark:border-stone-200'
                              : 'bg-white border-indigo-100 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-400'
                          }`}
                        >
                          {GROUP_NAMES[c.group] || c.group}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto max-h-[560px] divide-y divide-stone-50 dark:divide-stone-850">
          {matches.map(w => {
            const wv = promptDisplay(w, null, practicePrefs);
            return (
              <button
                key={`${w.group}:${w.dict}`}
                onClick={() => chooseReferenceWord(w)}
                className={`w-full text-left px-4 py-3 transition ${
                  isSelectedWord(w) ? 'bg-indigo-50 dark:bg-indigo-950/20' : 'hover:bg-stone-50 dark:hover:bg-stone-800/40'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium text-stone-850 dark:text-stone-150">
                    <ScriptDisplay view={wv} className="" subClassName="text-xs text-stone-500" />
                  </div>
                  <span className="text-[11px] text-stone-400 inline-flex items-center gap-1 font-semibold">
                    {favoriteListHasWord(wordLists, w) && <IconStar className="w-3 h-3 text-amber-500" />}
                    {isAdjective(w) ? 'adj' : 'verb'}
                  </span>
                </div>
                <div className="text-xs text-stone-450 truncate">{w.meaning}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-4">
        {showScratch && (
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-indigo-200 dark:border-indigo-900 overflow-hidden">
            <div className="p-4 border-b border-indigo-100 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/20">
              <div className="flex items-start justify-between gap-3 text-left">
                <div>
                  <div className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-semibold">Scratch conjugator</div>
                  <div className="mt-1 text-3xl font-medium text-stone-900 dark:text-stone-50" lang="ja">
                    {scratchCandidate.dict}
                  </div>
                  <div className="text-sm text-stone-500 mt-1">
                    {GROUP_NAMES[scratchCandidate.group] || scratchCandidate.group} · {scratchCandidate.sourceNote}
                  </div>
                </div>
                <button
                  onClick={verifyScratchWithAI}
                  disabled={!geminiKey || scratchAiLoading}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center gap-1.5 transition"
                >
                  <IconSpark className="w-4 h-4" />
                  {scratchAiLoading ? 'Verifying...' : 'AI verify'}
                </button>
              </div>
              {!geminiKey && <div className="mt-2 text-xs text-stone-500">Add a Gemini key to verify the real dictionary form, reading, and group.</div>}
              {scratchAiErr && <div className="mt-2 text-sm text-rose-600">{scratchAiErr}</div>}
              {scratchAiText && <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-stone-705 dark:text-stone-300 font-sans">{scratchAiText}</div>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 dark:bg-stone-950 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Form</th>
                    <th className="px-4 py-2 text-left font-medium">Answer</th>
                    <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-850">
                  {scratchRows.map(r => {
                    const answer = surfaceFormForLocal(scratchCandidate, r.type.id) || r.answer;
                    const rv = formDisplay(answer, practicePrefs, scratchCandidate, r.type.id);
                    return (
                      <tr key={r.type.id} className="border-t border-stone-100 dark:border-stone-850">
                        <td className="px-4 py-2 text-left">
                          <div className="font-semibold text-stone-800 dark:text-stone-200">{r.type.label}</div>
                          <div className="text-xs text-stone-400">{r.type.hint}</div>
                        </td>
                        <td className="px-4 py-2 text-left">
                          <ScriptDisplay
                            view={rv}
                            word={scratchCandidate}
                            type={r.type.id}
                            colorHighlight={practicePrefs.colorCodeConjugations !== false}
                            className="text-lg text-stone-900 dark:text-stone-100"
                            subClassName="text-xs text-stone-450"
                          />
                        </td>
                        <td className="px-4 py-2 text-xs text-stone-500 hidden md:table-cell text-left">{r.explanation.rule}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-left">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-stone-105 dark:border-stone-800 pb-4">
            <div className="min-w-0">
              <ScriptDisplay view={selectedView} className="text-4xl font-semibold text-stone-950 dark:text-stone-50" subClassName="text-stone-500 mt-1" />
              <div className="text-sm text-stone-605 italic mt-2">{selected.meaning}</div>
              <div className="text-xs text-stone-400 mt-1">{GROUP_NAMES[selected.group]}</div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button
                onClick={drillSelectedWord}
                disabled={!selected || !setWordLists || !setPracticePrefs}
                className="px-3 py-2 bg-stone-850 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 disabled:opacity-40 text-white dark:text-stone-900 rounded-lg text-sm inline-flex items-center gap-1.5 transition"
              >
                <IconRefresh className="w-4 h-4" />
                Drill word
              </button>
              <button
                onClick={toggleFavorite}
                className={`px-3 py-2 border rounded-lg text-sm inline-flex items-center gap-1.5 transition ${
                  selectedFavorited
                    ? 'bg-amber-50 border-amber-250 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 text-stone-600 dark:text-stone-300'
                }`}
              >
                <IconStar className="w-4 h-4" />
                {selectedFavorited ? 'Favorited' : 'Favorite'}
              </button>
              <button
                onClick={useFavoritesForDrill}
                disabled={!favoriteCount && !selected}
                className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 disabled:opacity-40 rounded-lg text-stone-600 dark:text-stone-300 text-sm inline-flex items-center gap-1.5 transition"
              >
                <IconList className="w-4 h-4" />
                Drill favorites
              </button>
              <button
                onClick={copyTable}
                className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-stone-600 dark:text-stone-300 text-sm inline-flex items-center gap-1.5 transition"
              >
                <IconList className="w-4 h-4" />
                {copyTableOk ? 'Copied' : 'Copy table'}
              </button>
              <button
                onClick={() => speakJapaneseLocal(selected.reading)}
                className="p-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-stone-500"
                title="Speak"
              >
                <IconVolume className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-550">
            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${selectedFavorited ? 'bg-amber-50 text-amber-700' : 'bg-stone-50 text-stone-500'}`}>
              <IconStar className="w-3.5 h-3.5" />
              {favoriteCount} favorite{favoriteCount === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 bg-emerald-50 text-emerald-700">
              <IconCheck className="w-3.5 h-3.5" />
              {masteredRows}/{rows.length} forms mastered
            </span>
            {!!dueRows && (
              <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 bg-amber-50 text-amber-750">
                {dueRows} due
              </span>
            )}
            {favoriteMsg && <span className="text-emerald-650 dark:text-emerald-450">{favoriteMsg}</span>}
          </div>
        </div>

        {transitivePair && (
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-left">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-105 dark:border-stone-800">
              <div>
                <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold">Transitive pair</div>
                <h3 className="font-semibold text-lg mt-1 text-stone-950 dark:text-stone-50">自動詞 / 他動詞 contrast</h3>
                <p className="text-xs text-stone-500 mt-1">Same scene, different argument pattern: を for acting on something, が/は for what happens automatically.</p>
              </div>
              <button
                onClick={explainTransitivePair}
                disabled={!geminiKey || pairAiLoading}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center gap-1.5 transition"
              >
                <IconSpark className="w-4 h-4" />
                {pairAiLoading ? 'Contrasting...' : 'AI contrast'}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-955 p-3">
                <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">Current · {transitivePair.role === 'transitive' ? '他動詞' : '自動詞'}</div>
                <ScriptDisplay view={selectedView} className="text-2xl font-semibold mt-1 text-stone-900 dark:text-stone-100" subClassName="text-xs text-stone-500" />
                <div className="text-xs text-stone-600 mt-2">{selected.meaning}</div>
                <div className="text-[11px] text-stone-450 mt-1">
                  {transitivePair.role === 'transitive' ? 'Usually frames an object with を.' : 'Usually frames the thing/event with が or は.'}
                </div>
              </div>
              <div className="rounded-xl border border-indigo-150 bg-indigo-50/60 dark:bg-indigo-950/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-semibold">Pair · {transitivePair.partnerRole === 'transitive' ? '他動詞' : '自動詞'}</div>
                <ScriptDisplay view={transitivePartnerView} className="text-2xl font-semibold mt-1 text-stone-900 dark:text-stone-100" subClassName="text-xs text-stone-500" />
                <div className="text-xs text-stone-600 mt-2">{transitivePair.partner.meaning}</div>
                <div className="text-[11px] text-stone-450 mt-1">Scene: {transitivePair.pair.scene}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {transitivePair.partnerInDeck && (
                <button
                  onClick={() => chooseReferenceWord(transitivePair.partner)}
                  className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg text-sm text-stone-700 dark:text-stone-300 transition"
                >
                  Open pair
                </button>
              )}
              {!geminiKey && <span className="text-xs text-stone-400">Add a Gemini key for contextual pair coaching.</span>}
            </div>
            {pairAiErr && <div className="mt-2 text-sm text-rose-600">{pairAiErr}</div>}
            {pairAiText && (
              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 text-sm text-stone-750 dark:text-stone-305 leading-relaxed whitespace-pre-wrap font-sans">
                {pairAiText}
              </div>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 text-left">
          <div className="flex items-center justify-between gap-3 border-b border-stone-105 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-950 dark:text-stone-50">
              <IconBook className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Dictionary & kanji
            </div>
            <button
              onClick={generateKanjiInsight}
              disabled={!geminiKey || kanjiLoading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center gap-1.5 transition"
            >
              <IconSpark className="w-4 h-4" />
              {kanjiLoading ? 'Checking...' : 'AI kanji'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {dictionaryLinks.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 text-sm text-stone-600 dark:text-stone-300 transition animate-fade-in"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="mt-3">
            {selectedKanji.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedKanji.map(ch => (
                  <div key={ch} className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-955 px-3 py-2">
                    <div className="text-2xl font-bold text-stone-800 dark:text-stone-200" lang="ja">
                      {ch}
                    </div>
                    <div className="mt-1 flex gap-1.5">
                      {kanjiDictionaryLinks(ch).map(link => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-indigo-605 hover:text-indigo-805 dark:text-indigo-400"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-stone-400">
                No kanji in this dictionary form. Use the dictionary links for kana-only usage notes.
              </div>
            )}
          </div>
          {!geminiKey && (
            <div className="mt-2 text-xs text-stone-400">Add a Gemini key for kanji meaning and readings details.</div>
          )}
          {kanjiErr && <div className="mt-2 text-sm text-rose-600">{kanjiErr}</div>}
          {kanjiText && (
            <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-705 dark:text-stone-300 font-sans border-t border-stone-100 dark:border-stone-800 pt-3">
              {kanjiText}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 text-left">
          <div className="flex items-center justify-between gap-3 border-b border-stone-105 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-950 dark:text-stone-50">
              <IconPen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Handwriting & Stroke
            </div>
            <button
              onClick={generateWritingGuide}
              disabled={!geminiKey || writingLoading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center gap-1.5 transition"
            >
              <IconSpark className="w-4 h-4" />
              {writingLoading ? 'Guiding...' : 'AI writing'}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {writingUnits.map((unit, i) => (
              <div key={unit.ch + '-' + i} className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-955 p-2">
                <div className="relative aspect-square rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-stone-200 dark:border-stone-800" />
                  <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-stone-200 dark:border-stone-800" />
                  <div className="relative text-5xl sm:text-4xl font-semibold text-stone-805 dark:text-stone-205 leading-none" lang="ja">
                    {unit.ch}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">{unit.type}</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {unit.links.map(link => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-indigo-605 hover:text-indigo-805 dark:text-indigo-400"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid sm:grid-cols-3 gap-2">
            {writingDrill.map((step, i) => (
              <div key={step} className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-955 px-3 py-2 text-xs leading-relaxed text-stone-605 dark:text-stone-300">
                <span className="font-semibold text-stone-800 dark:text-stone-200">{i + 1}.</span> {step}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-stone-400">
            KanjiVG opens animated stroke data when available; Jisho is included as a second reference. For kana-only, use the grid as trace-and-cover.
          </div>
          {!geminiKey && <div className="mt-2 text-xs text-stone-400">Add a Gemini key in Settings.</div>}
          {writingErr && <div className="mt-2 text-sm text-rose-600">{writingErr}</div>}
          {writingText && (
            <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-705 dark:text-stone-300 border-t border-stone-100 dark:border-stone-800 pt-3 font-sans">
              {writingText}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 text-left">
          <div className="flex items-center justify-between gap-3 border-b border-stone-105 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-950 dark:text-stone-50">
              <IconVolume className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Pronunciation lab
            </div>
            <button
              onClick={generateAccentGuide}
              disabled={!geminiKey || accentLoading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center gap-1.5 transition"
            >
              <IconSpark className="w-4 h-4" />
              {accentLoading ? 'Listening...' : 'AI accent'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedMorae.map((m, i) => (
              <span key={m + '-' + i} className="min-w-8 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-955 text-center text-lg text-stone-850 dark:text-stone-150" lang="ja">
                {m}
              </span>
            ))}
          </div>
          <div className="mt-3 grid sm:grid-cols-3 gap-2">
            <button
              onClick={() => speakJapaneseLocal(selected.reading)}
              className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm inline-flex items-center justify-center gap-1.5 text-stone-700 dark:text-stone-300 font-medium transition"
            >
              <IconVolume className="w-4 h-4" />
              Word
            </button>
            <button
              onClick={() => {
                if (typeof window === 'undefined' || !window.speechSynthesis) return;
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(selected.reading);
                u.lang = 'ja-JP';
                u.rate = 0.62;
                window.speechSynthesis.speak(u);
              }}
              className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm inline-flex items-center justify-center gap-1.5 text-stone-700 dark:text-stone-300 font-medium transition"
            >
              <IconVolume className="w-4 h-4" />
              Slow
            </button>
            <button
              onClick={() => speakJapaneseLocal(pronunciationForms.join('、'))}
              className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm inline-flex items-center justify-center gap-1.5 text-stone-700 dark:text-stone-300 font-medium transition"
            >
              <IconVolume className="w-4 h-4" />
              Forms
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pronunciationForms.map(f => (
              <button
                key={f}
                onClick={() => speakJapaneseLocal(f)}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-850 text-sm text-stone-800 dark:text-stone-200 transition"
                lang="ja"
              >
                {f}
              </button>
            ))}
          </div>
          {!geminiKey && (
            <div className="mt-2 text-xs text-stone-400">Add a Gemini key in Settings for Tokyo accent coaching.</div>
          )}
          {accentErr && <div className="mt-2 text-sm text-rose-600">{accentErr}</div>}
          {accentText && (
            <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-705 dark:text-stone-300 border-t border-stone-100 dark:border-stone-800 pt-3 font-sans">
              {accentText}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 dark:bg-stone-950 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Form</th>
                <th className="px-4 py-2 text-left font-medium">Answer</th>
                <th className="px-4 py-2 text-left font-medium">Progress</th>
                <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-850">
              {rows.map(r => {
                const rv = formDisplay(r.answer, practicePrefs, selected, r.type.id);
                const expanded = expandedRow === r.type.id;
                return (
                  <React.Fragment key={r.type.id}>
                    <tr
                      onClick={() => setExpandedRow(expanded ? null : r.type.id)}
                      className={`border-t border-stone-100 dark:border-stone-850 cursor-pointer transition ${expanded ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/40'}`}
                    >
                      <td className="px-4 py-2 text-left">
                        <div className="font-semibold text-stone-850 dark:text-stone-200">{r.type.label}</div>
                        <div className="text-xs text-stone-400">{r.type.hint}</div>
                      </td>
                      <td className="px-4 py-2 text-left">
                        <div className="flex items-center gap-2">
                          <ScriptDisplay
                            view={rv}
                            word={selected}
                            type={r.type.id}
                            colorHighlight={practicePrefs.colorCodeConjugations !== false}
                            className="text-lg text-stone-900 dark:text-stone-100"
                            subClassName="text-xs text-stone-450"
                          />
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              speakJapaneseLocal(r.answer);
                            }}
                            className="p-1.5 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg text-stone-500 flex-shrink-0"
                            title={`Speak ${r.type.label}`}
                          >
                            <IconVolume className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-left">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold ${r.progress.tone}`}>
                          {r.progress.status === 'mastered' ? (
                            <IconCheck className="w-3.5 h-3.5" />
                          ) : (
                            <span className={`w-2 h-2 rounded-full ${r.progress.levelInfo.dot}`} />
                          )}
                          <span>{r.progress.label}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-stone-400 hidden sm:block">{r.progress.detail}</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-stone-550 hidden md:table-cell text-left">{r.explanation.rule}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-stone-50/50 dark:bg-stone-950/20">
                        <td colSpan="4" className="px-5 py-4 border-t border-stone-100 dark:border-stone-800 space-y-2.5">
                          <PitchAccentSection word={selected} kanaText={r.answer} geminiKey={geminiKey} practicePrefs={practicePrefs} />
                          <ConjugationBreakdown word={selected} type={r.type.id} geminiKey={geminiKey} practicePrefs={practicePrefs} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 text-left">
          <div className="flex items-center justify-between gap-3 border-b border-stone-105 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-950 dark:text-stone-50">
              <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              AI examples
            </div>
            <button
              onClick={generateExamples}
              disabled={!geminiKey || aiLoading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm transition"
            >
              {aiLoading ? 'Thinking...' : 'Generate'}
            </button>
          </div>
          {!geminiKey && <div className="mt-2 text-xs text-stone-400">Add a Gemini API key in Settings.</div>}
          {aiErr && <div className="mt-2 text-sm text-rose-600">{aiErr}</div>}
          {aiText && (
            <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-705 dark:text-stone-300 font-sans border-t border-stone-105 dark:border-stone-800 pt-3">
              {aiText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
