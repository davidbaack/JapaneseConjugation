import { normalizeJlptLevel } from './conjugator.js';
import { toHiragana } from './romaji.js';
import { validateWord } from './validateWord.js';

export const WANIKANI_API_BASE = 'https://api.wanikani.com/v2';
export const WANIKANI_REVISION = '20170710';
export const WANIKANI_SUBJECT_TYPES = 'vocabulary,kana_vocabulary';

export const WANIKANI_IMPORT_SCOPES = [
  {
    id: 'passed',
    label: 'Passed',
    listName: 'WaniKani passed',
    description: 'Items you have reached Guru or higher.',
  },
  {
    id: 'started',
    label: 'Started',
    listName: 'WaniKani started',
    description: 'Items you have started reviewing.',
  },
  {
    id: 'burned',
    label: 'Burned',
    listName: 'WaniKani burned',
    description: 'Items you have burned.',
  },
  {
    id: 'unlocked',
    label: 'Unlocked',
    listName: 'WaniKani unlocked',
    description: 'Items available in your account, including lessons not yet started.',
  },
];

export function getWanikaniScope(id) {
  return WANIKANI_IMPORT_SCOPES.find((scope) => scope.id === id) || WANIKANI_IMPORT_SCOPES[0];
}

export function wanikaniListId(scopeId) {
  return `wanikani-${getWanikaniScope(scopeId).id}`;
}

function cleanPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function groupFromWanikaniParts(partsOfSpeech = [], characters = '') {
  const parts = partsOfSpeech.map(cleanPart);
  const joined = parts.join(' ');
  const text = cleanPart(`${joined} ${characters}`);
  if (text.includes('ichidan verb')) return 'ichidan';
  if (text.includes('godan verb')) return 'godan';
  if (text.includes('suru verb') || text.includes('する verb')) return 'suru';
  if (text.includes('kuru verb')) return 'kuru';
  if (text.includes('i adjective') || text.includes('い adjective')) return 'i-adjective';
  if (text.includes('na adjective') || text.includes('な adjective')) return 'na-adjective';
  return null;
}

export function assignmentMatchesWanikaniScope(assignment, scopeId = 'passed') {
  const data = assignment?.data || assignment || {};
  switch (getWanikaniScope(scopeId).id) {
    case 'started':
      return !!data.started_at;
    case 'burned':
      return !!data.burned_at;
    case 'unlocked':
      return !!data.unlocked_at;
    case 'passed':
    default:
      return !!data.passed_at || Number(data.srs_stage || 0) >= 5;
  }
}

function primaryMeaning(meanings = []) {
  const accepted = meanings.filter((meaning) => meaning.accepted_answer !== false);
  const primary = accepted.find((meaning) => meaning.primary) || accepted[0] || meanings[0];
  return primary?.meaning || '';
}

function primaryReading(readings = [], fallback = '') {
  const accepted = readings.filter((reading) => reading.accepted_answer !== false);
  const primary = accepted.find((reading) => reading.primary) || accepted[0] || readings[0];
  return primary?.reading || fallback || '';
}

export function wanikaniSubjectToWord(subject) {
  const data = subject?.data || subject || {};
  const characters = data.characters || '';
  const group = groupFromWanikaniParts(data.parts_of_speech || [], characters);
  if (!characters || !group) return null;

  let dict = characters;
  let reading = toHiragana(primaryReading(data.readings || [], characters));
  if (group === 'suru' && !reading.endsWith('する')) {
    dict = dict.endsWith('する') ? dict : `${dict}する`;
    reading = `${reading}する`;
  }

  const meaning = primaryMeaning(data.meanings || []);
  const candidate = {
    dict,
    reading,
    meaning,
    group,
  };
  const { ok, word } = validateWord(candidate);
  if (!ok) return null;

  const jlpt = normalizeJlptLevel(data.jlpt);
  return {
    ...word,
    ...(jlpt ? { jlpt } : {}),
    source: 'wanikani',
    wanikaniSubjectId: subject?.id || data.id || null,
    wanikaniLevel: Number(data.level) || null,
  };
}

function authHeaders(apiToken) {
  return {
    Authorization: `Bearer ${apiToken}`,
    'Wanikani-Revision': WANIKANI_REVISION,
  };
}

function queryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

async function fetchJson(url, apiToken, signal) {
  const response = await fetch(url, { headers: authHeaders(apiToken), signal });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('WaniKani rejected that API token.');
    }
    if (response.status === 429) {
      throw new Error('WaniKani rate-limited the import. Try again in a minute.');
    }
    throw new Error(`WaniKani request failed (${response.status}).`);
  }
  return response.json();
}

export async function fetchWanikaniCollection(path, apiToken, { signal } = {}) {
  let url = path.startsWith('http') ? path : `${WANIKANI_API_BASE}${path}`;
  const rows = [];
  while (url) {
    const payload = await fetchJson(url, apiToken, signal);
    if (Array.isArray(payload.data)) rows.push(...payload.data);
    url = payload.pages?.next_url || '';
  }
  return rows;
}

export async function fetchWanikaniUser(apiToken, { signal } = {}) {
  const payload = await fetchJson(`${WANIKANI_API_BASE}/user`, apiToken, signal);
  return payload.data || {};
}

function assignmentPath(scopeId) {
  const params = {
    subject_types: WANIKANI_SUBJECT_TYPES,
    hidden: 'false',
  };
  const scope = getWanikaniScope(scopeId).id;
  if (scope === 'unlocked') params.unlocked = 'true';
  else if (scope === 'burned') params.burned = 'true';
  else params.started = 'true';
  return `/assignments?${queryString(params)}`;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function fetchWanikaniSubjectsByIds(apiToken, ids, { signal } = {}) {
  if (!ids.length) return [];
  const batches = chunk([...new Set(ids)], 400);
  const subjects = [];
  for (const batch of batches) {
    subjects.push(
      ...(await fetchWanikaniCollection(
        `/subjects?${queryString({ ids: batch.join(',') })}`,
        apiToken,
        { signal },
      )),
    );
  }
  return subjects;
}

export async function buildWanikaniImport(apiToken, scopeId = 'passed', { signal } = {}) {
  const token = String(apiToken || '').trim();
  if (!token) throw new Error('Paste a WaniKani API token first.');

  const [user, assignments] = await Promise.all([
    fetchWanikaniUser(token, { signal }),
    fetchWanikaniCollection(assignmentPath(scopeId), token, { signal }),
  ]);
  const maxLevel = Number(user?.subscription?.max_level_granted || 0) || Infinity;
  const matchedAssignments = assignments.filter((assignment) =>
    assignmentMatchesWanikaniScope(assignment, scopeId),
  );
  const subjectIds = matchedAssignments
    .map((assignment) => assignment.data?.subject_id)
    .filter(Boolean);
  const subjects = await fetchWanikaniSubjectsByIds(token, subjectIds, { signal });
  const words = [];
  let skipped = 0;
  for (const subject of subjects) {
    const level = Number(subject?.data?.level || 0) || 0;
    if (level > maxLevel) {
      skipped += 1;
      continue;
    }
    const word = wanikaniSubjectToWord(subject);
    if (word) words.push(word);
    else skipped += 1;
  }

  return {
    scope: getWanikaniScope(scopeId),
    user,
    assignments: matchedAssignments.length,
    subjects: subjects.length,
    words,
    skipped,
  };
}
