// @ts-check
// Deterministic English translations for the generated sentence-library frames.
// This repairs legacy output where `en` was boilerplate while preserving the
// already-validated Japanese sentence and segment structure.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateVerbRows, mergeBuiltInWords } from '../src/data/verbLexicon.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../src/data/starterWords.js';
import { isAdjective, wordKey } from '../src/utils/conjugator.js';
import {
  cleanEnglishAction,
  gerund,
  pastParticiple,
  simplePast,
  thirdPerson,
} from '../src/utils/display.js';

const LEXICON_PATH = join('public', 'data', 'verb-lexicon.json');

const ACTION_OVERRIDES = {
  'be relieved': 'feel relieved',
  'do shopping': 'shop',
  driving: 'drive',
  'entry to school': 'enter school',
  exercise: 'exercise',
  'extra-modest expression for': 'do',
  'extra-modest expression for する': 'do',
  'honorific expression for': 'do',
  'incline toward': 'lean toward',
  'look after': 'look after someone',
  'looking after': 'look after someone',
  moving: 'move',
  phone: 'call',
  practice: 'practice',
  request: 'ask',
  study: 'study',
  'take a walk': 'take a walk',
  'wash clothes': 'wash clothes',
};

const ADJECTIVE_OVERRIDES = {
  admiration: 'admirable',
  affair: 'fickle',
  altitude: 'advanced',
  anxiety: 'uneasy',
  "be beyond one's power": 'overwhelming',
  'be good at': 'skillful',
  'be in bad condition': 'in bad shape',
  'be in good condition': 'in good shape',
  beauty: 'beautiful',
  'bother to do': 'troublesome',
  bravery: 'brave',
  cash: 'practical',
  centimeter: 'sentimental',
  certainty: 'reliable',
  clarity: 'clear',
  complaint: 'dissatisfied',
  convenience: 'convenient',
  'counter for letters': 'knowledgeable',
  crime: 'wrong',
  curiosity: 'curious',
  danger: 'dangerous',
  depression: 'depressing',
  difficulty: 'difficult',
  disposal: 'hard to handle',
  'easy to do ~': 'easy',
  'electro-magnetic wave': 'strange',
  enthusiasm: 'enthusiastic',
  equality: 'equal',
  equilibrium: 'stable',
  essence: 'stylish',
  fame: 'famous',
  fitness: 'suitable',
  forbearance: 'tolerant',
  frequency: 'frequent',
  fun: 'fun',
  happiness: 'happy',
  'hard to do ~': 'tough',
  immediately: 'immediate',
  'it is not worth ~': 'unavoidable',
  "it can't be helped": 'unavoidable',
  'looks like ~': 'similar',
  mystery: 'mysterious',
  normalcy: 'normal',
  normality: 'normal',
  poverty: 'poor',
  reality: 'real',
  safety: 'safe',
  simplicity: 'simple',
  suitability: 'appropriate',
  'too much': 'excessive',
  truth: 'true',
  very: 'intense',
  '~ish': 'like that',
  '~ run': 'managed',
  '~increase': 'increased',
  '2nd in rank': 'unusual',
  'a line': 'single-minded',
  'a little': 'few',
  abundantly: 'abundant',
  'cannot be helped': 'unavoidable',
  conceit: 'pretentious',
  comfort: 'comfortable',
  'countless number': 'countless',
  discontent: 'dissatisfied',
  disorder: 'abnormal',
  'difficult to do ~': 'difficult',
  ease: 'easy',
  egoism: 'selfish',
  'filial piety': 'devoted to family',
  fragment: 'incomplete',
  harmony: 'harmonious',
  'high class': 'first-rate',
  'high price': 'expensive',
  hey: 'many',
  'idle complaint': 'grumbly',
  'must not do': 'unacceptable',
  order: 'orderly',
  season: 'cheerful',
  'shut mouth': 'at a loss',
  "there isn't": 'missing',
  bone: 'difficult',
};

const STATIVE_ACTIONS = new Set(['be', 'exist', 'live', 'remain', 'stay']);
const JP_RE = /[ぁ-ヿ一-鿿豈-﫿]/;

