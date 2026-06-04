#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isLexiconArtifactWord, normalizeLexiconWord } from '../src/utils/lexiconArtifacts.js';

const JLPT_GENKI_URL = 'https://raw.githubusercontent.com/elzup/jlpt-word-list/master/out/all.csv';
const MINNA_URL = 'https://www.astr.tohoku.ac.jp/~akhlaghi/blog/JapaneseVocab/MNNvocab.csv';
const JMDICT_RELEASE_URL =
  'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';
const OUT_PATH = join('public', 'data', 'verb-lexicon.json');

const LEVEL_RANK = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
const SURU_SUFFIX = '\u3059\u308b';
const PRACTICE_GROUPS = new Set([
  'ichidan',
  'godan',
  'suru',
  'kuru',
  'i-adjective',
  'na-adjective',
]);
const cleanedArtifacts = { removed: 0, repaired: 0 };
const VERB_ENDINGS = new Set(['う', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る']);
const ICHIDAN_HINTS = new Set([
  'え',
  'け',
  'げ',
  'せ',
  'ぜ',
  'て',
  'で',
  'ね',
  'へ',
  'べ',
  'め',
  'れ',
  'い',
  'き',
  'ぎ',
  'し',
  'じ',
  'ち',
  'に',
  'ひ',
  'び',
  'み',
  'り',
]);
const GODAN_RU_READINGS = new Set([
  'あせる',
  'あざける',
  'あなどる',
  'あまる',
  'あやまる',
  'いる',
  'いびる',
  'いる',
  'かえる',
  'かぎる',
  'かじる',
  'かぶる',
  'きる',
  'くつがえる',
  'ける',
  'こもる',
  'さえぎる',
  'さかのぼる',
  'しげる',
  'しめる',
  'しゃべる',
  'しる',
  'すべる',
  'せまる',
  'せる',
  'たぎる',
  'たどる',
  'ちぎる',
  'てる',
  'とどこおる',
  'にぎる',
  'ねる',
  'ののしる',
  'はいる',
  'はしる',
  'ひねる',
  'ふける',
  'へる',
  'まいる',
  'まじる',
  'みなぎる',
  'よみがえる',
  'よる',
]);
const E_TO_U = {
  い: 'う',
  き: 'く',
  ぎ: 'ぐ',
  し: 'す',
  ち: 'つ',
  に: 'ぬ',
  び: 'ぶ',
  み: 'む',
  り: 'る',
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cleanTerm(value) {
  return String(value || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[「」『』[\]{}]/g, '')
    .replace(/[〜～]/g, '')
    .split(/[、,;；]/)[0]
    .trim();
}

function normalizeMeaning(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^to to /i, 'to ')
    .trim();
}

function endsLikeVerb(value) {
  const clean = cleanTerm(value);
  return VERB_ENDINGS.has(clean.slice(-1));
}

function classifyVerb(reading) {
  const r = cleanTerm(reading);
  if (!r || !endsLikeVerb(r)) return null;
  if (r === 'くる') return 'kuru';
  if (r.endsWith('する')) return 'suru';
  if (!r.endsWith('る')) return 'godan';
  if (GODAN_RU_READINGS.has(r)) return 'godan';
  const prev = r.slice(-2, -1);
  return ICHIDAN_HINTS.has(prev) ? 'ichidan' : 'godan';
}

function jlptFromTags(tags = '') {
  const modern = String(tags).match(/JLPT_N([1-5])/);
  if (modern) return `N${modern[1]}`;
  const legacy = String(tags).match(/JLPT_([1-5])/);
  if (!legacy) return '';
  return { 1: 'N1', 2: 'N2', 3: 'N3', 4: 'N4', 5: 'N5' }[legacy[1]] || '';
}

function genkiLessonsFromTags(tags = '') {
  return [...String(tags).matchAll(/Genki_Ln\.(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((n) => n >= 1 && n <= 23);
}

function easierLevel(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return LEVEL_RANK[b] < LEVEL_RANK[a] ? b : a;
}

function uniqueSorted(values, min, max) {
  return [...new Set(values.map(Number))]
    .filter((n) => Number.isInteger(n) && n >= min && n <= max)
    .sort((a, b) => a - b);
}

function rememberLevel(map, key, level) {
  const clean = cleanTerm(key);
  if (!clean || !level) return;
  map.set(clean, easierLevel(map.get(clean), level));
}

function jmdictSurface(value) {
  return cleanTerm(value).replace(/な$/, '').trim();
}

function stripSuruSuffix(value) {
  const clean = cleanTerm(value);
  return clean.endsWith(SURU_SUFFIX) ? clean.slice(0, -SURU_SUFFIX.length) : clean;
}

function entryIsCommon(entry) {
  return [...(entry?.kanji || []), ...(entry?.kana || [])].some((form) => form.common);
}

function posSet(entry) {
  return new Set((entry?.sense || []).flatMap((sense) => sense.partOfSpeech || []));
}

function allowsSuru(row = {}) {
  const dict = cleanTerm(row.dict || row.expression);
  const reading = cleanTerm(row.reading);
  const meaning = normalizeMeaning(row.meaning);
  return (
    /(?:する|します)$/.test(dict) ||
    /(?:する|します)$/.test(reading) ||
    /^(to|do|make|take|have|be|become)\b/i.test(meaning)
  );
}

function groupFromPos(entry, row = {}) {
  const pos = posSet(entry);
  if (pos.has('vk')) return 'kuru';
  if ((pos.has('vs') || pos.has('vs-i') || pos.has('vs-s')) && allowsSuru(row)) return 'suru';
  if ([...pos].some((tag) => tag.startsWith('v1'))) return 'ichidan';
  if ([...pos].some((tag) => tag.startsWith('v5'))) return 'godan';
  if (pos.has('adj-i') || pos.has('adj-ix')) return 'i-adjective';
  if (pos.has('adj-na')) return 'na-adjective';
  return null;
}

function addJmdictIndexEntry(index, key, entry) {
  const clean = cleanTerm(key);
  if (!clean) return;
  if (!index.has(clean)) index.set(clean, []);
  index.get(clean).push(entry);
}

function buildJmdictIndex(jmdict) {
  const index = new Map();
  for (const entry of jmdict.words || []) {
    for (const kanji of entry.kanji || []) addJmdictIndexEntry(index, kanji.text, entry);
    for (const kana of entry.kana || []) addJmdictIndexEntry(index, kana.text, entry);
  }
  return index;
}

function entryHasSurface(entry, surface) {
  return [...(entry?.kanji || []), ...(entry?.kana || [])].some((form) => form.text === surface);
}

function rankJmdictEntry(entry, cleanDict, cleanReading) {
  const dictStem = stripSuruSuffix(cleanDict);
  const readingStem = stripSuruSuffix(cleanReading);
  const exactDict = entryHasSurface(entry, cleanDict);
  const exactReading = entryHasSurface(entry, cleanReading);
  const stemMatch =
    (dictStem !== cleanDict && entryHasSurface(entry, dictStem)) ||
    (readingStem !== cleanReading && entryHasSurface(entry, readingStem));
  return (
    (exactDict && exactReading ? 16 : 0) +
    (exactReading ? 8 : 0) +
    (exactDict ? 4 : 0) +
    (stemMatch ? 2 : 0) +
    (entryIsCommon(entry) ? 1 : 0)
  );
}

function findJmdictEntry(index, dict, reading) {
  const cleanDict = cleanTerm(dict);
  const cleanReading = cleanTerm(reading);
  const keys = [
    cleanDict,
    cleanReading,
    jmdictSurface(dict),
    jmdictSurface(reading),
    stripSuruSuffix(cleanDict),
    stripSuruSuffix(cleanReading),
  ].filter(Boolean);
  const candidates = [...new Set(keys.flatMap((key) => index.get(key) || []))];
  if (!candidates.length) return null;
  return candidates
    .map((entry, order) => ({
      entry,
      order,
      score: rankJmdictEntry(entry, cleanDict, cleanReading),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)[0].entry;
}

function normalizeSupportedWord(row, jmdictIndex) {
  let dict = cleanTerm(row.dict || row.expression);
  let reading = cleanTerm(row.reading) || dict;
  const entry = findJmdictEntry(jmdictIndex, dict, reading);
  const group = groupFromPos(entry, row);
  if (!group) return null;

  if (group === 'suru') {
    dict = dict.replace(/します$/, 'する');
    reading = reading.replace(/します$/, 'する');
    if (!dict.endsWith('する')) dict += 'する';
    if (!reading.endsWith('する')) reading += 'する';
  } else if (group === 'na-adjective') {
    dict = jmdictSurface(dict);
    reading = jmdictSurface(reading);
  }

  if (!dict || !reading) return null;
  return {
    dict,
    reading,
    meaning: row.meaning,
    group,
    common: entryIsCommon(entry),
  };
}

function mergeWord(map, rawWord) {
  const word = normalizeLexiconWord(rawWord);
  if (!word) {
    cleanedArtifacts.removed += 1;
    return;
  }
  if (word !== rawWord) cleanedArtifacts.repaired += 1;
  if (!word.dict || !word.reading || !word.group) return;
  const key = `${word.group}:${word.dict}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      dict: word.dict,
      reading: word.reading,
      meaning: normalizeMeaning(word.meaning),
      group: word.group,
      jlpt: word.jlpt || '',
      genkiLessons: uniqueSorted(word.genkiLessons || [], 1, 23),
      minnaLessons: uniqueSorted(word.minnaLessons || [], 1, 50),
      common: Boolean(word.common),
    });
    return;
  }
  existing.jlpt = easierLevel(existing.jlpt, word.jlpt);
  existing.meaning = existing.meaning || normalizeMeaning(word.meaning);
  existing.common = existing.common || Boolean(word.common);
  existing.genkiLessons = uniqueSorted(
    [...existing.genkiLessons, ...(word.genkiLessons || [])],
    1,
    23,
  );
  existing.minnaLessons = uniqueSorted(
    [...existing.minnaLessons, ...(word.minnaLessons || [])],
    1,
    50,
  );
}

function politeReadingFor(word) {
  const { reading, group } = word;
  if (group === 'ichidan') return `${reading.slice(0, -1)}ます`;
  if (group === 'suru') return `${reading.slice(0, -2)}します`;
  if (group === 'kuru') return `${reading.slice(0, -2)}きます`;
  const last = reading.slice(-1);
  const stem = reading.slice(0, -1);
  const iRow = {
    う: 'い',
    く: 'き',
    ぐ: 'ぎ',
    す: 'し',
    つ: 'ち',
    ぬ: 'に',
    ぶ: 'び',
    む: 'み',
    る: 'り',
  }[last];
  return iRow ? `${stem}${iRow}ます` : '';
}

function dictFromPolite(row, lookup) {
  const reading = cleanTerm(row.reading).replace(/ました$/, 'ます');
  const dict = cleanTerm(row.dict).replace(/ました$/, 'ます');
  const meaning = normalizeMeaning(row.meaning);
  const direct = lookup.get(reading) || lookup.get(dict);
  if (direct) return { ...direct, meaning: meaning || direct.meaning };
  if (reading === 'きます' || dict.includes('来ます')) {
    return { dict: '来る', reading: 'くる', meaning, group: 'kuru' };
  }
  if (reading.endsWith('します')) {
    const stemReading = reading.slice(0, -3);
    const stemDict = dict.endsWith('します') ? dict.slice(0, -3) : stemReading;
    return { dict: `${stemDict}する`, reading: `${stemReading}する`, meaning, group: 'suru' };
  }
  if (!reading.endsWith('ます')) return null;
  const stemReading = reading.slice(0, -2);
  const stemDict = dict.endsWith('ます') ? dict.slice(0, -2) : stemReading;
  const last = stemReading.slice(-1);
  if (['え', 'け', 'げ', 'せ', 'ぜ', 'て', 'で', 'ね', 'へ', 'べ', 'め', 'れ'].includes(last)) {
    return { dict: `${stemDict}る`, reading: `${stemReading}る`, meaning, group: 'ichidan' };
  }
  if (E_TO_U[last]) {
    return {
      dict: `${stemDict.slice(0, -1)}${E_TO_U[last]}`,
      reading: `${stemReading.slice(0, -1)}${E_TO_U[last]}`,
      meaning,
      group: 'godan',
    };
  }
  return null;
}

function rowFromVerb(word) {
  return [
    word.dict,
    word.reading,
    word.meaning,
    word.group,
    word.jlpt,
    word.genkiLessons,
    word.minnaLessons,
    Boolean(word.common),
  ];
}

function hasLessonCoverage(word) {
  return Boolean(word.genkiLessons?.length || word.minnaLessons?.length);
}

function isLowUsePracticeWord(word) {
  return PRACTICE_GROUPS.has(word.group) && word.jlpt && !hasLessonCoverage(word) && !word.common;
}

function isGeneratedPracticeArtifact(word) {
  return isLexiconArtifactWord(word);
}

function countByJlpt(words) {
  const counts = {};
  for (const word of words) {
    if (word.jlpt) counts[word.jlpt] = (counts[word.jlpt] || 0) + 1;
  }
  return counts;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Katachiya vocab builder' } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

function extractFirstFileFromTgz(buffer) {
  const tar = gunzipSync(Buffer.from(buffer));
  const size = parseInt(tar.toString('ascii', 124, 136).replace(/\0.*$/, '').trim(), 8) || 0;
  if (!size) throw new Error('JMdict archive did not contain a readable JSON file');
  return tar.subarray(512, 512 + size).toString('utf8');
}

async function fetchJmdict() {
  const release = await fetchJson(JMDICT_RELEASE_URL);
  const asset = (release.assets || []).find((item) => /^jmdict-eng-.*\.json\.tgz$/.test(item.name));
  if (!asset?.browser_download_url) throw new Error('Could not find latest JMdict English JSON');
  const response = await fetch(asset.browser_download_url);
  if (!response.ok) throw new Error(`Failed to fetch JMdict: ${response.status}`);
  return JSON.parse(extractFirstFileFromTgz(await response.arrayBuffer()));
}

async function main() {
  const [jlptGenkiCsv, minnaCsv, jmdict] = await Promise.all([
    fetchText(JLPT_GENKI_URL),
    fetchText(MINNA_URL),
    fetchJmdict(),
  ]);
  const jmdictIndex = buildJmdictIndex(jmdict);
  const words = new Map();
  const jlptBySurface = new Map();

  const jlptRows = parseCsv(jlptGenkiCsv)
    .slice(1)
    .map(([expression, reading, meaning, tags]) => ({ expression, reading, meaning, tags }));
  for (const row of jlptRows) {
    const jlpt = jlptFromTags(row.tags);
    rememberLevel(jlptBySurface, row.expression, jlpt);
    rememberLevel(jlptBySurface, row.reading, jlpt);
    rememberLevel(jlptBySurface, `${row.expression}する`, jlpt);
    rememberLevel(jlptBySurface, `${row.reading}する`, jlpt);
  }

  for (const row of jlptRows) {
    const dict = cleanTerm(row.expression);
    const reading = cleanTerm(row.reading);
    const word =
      normalizeSupportedWord({ dict, reading, meaning: row.meaning }, jmdictIndex) ||
      (/\bto\s+[a-z]/i.test(row.meaning) && endsLikeVerb(dict)
        ? { dict, reading, meaning: row.meaning, group: classifyVerb(reading) }
        : null);
    if (!word?.group) continue;
    mergeWord(words, {
      ...word,
      jlpt: jlptFromTags(row.tags),
      genkiLessons: genkiLessonsFromTags(row.tags),
    });
  }

  const politeLookup = new Map();
  for (const word of words.values()) {
    const polite = politeReadingFor(word);
    if (polite && !politeLookup.has(polite)) politeLookup.set(polite, word);
  }

  let currentLesson = null;
  for (const [dict, reading, meaning] of parseCsv(minnaCsv)) {
    const lessonMatch = String(dict || '').match(/Lesson\s+(\d+)\s*[:：]?/);
    if (lessonMatch) {
      currentLesson = Number(lessonMatch[1]);
      continue;
    }
    if (!currentLesson || !reading) continue;
    const cleanReading = cleanTerm(reading);
    const word = /(ます|ました)$/.test(cleanReading)
      ? dictFromPolite({ dict, reading, meaning }, politeLookup)
      : normalizeSupportedWord({ dict, reading, meaning }, jmdictIndex);
    if (!word) continue;
    mergeWord(words, {
      ...word,
      jlpt: jlptBySurface.get(word.dict) || jlptBySurface.get(word.reading) || '',
      minnaLessons: [currentLesson],
    });
  }

  const candidateWords = [...words.values()].filter(
    (word) => word.jlpt || word.genkiLessons.length || word.minnaLessons.length,
  );
  const trimmedGeneratedArtifactWords = candidateWords.filter(isGeneratedPracticeArtifact);
  const publishableWords = candidateWords.filter((word) => !isGeneratedPracticeArtifact(word));
  const practiceWords = publishableWords.filter((word) => PRACTICE_GROUPS.has(word.group));
  const trimmedLowUseWords = practiceWords.filter(isLowUsePracticeWord);
  const rows = practiceWords
    .filter((word) => !isLowUsePracticeWord(word))
    .sort((a, b) => {
      const levelDiff = (LEVEL_RANK[a.jlpt] ?? 9) - (LEVEL_RANK[b.jlpt] ?? 9);
      return (
        levelDiff || a.reading.localeCompare(b.reading, 'ja') || a.dict.localeCompare(b.dict, 'ja')
      );
    })
    .map(rowFromVerb);
  const verbs = rows.filter((row) => ['ichidan', 'godan', 'suru', 'kuru'].includes(row[3]));
  const adjectives = rows.filter((row) => ['i-adjective', 'na-adjective'].includes(row[3]));
  const trimmedLowUse = {
    total: trimmedLowUseWords.length,
    verbs: trimmedLowUseWords.filter((word) =>
      ['ichidan', 'godan', 'suru', 'kuru'].includes(word.group),
    ).length,
    adjectives: trimmedLowUseWords.filter((word) =>
      ['i-adjective', 'na-adjective'].includes(word.group),
    ).length,
    byJlpt: countByJlpt(trimmedLowUseWords),
  };
  const trimmedGeneratedArtifacts = {
    total: trimmedGeneratedArtifactWords.length,
    verbs: trimmedGeneratedArtifactWords.filter((word) =>
      ['ichidan', 'godan', 'suru', 'kuru'].includes(word.group),
    ).length,
    adjectives: trimmedGeneratedArtifactWords.filter((word) =>
      ['i-adjective', 'na-adjective'].includes(word.group),
    ).length,
    byJlpt: countByJlpt(trimmedGeneratedArtifactWords),
  };

  const payload = {
    schema: 3,
    generatedAt: new Date().toISOString(),
    sources: [
      {
        name: 'elzup/jlpt-word-list',
        url: JLPT_GENKI_URL,
        license: 'MIT; derived from Tanos JLPT decks with attribution noted upstream',
        use: 'JLPT level estimates and Genki lesson tags',
      },
      {
        name: 'Mohammad Akhlaghi Japanese Vocabulary',
        url: MINNA_URL,
        license: 'Public study CSV; page says beginners can use the files as they please',
        use: 'Minna no Nihongo lesson tags',
      },
      {
        name: 'JMdict Simplified',
        url: JMDICT_RELEASE_URL,
        license: 'JMdict/EDRDG license; used for part-of-speech and commonness signals',
        use: 'Verb/adjective classification and common priority markers',
      },
    ],
    trimPolicy: {
      appliesTo: 'JLPT-tagged verbs/adjectives and known generated artifact rows',
      keepIf: ['Genki lesson tag', 'Minna no Nihongo lesson tag', 'JMdict common priority marker'],
      removeIf:
        'JLPT-only and not marked common by JMdict, generated operator-label artifact, or known non-conjugation scrape artifact',
    },
    stats: {
      trimmedLowUse,
      trimmedGeneratedArtifacts,
      cleanedArtifacts,
    },
    columns: [
      'dict',
      'reading',
      'meaning',
      'group',
      'jlpt',
      'genkiLessons',
      'minnaLessons',
      'common',
    ],
    verbs,
    adjectives,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(payload)}\n`);

  const counts = {
    total: rows.length,
    verbs: verbs.length,
    adjectives: adjectives.length,
    common: rows.filter((row) => row[7]).length,
    trimmedLowUse,
    trimmedGeneratedArtifacts,
    cleanedArtifacts,
    jlpt: {},
    genkiLessons: new Set(),
    minnaLessons: new Set(),
  };
  for (const [, , , , jlpt, genkiLessons, minnaLessons] of rows) {
    if (jlpt) counts.jlpt[jlpt] = (counts.jlpt[jlpt] || 0) + 1;
    for (const lesson of genkiLessons) counts.genkiLessons.add(lesson);
    for (const lesson of minnaLessons) counts.minnaLessons.add(lesson);
  }
  console.log(
    JSON.stringify(
      {
        total: counts.total,
        verbs: counts.verbs,
        adjectives: counts.adjectives,
        common: counts.common,
        trimmedLowUse: counts.trimmedLowUse,
        trimmedGeneratedArtifacts: counts.trimmedGeneratedArtifacts,
        cleanedArtifacts: counts.cleanedArtifacts,
        jlpt: counts.jlpt,
        genkiLessonCount: counts.genkiLessons.size,
        minnaLessonCount: counts.minnaLessons.size,
        out: OUT_PATH,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
