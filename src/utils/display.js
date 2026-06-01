import { DEFAULT_PREFS } from '../data/defaults.js';
import { toHiragana, kanaToRomaji } from './romaji.js';
import { conjugateItem, surfaceFormFor, isAdjective, wordKey } from './conjugator.js';
import { CONJ_TYPES, ADJ_TYPES } from '../data/conjugationTypes.js';

export function resolveDisplayScripts(prefs = DEFAULT_PREFS) {
  const ds = prefs.displayScripts;
  if (ds && (ds.kanji || ds.kana || ds.romaji)) {
    return { kanji: !!ds.kanji, kana: !!ds.kana, romaji: !!ds.romaji };
  }
  if (prefs.scriptMode === 'hiragana') return { kanji: false, kana: true, romaji: false };
  if (prefs.scriptMode === 'romaji') return { kanji: false, kana: false, romaji: true };
  if (prefs.scriptMode === 'all') return { kanji: true, kana: true, romaji: true };
  return { kanji: true, kana: true, romaji: false };
}

export function scriptModeFromDisplay(ds) {
  if (ds.kanji && ds.kana && ds.romaji) return 'all';
  if (!ds.kanji && ds.kana && !ds.romaji) return 'hiragana';
  if (!ds.kanji && !ds.kana && ds.romaji) return 'romaji';
  return 'kanji';
}

export function normalizeAnswerMode(value) {
  return ['input', 'choice', 'self-check', 'speak'].includes(value)
    ? value
    : DEFAULT_PREFS.answerMode;
}

export function resolveKanaAssist(prefs = DEFAULT_PREFS) {
  if (['off', 'live', 'guided'].includes(prefs?.kanaAssist)) return prefs.kanaAssist;
  if (prefs?.answerMode === 'guided') return 'guided';
  if (prefs?.kanaMatchDisplay === 'none') return 'off';
  if (['color', 'color-count'].includes(prefs?.kanaMatchDisplay)) return 'live';
  return DEFAULT_PREFS.kanaAssist;
}

export function kanaMatchDisplayForPrefs(prefs = DEFAULT_PREFS) {
  return resolveKanaAssist(prefs) === 'off' ? 'none' : 'color-count';
}

export function mergePracticePrefs(prefs) {
  const source = { ...(prefs || {}) };
  const answerMode = normalizeAnswerMode(source.answerMode);
  const kanaAssist = resolveKanaAssist(source);
  delete source.kanaMatchDisplay;
  delete source.durationSec;
  delete source.skipDuplicateForms;
  delete source.trickQuestions;
  delete source.colorCodeConjugations;
  delete source.aiGuideTone;
  const reviewLimitSource = source.reviewLimitSource === 'repair' ? source.reviewLimitSource : '';
  const rawReviewLimit = Number(source.reviewLimit || 0);
  const reviewLimit =
    reviewLimitSource && Number.isFinite(rawReviewLimit) && rawReviewLimit > 0 ? rawReviewLimit : 0;
  const displayScripts = source.displayScripts
    ? { ...DEFAULT_PREFS.displayScripts, ...source.displayScripts }
    : resolveDisplayScripts(source);
  let wordGroups = Array.isArray(source.wordGroups)
    ? [...source.wordGroups]
    : DEFAULT_PREFS.wordGroups;
  const oldAllGroups = ['ichidan', 'godan', 'suru', 'kuru', 'i-adjective', 'na-adjective'];
  if (
    Array.isArray(source.wordGroups) &&
    oldAllGroups.every((id) => source.wordGroups.includes(id)) &&
    !wordGroups.includes('irregular-adjective')
  ) {
    wordGroups = [...wordGroups, 'irregular-adjective'];
  }
  return {
    ...DEFAULT_PREFS,
    ...source,
    answerMode,
    kanaAssist,
    displayScripts,
    wordGroups,
    reviewLimit,
    reviewLimitSource,
  };
}

export function formDisplay(kana, prefs = DEFAULT_PREFS, word = null, typeId = null) {
  const ds = resolveDisplayScripts(prefs);
  let jpn = kana;
  if (ds.kanji && word && typeId) {
    jpn = surfaceFormFor(word, typeId) || kana;
  }
  const rom = kanaToRomaji(kana);
  const main = ds.kana || !ds.romaji ? jpn : rom;
  const sub = ds.romaji && main !== rom ? rom : '';
  const ruby = !!prefs.furigana && ds.kanji && ds.kana && word && main !== kana ? kana : '';
  return { main, sub, ruby, lang: main === rom ? 'en' : 'ja' };
}