function stripParentheticals(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstGloss(value) {
  return glossParts(value)[0] || '';
}

function glossParts(value) {
  return stripParentheticals(value)
    .split(/;|,|\/|\bor\b/i)
    .map((part) =>
      part
        .trim()
        .replace(/^--\s*/, '')
        .replace(/\s*--$/, '')
        .toLowerCase(),
    )
    .filter(Boolean);
}

export function loadSentenceWordMap() {
  const data = JSON.parse(readFileSync(LEXICON_PATH, 'utf8'));
  const verbs = mergeBuiltInWords(inflateVerbRows(data.verbs || []), STARTER_VERBS);
  const adjectives = mergeBuiltInWords(inflateVerbRows(data.adjectives || []), STARTER_ADJECTIVES);
  const map = new Map();
  for (const word of [...verbs, ...adjectives]) map.set(wordKey(word), word);
  return map;
}

export function actionPhrase(word) {
  const raw = firstGloss(word?.meaning || '');
  const lower = raw.toLowerCase();
  if (ACTION_OVERRIDES[lower]) return ACTION_OVERRIDES[lower];
  const cleaned = cleanEnglishAction(raw).toLowerCase().trim();
  if (JP_RE.test(cleaned) || /expression for/.test(cleaned)) return 'do';
  return ACTION_OVERRIDES[cleaned] || cleaned || 'do it';
}

export function adjectivePhrase(word) {
  const parts = glossParts(word?.meaning || '').map((part) => part.replace(/^to be\s+/, ''));
  const picked =
    parts.find((part) => ADJECTIVE_OVERRIDES[part]) ||
    parts.find((part) => !/(ness|ity|cy|tion|sion|ment|ship|ance|ence|dom|th|ry)$/.test(part)) ||
    parts[0] ||
    '';
  if (ADJECTIVE_OVERRIDES[picked]) return ADJECTIVE_OVERRIDES[picked];
  return picked || 'that way';
}

function isBePhrase(action) {
  return action === 'be' || action.startsWith('be ');
}

function beComplement(action) {
  return action === 'be' ? 'there' : action.replace(/^be\s+/, '');
}

function isStativeAction(action) {
  return STATIVE_ACTIONS.has(action) || isBePhrase(action);
}

// The English conjugators in display.js inflect the head verb of a phrase and
// preserve the remainder (e.g. "return home" → "returned home"), so delegate to
// them and only special-case the copula here.
function simplePastPhrase(action) {
  if (isBePhrase(action)) return `was ${beComplement(action)}`;
  return simplePast(action);
}

function pastParticiplePhrase(action) {
  if (isBePhrase(action)) return `been ${beComplement(action)}`;
  return pastParticiple(action);
}

function gerundPhrase(action) {
  if (isBePhrase(action)) return `being ${beComplement(action)}`;
  return gerund(action);
}

function thirdPersonPhrase(action) {
  if (isBePhrase(action)) return `is ${beComplement(action)}`;
  return thirdPerson(action);
}

function present(action) {
  return isBePhrase(action) ? `am ${beComplement(action)}` : action;
}

function negativePresent(action) {
  return isBePhrase(action) ? `am not ${beComplement(action)}` : `do not ${action}`;
}

function negativePast(action) {
  return isBePhrase(action) ? `was not ${beComplement(action)}` : `did not ${action}`;
}

function passivePhrase(action, tense = 'present') {
  if (isStativeAction(action)) {
    if (tense === 'past') return `was affected when someone ${simplePastPhrase(action)}`;
    if (tense === 'negative') return `am not affected by someone ${gerundPhrase(action)}`;
    if (tense === 'past-negative') return `was not affected by someone ${gerundPhrase(action)}`;
    return `am affected when someone ${thirdPersonPhrase(action)}`;
  }
  const pp = pastParticiplePhrase(action);
  if (tense === 'past') return `was ${pp}`;
  if (tense === 'negative') return `am not ${pp}`;
  if (tense === 'past-negative') return `was not ${pp}`;
  return `am ${pp}`;
}

function passiveSentence(action, type) {
  if (isStativeAction(action)) return `I ${actionForType(action, type)} today.`;
  const phrase = actionForType(action, type);
  if (phrase.startsWith('was not ')) return `It ${phrase} by a friend today.`;
  if (phrase.startsWith('was ')) return `It ${phrase} by a friend today.`;
  if (phrase.startsWith('am not ')) return `It is not ${phrase.slice(7)} by a friend today.`;
  if (phrase.startsWith('am ')) return `It is ${phrase.slice(3)} by a friend today.`;
  return `It is affected by a friend today.`;
}

function actionForType(action, type) {
  if (type.includes('potential')) {
    if (type.includes('past-negative')) return `was not able to ${action}`;
    if (type.includes('negative')) return `cannot ${action}`;
    if (type.includes('past')) return `was able to ${action}`;
    return `can ${action}`;
  }
  if (type.includes('desiderative')) {
    if (type.includes('past-negative')) return `did not want to ${action}`;
    if (type.includes('negative')) return `do not want to ${action}`;
    if (type.includes('past')) return `wanted to ${action}`;
    return `want to ${action}`;
  }
  if (type.includes('progressive')) {
    if (type.includes('past-negative')) return `had not been ${gerundPhrase(action)}`;
    if (type.includes('negative')) return `am not ${gerundPhrase(action)}`;
    if (type.includes('past')) return `was ${gerundPhrase(action)}`;
    return `am ${gerundPhrase(action)}`;
  }
  if (type.includes('passive')) {
    if (type.includes('past-negative')) return passivePhrase(action, 'past-negative');
    if (type.includes('negative')) return passivePhrase(action, 'negative');
    if (type.includes('past')) return passivePhrase(action, 'past');
    return passivePhrase(action);
  }
  if (type.includes('causative')) {
    const caused = isBePhrase(action) ? beComplement(action) : action;
    if (type.includes('past-negative')) return `did not make me ${caused}`;
    if (type.includes('negative')) return `does not make me ${caused}`;
    if (type.includes('past')) return `made me ${caused}`;
    return `makes me ${caused}`;
  }
  switch (type) {
    case 'plain-past':
    case 'polite-past':
      return simplePastPhrase(action);
    case 'plain-negative':
    case 'polite-negative':
      return negativePresent(action);
    case 'plain-past-negative':
    case 'polite-past-negative':
      return negativePast(action);
    default:
      return present(action);
  }
}

function conditionalAction(action, type) {
  if (type.includes('potential')) {
    return type.includes('negative') ? `cannot ${action}` : `can ${action}`;
  }
  if (type.includes('passive')) {
    return passivePhrase(action, type.includes('negative') ? 'negative' : 'present');
  }
  if (type.includes('causative')) {
    return type.includes('negative')
      ? `the teacher does not make me ${action}`
      : `the teacher makes me ${action}`;
  }
  if (type.includes('negative')) return negativePresent(action);
  return present(action);
}

function verbEnglish(word, type) {
  const action = actionPhrase(word);
  if (type === 'te-form') return `Today, I ${present(action)} with a friend and talk.`;
  if (type === 'negative-te' || type === 'negative-te-connective' || type === 'negative-zuni') {
    return `Today, I went home without ${gerundPhrase(action)}.`;
  }
  if (type === 'request-kudasai') return `Please ${action} here.`;
  if (type === 'negative-request') return `Please do not ${action} here.`;
  if (type === 'permission') return `I may ${action} today.`;
  if (type === 'obligation') return `I have to ${action} today.`;
  if (type === 'prohibition') return `Do not ${action} here.`;
  if (type === 'imperative' || type === 'command-nasai') return `${capitalize(action)} now.`;
  if (type === 'polite-volitional' || type === 'volitional') {
    return `Let's ${action} together tomorrow.`;
  }
  if (type.includes('conditional') || type.endsWith('-ba')) {
    return `If I ${conditionalAction(action, type)} tomorrow, I will feel relieved.`;
  }
  if (type === 'conjectural') return `I am sure I will ${action} tomorrow.`;
  if (type.startsWith('honorific')) return `The teacher ${thirdPersonPhrase(action)} today.`;
  if (type.startsWith('humble')) return `I ${present(action)} today.`;
  if (type.includes('progressive')) {
    const phrase = actionForType(action, type).replace(/^am /, 'is ').replace(/^was /, 'was ');
    return `A friend ${phrase} now.`;
  }
  if (type.includes('passive')) return passiveSentence(action, type);
  if (type.includes('causative')) return `The teacher ${actionForType(action, type)} today.`;
  if (type.includes('potential')) {
    if (type.includes('past-negative')) return `I was not able to ${action} today either.`;
    if (type.includes('negative')) return `I cannot ${action} today either.`;
    if (type.includes('past')) return `I was also able to ${action} today.`;
    return `I can also ${action} today.`;
  }
  return `I also ${actionForType(action, type)} today.`;
}

function adjectiveEnglish(word, type) {
  const adj = adjectivePhrase(word);
  if (type === 'adj-te-form') return `Today it is ${adj}, so I feel good.`;
  if (type === 'adj-negative-te-form') return `Today it is not ${adj}, so I am having trouble.`;
  if (type === 'adj-adverb') return `The teacher speaks in a ${adj} way.`;
  if (type === 'adj-attributive') return `Today is a ${adj} day.`;
  if (type === 'adj-conditional') return `If tomorrow is ${adj}, I want to go.`;
  if (type === 'adj-negative-conditional') return `If tomorrow is not ${adj}, I want to go.`;
  if (type === 'adj-tara') return `If tomorrow is ${adj}, I will stay home.`;
  if (type === 'adj-negative-tara') return `If tomorrow is not ${adj}, I will stay home.`;
  if (type === 'adj-sou') return `The sky looks ${adj}.`;
  if (type === 'adj-sugiru') return `This room is too ${adj}.`;
  if (type === 'adj-naru') return `The room gets ${adj}.`;
  if (type.includes('past-negative')) return `Today was not ${adj}.`;
  if (type.includes('negative')) return `Today is not ${adj}.`;
  if (type.includes('past')) return `Today was ${adj}.`;
  return `Today is ${adj}.`;
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

export function sentenceEnglish(word, type) {
  return isAdjective(word) || type.startsWith('adj-')
    ? adjectiveEnglish(word, type)
    : verbEnglish(word, type);
}