export function promptDisplay(item, promptType, prefs = DEFAULT_PREFS) {
  const ds = resolveDisplayScripts(prefs);
  const kana = promptType ? conjugateItem(item, promptType) : item.reading;
  const kanji = promptType ? null : item.dict;
  const rom = kanaToRomaji(kana);
  const main = ds.kanji && kanji ? kanji : ds.kana || !ds.romaji ? kana : rom;
  const ruby =
    !!prefs.furigana && ds.kanji && ds.kana && kanji && main === kanji && kanji !== kana
      ? kana
      : '';
  const sub = [];
  if (ds.kanji && kanji && main !== kanji) sub.push(kanji);
  if (ds.kana && main !== kana && !ruby) sub.push(kana);
  if (ds.romaji && main !== rom) sub.push(rom);
  return { main, sub: sub.join(' · '), ruby, lang: main === rom ? 'en' : 'ja' };
}

export function normalizeJapaneseText(s) {
  return (s || '')
    .normalize('NFKC')
    .replace(/[、。！？\s'"「」『』（）()]/g, '')
    .toLowerCase();
}

export function cleanEnglishAction(meaning = '') {
  return (
    String(meaning || '')
      .trim()
      .replace(/^to\s+/i, '') || 'do it'
  );
}

export function pastParticiple(action) {
  const map = {
    eat: 'eaten',
    see: 'seen',
    watch: 'watched',
    sleep: 'slept',
    'wake up': 'woken up',
    leave: 'left',
    exit: 'exited',
    teach: 'taught',
    remember: 'remembered',
    wear: 'worn',
    open: 'opened',
    close: 'closed',
    go: 'gone',
    write: 'written',
    speak: 'spoken',
    wait: 'waited',
    die: 'died',
    play: 'played',
    drink: 'drunk',
    take: 'taken',
    buy: 'bought',
    swim: 'swum',
    read: 'read',
    stand: 'stood',
    run: 'run',
    'return home': 'returned home',
    listen: 'listened',
    ask: 'asked',
    hold: 'held',
    use: 'used',
    make: 'made',
    do: 'done',
    come: 'come',
    walk: 'walked',
    enter: 'entered',
    'take out': 'taken out',
    submit: 'submitted',
    sit: 'sat',
    stop: 'stopped',
    ride: 'ridden',
    'get off': 'gotten off',
    meet: 'met',
    send: 'sent',
    escort: 'escorted',
    hurry: 'hurried',
    wash: 'washed',
    borrow: 'borrowed',
    lend: 'lent',
    'return something': 'returned something',
    forget: 'forgotten',
    begin: 'begun',
    end: 'ended',
    study: 'studied',
    practice: 'practiced',
    cook: 'cooked',
    choose: 'chosen',
    fix: 'fixed',
    heal: 'healed',
    'make a mistake': 'made a mistake',
    investigate: 'investigated',
    'look up': 'looked up',
    explain: 'explained',
    reserve: 'reserved',
    drive: 'driven',
    'break something': 'broken something',
    break: 'broken',
  };
  return (
    map[action] ||
    (/e$/.test(action)
      ? action + 'd'
      : /[bcdfghjklmnpqrstvwxyz]y$/.test(action)
        ? action.slice(0, -1) + 'ied'
        : action + 'ed')
  );
}

export function gerund(action) {
  const map = {
    die: 'dying',
    lie: 'lying',
    tie: 'tying',
    use: 'using',
    make: 'making',
    come: 'coming',
    write: 'writing',
    take: 'taking',
    ride: 'riding',
    drive: 'driving',
  };
  return (
    map[action] ||
    (/ie$/.test(action)
      ? action.slice(0, -2) + 'ying'
      : /e$/.test(action) && !/ee$/.test(action)
        ? action.slice(0, -1) + 'ing'
        : action + 'ing')
  );
}

export function thirdPerson(action) {
  const map = { do: 'does', go: 'goes' };
  return (
    map[action] ||
    (/(s|sh|ch|x|z|o)$/.test(action)
      ? action + 'es'
      : /[bcdfghjklmnpqrstvwxyz]y$/.test(action)
        ? action.slice(0, -1) + 'ies'
        : action + 's')
  );
}

export function actionParts(meaning = '') {
  return cleanEnglishAction(meaning)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mapActionMeaning(meaning, fn) {
  return actionParts(meaning).map(fn).join(' / ');
}

export function answerPhaseTaskDetails({
  reverseDrill = false,
  noChangePrompt = false,
  taskHint = '',
  taskSub = '',
} = {}) {
  return {
    sub: reverseDrill ? taskSub : '',
    supportText: noChangePrompt ? 'same form; answer may not change' : taskHint,
  };
}

export function englishForForm(item, type) {
  if (!item) return '';
  if (
    !type ||
    type === 'plain-present' ||
    type === 'adj-plain-present' ||
    type === 'adj-attributive'
  ) {
    return item.meaning;
  }
  if (isAdjective(item)) {
    const base = item.meaning || '';
    const M = {
      'adj-plain-past': `was ${base}`,
      'adj-plain-negative': `is not ${base}`,
      'adj-plain-past-negative': `was not ${base}`,
      'adj-polite-present': `is ${base} (polite)`,
      'adj-polite-past': `was ${base} (polite)`,
      'adj-polite-negative': `is not ${base} (polite)`,
      'adj-polite-past-negative': `was not ${base} (polite)`,
      'adj-te-form': `${base}, and... / because it is ${base}`,
      'adj-negative-te-form': `not ${base}, and... / because it is not ${base}`,
      'adj-adverb': `in a ${base} way`,
      'adj-conditional': `if it is ${base}`,
      'adj-negative-conditional': `if it is not ${base}`,
      'adj-tara': `if/when it was ${base}`,
      'adj-negative-tara': `if/when it was not ${base}`,
      'adj-sou': `looks ${base}`,
      'adj-sugiru': `too ${base}`,
      'adj-naru': `becomes ${base}`,
    };
    return M[type] || base;
  }
  const action = cleanEnglishAction(item.meaning);
  const M = {
    'plain-past': `did ${action}`,
    'plain-negative': `do not ${action}`,
    'plain-past-negative': `did not ${action}`,
    'polite-present': `${action} (polite)`,
    'polite-past': `did ${action} (polite)`,
    'polite-negative': `do not ${action} (polite)`,
    'polite-past-negative': `did not ${action} (polite)`,
    'masu-stem': `${action} stem`,
    'polite-volitional': `let's ${action} (polite)`,
    'polite-te': `${action} and... (polite)`,
    'polite-conditional-tara': `if/when someone did ${action} (polite)`,
    honorific: `${action} (honorific, someone else's action)`,
    'honorific-polite': `${action} (honorific polite, someone else's action)`,
    humble: `${action} (humble, my/our action)`,
    'humble-polite': `${action} (humble polite, my/our action)`,
    'te-form': `${action} and... / ${action} for a helper pattern`,
    potential: `can ${action}`,
    'potential-polite': `can ${action} (polite)`,
    'potential-negative': `cannot ${action}`,
    'potential-polite-negative': `cannot ${action} (polite)`,
    'potential-polite-past': `could ${action} (polite)`,
    'potential-polite-past-negative': `could not ${action} (polite)`,
    'potential-past': `could ${action} / was able to ${action}`,
    'potential-past-negative': `could not ${action} / was not able to ${action}`,
    'potential-conditional-ba': mapActionMeaning(item.meaning, (a) => `if someone can ${a}`),
    volitional: `let's ${action}`,
    'conditional-tara': `if/when someone did ${action}`,
    'negative-conditional-tara': `if/when someone did not ${action}`,
    'conditional-ba': mapActionMeaning(item.meaning, (a) => `if someone ${thirdPerson(a)}`),
    'negative-conditional-ba': mapActionMeaning(item.meaning, (a) => `if someone does not ${a}`),
    'potential-negative-conditional-ba': mapActionMeaning(
      item.meaning,
      (a) => `if someone cannot ${a}`,
    ),
    'conditional-nara': mapActionMeaning(
      item.meaning,
      (a) => `if it is that someone ${thirdPerson(a)}`,
    ),
    conjectural: mapActionMeaning(item.meaning, (a) => `probably ${thirdPerson(a)}`),
    imperative: `${action}!`,
    'command-nasai': `${action}! (firm なさい instruction)`,
    passive: mapActionMeaning(item.meaning, (a) => `be ${pastParticiple(a)}`),
    'passive-polite': mapActionMeaning(item.meaning, (a) => `be ${pastParticiple(a)} (polite)`),
    'passive-negative': mapActionMeaning(item.meaning, (a) => `not be ${pastParticiple(a)}`),
    'passive-polite-negative': mapActionMeaning(
      item.meaning,
      (a) => `not be ${pastParticiple(a)} (polite)`,
    ),
    'passive-polite-past': mapActionMeaning(
      item.meaning,
      (a) => `was ${pastParticiple(a)} (polite)`,
    ),
    'passive-polite-past-negative': mapActionMeaning(
      item.meaning,
      (a) => `was not ${pastParticiple(a)} (polite)`,
    ),
    'passive-past': mapActionMeaning(item.meaning, (a) => `was ${pastParticiple(a)}`),
    'passive-past-negative': mapActionMeaning(item.meaning, (a) => `was not ${pastParticiple(a)}`),
    'passive-conditional-ba': mapActionMeaning(item.meaning, (a) => `if be ${pastParticiple(a)}`),
    'passive-negative-conditional-ba': mapActionMeaning(
      item.meaning,
      (a) => `if not be ${pastParticiple(a)}`,
    ),
    causative: `make/let someone ${action}`,
    'causative-polite': `make/let someone ${action} (polite)`,
    'causative-negative': `not make/let someone ${action}`,
    'causative-polite-negative': `not make/let someone ${action} (polite)`,
    'causative-polite-past': `made/let someone ${action} (polite)`,
    'causative-polite-past-negative': `did not make/let someone ${action} (polite)`,
    'causative-past': `made/let someone ${action}`,
    'causative-past-negative': `did not make/let someone ${action}`,
    'causative-conditional-ba': `if someone makes/lets someone ${action}`,
    'causative-negative-conditional-ba': `if someone does not make/let someone ${action}`,
    'short-causative': `make/let someone ${action} (short spoken form)`,
    'short-causative-polite': `make/let someone ${action} (short spoken polite form)`,
    'short-causative-negative': `not make/let someone ${action} (short spoken form)`,
    'short-causative-polite-negative': `not make/let someone ${action} (short spoken polite form)`,
    'short-causative-past': `made/let someone ${action} (short spoken form)`,
    'short-causative-polite-past': `made/let someone ${action} (short spoken polite form)`,
    'short-causative-past-negative': `did not make/let someone ${action} (short spoken form)`,
    'short-causative-polite-past-negative': `did not make/let someone ${action} (short spoken polite form)`,
    'short-causative-conditional-ba': `if someone makes/lets someone ${action} (short spoken form)`,
    'short-causative-negative-conditional-ba': `if someone does not make/let someone ${action} (short spoken form)`,
    'causative-passive': `be made to ${action}`,
    'causative-passive-polite': `be made to ${action} (polite)`,
    'causative-passive-polite-past': `was made to ${action} (polite)`,
    'causative-passive-past': `was made to ${action}`,
    'causative-passive-negative': `not be made to ${action}`,
    'causative-passive-polite-negative': `not be made to ${action} (polite)`,
    'causative-passive-polite-past-negative': `was not made to ${action} (polite)`,
    'causative-passive-past-negative': `was not made to ${action}`,
    'causative-passive-conditional-ba': `if be made to ${action}`,
    'causative-passive-negative-conditional-ba': `if not be made to ${action}`,
    'short-causative-passive': `be made to ${action} (short spoken form)`,
    'short-causative-passive-polite': `be made to ${action} (short spoken polite form)`,
    'short-causative-passive-polite-past': `was made to ${action} (short spoken polite form)`,
    'short-causative-passive-past': `was made to ${action} (short spoken form)`,
    'short-causative-passive-negative': `not be made to ${action} (short spoken form)`,
    'short-causative-passive-polite-negative': `not be made to ${action} (short spoken polite form)`,
    'short-causative-passive-polite-past-negative': `was not made to ${action} (short spoken polite form)`,
    'short-causative-passive-past-negative': `was not made to ${action} (short spoken form)`,
    'short-causative-passive-conditional-ba': `if be made to ${action} (short spoken form)`,
    'short-causative-passive-negative-conditional-ba': `if not be made to ${action} (short spoken form)`,
    desiderative: `want to ${action}`,
    'desiderative-polite': `want to ${action} (polite)`,
    'desiderative-negative': `do not want to ${action}`,
    'desiderative-polite-negative': `do not want to ${action} (polite)`,
    'desiderative-past': `wanted to ${action}`,
    'desiderative-polite-past': `wanted to ${action} (polite)`,
    'desiderative-past-negative': `did not want to ${action}`,
    'desiderative-polite-past-negative': `did not want to ${action} (polite)`,
    progressive: mapActionMeaning(item.meaning, (a) => `be ${gerund(a)}`),
    'progressive-polite': mapActionMeaning(item.meaning, (a) => `be ${gerund(a)} (polite)`),
    'progressive-negative': mapActionMeaning(
      item.meaning,
      (a) => `not be ${gerund(a)} / have not been ${gerund(a)}`,
    ),
    'progressive-polite-negative': mapActionMeaning(
      item.meaning,
      (a) => `not be ${gerund(a)} / have not been ${gerund(a)} (polite)`,
    ),
    'progressive-past': mapActionMeaning(
      item.meaning,
      (a) => `was ${gerund(a)} / had been ${gerund(a)}`,
    ),
    'progressive-polite-past': mapActionMeaning(
      item.meaning,
      (a) => `was ${gerund(a)} / had been ${gerund(a)} (polite)`,
    ),
    'progressive-past-negative': mapActionMeaning(
      item.meaning,
      (a) => `was not ${gerund(a)} / had not been ${gerund(a)}`,
    ),
    'progressive-polite-past-negative': mapActionMeaning(
      item.meaning,
      (a) => `was not ${gerund(a)} / had not been ${gerund(a)} (polite)`,
    ),
    'negative-te': mapActionMeaning(item.meaning, (a) => `without ${gerund(a)}`),
    'negative-te-connective': mapActionMeaning(
      item.meaning,
      (a) => `not ${gerund(a)}, and... / because someone does not ${a}`,
    ),
    'negative-zu': mapActionMeaning(item.meaning, (a) => `not ${gerund(a)} (formal ず)`),
    'negative-zuni': mapActionMeaning(item.meaning, (a) => `without ${gerund(a)} (formal ずに)`),
    prohibition: `do not ${action}!`,
    'request-kudasai': `please ${action}`,
    'negative-request': `please do not ${action}`,
    permission: `may ${action}`,
    obligation: `must ${action}`,
  };
  return M[type] || item.meaning;
}

export function editDistance(a, b) {
  a = normalizeJapaneseText(a);
  b = normalizeJapaneseText(b);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export function hasAdjacentTransposition(a, b) {
  a = Array.from(normalizeJapaneseText(a));
  b = Array.from(normalizeJapaneseText(b));
  if (a.length !== b.length) return false;
  const diffs = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs.push(i);
  }
  return (
    diffs.length === 2 &&
    diffs[1] === diffs[0] + 1 &&
    a[diffs[0]] === b[diffs[1]] &&
    a[diffs[1]] === b[diffs[0]]
  );
}

export function typoGuardForAnswer(raw, normalized, expected, item, reverseDrill) {
  const submitted = reverseDrill ? toHiragana(raw) : normalized;
  const target = reverseDrill ? item.reading : expected;
  if (!submitted || !target || submitted === target) return null;
  const maxLen = Math.max(
    Array.from(normalizeJapaneseText(submitted)).length,
    Array.from(normalizeJapaneseText(target)).length,
  );
  if (maxLen < 3) return null;
  const distance = editDistance(submitted, target);
  let detail = '';
  if (distance === 1) {
    detail = reverseDrill
      ? 'The dictionary form is very close. Check one character, then press Enter again.'
      : 'One kana is off. Check the highlighted cells, then press Enter again.';
  } else if (hasAdjacentTransposition(submitted, target)) {
    detail = reverseDrill
      ? 'Two adjacent characters look swapped. Fix them, then press Enter again.'
      : 'Two adjacent kana look swapped. Fix them, then press Enter again.';
  } else {
    return null;
  }
  return { key: `${target}|${submitted}`, submitted, target, detail };
}

export function speechSimilarity(target, heard) {
  const a = normalizeJapaneseText(target);
  const b = normalizeJapaneseText(heard);
  if (!a || !b) return null;
  return Math.max(0, Math.round((1 - editDistance(a, b) / Math.max(a.length, b.length)) * 100));
}

export function spokenAnswerResult(targets, heard) {
  const list = Array.isArray(targets) ? targets : [targets];
  const normalizedHeard = normalizeJapaneseText(heard);
  const candidates = [];
  for (const target of list) {
    const normalized = normalizeJapaneseText(target);
    if (!normalized || candidates.some((candidate) => candidate.normalized === normalized))
      continue;
    candidates.push({ raw: target, normalized });
  }
  if (!normalizedHeard || !candidates.length) {
    return { ok: false, score: null, matched: '', heard: normalizedHeard };
  }
  let best = { raw: '', score: 0 };
  for (const candidate of candidates) {
    if (candidate.normalized === normalizedHeard) {
      return { ok: true, score: 100, matched: candidate.raw, heard: normalizedHeard };
    }
    const score = speechSimilarity(candidate.normalized, normalizedHeard) || 0;
    if (score > best.score) best = { raw: candidate.raw, score };
  }
  return { ok: false, score: best.score, matched: best.raw, heard: normalizedHeard };
}

export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function stableChoiceKey(value) {
  if (value && typeof value === 'object') {
    if ('dict' in value || 'group' in value) return wordKey(value);
    if ('id' in value) return String(value.id);
  }
  return String(value);
}

function stableShuffled(arr, seed) {
  return [...arr]
    .map((value, index) => ({
      value,
      index,
      rank: hashString(`${seed}|${index}|${stableChoiceKey(value)}`),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ value }) => value);
}

function choiceSeed(current, mode) {
  return `${mode}|${current.id}|${current.type}|${wordKey(current.verb)}`;
}

export function drillDirectionFor(current, prefs = DEFAULT_PREFS) {
  const mode = prefs.drillDirection || 'forward';
  if (mode === 'reverse') return 'reverse';
  if (mode === 'mixed')
    return hashString(`${current?.id || ''}|${current?.verb?.dict || ''}|reverse`) % 2 === 0
      ? 'reverse'
      : 'forward';
  return 'forward';
}

export function makeChoices(current, verbs) {
  const expected = conjugateItem(current.verb, current.type);
  const types = isAdjective(current.verb) ? ADJ_TYPES : CONJ_TYPES;
  const seed = choiceSeed(current, 'forward');
  const set = new Set([expected]);
  for (const t of stableShuffled(types, `${seed}|types`)) {
    const v = conjugateItem(current.verb, t.id);
    if (v && v !== expected) set.add(v);
    if (set.size >= 4) break;
  }
  for (const v of stableShuffled(
    verbs.filter((v) => v.group === current.verb.group),
    `${seed}|words`,
  )) {
    const x = conjugateItem(v, current.type);
    if (x && x !== expected) set.add(x);
    if (set.size >= 4) break;
  }
  return stableShuffled([...set].slice(0, 4), `${seed}|answers`);
}

export function dictionaryAnswerMatches(raw, item) {
  const value = String(raw || '').trim();
  if (!value || !item) return false;
  const compact = value.toLowerCase().replace(/\s+/g, '');
  return (
    toHiragana(value) === item.reading ||
    normalizeJapaneseText(value) === normalizeJapaneseText(item.dict) ||
    compact === kanaToRomaji(item.reading).toLowerCase()
  );
}

export function makeReverseChoices(current, words) {
  const seed = choiceSeed(current, 'reverse');
  const key = wordKey(current.verb);
  const seen = new Set([key]);
  const choices = [current.verb];
  for (const w of stableShuffled(
    words.filter(
      (w) => w.group === current.verb.group || isAdjective(w) === isAdjective(current.verb),
    ),
    `${seed}|words`,
  )) {
    const k = wordKey(w);
    if (seen.has(k)) continue;
    seen.add(k);
    choices.push(w);
    if (choices.length >= 4) break;
  }
  return stableShuffled(choices, `${seed}|answers`);
}
