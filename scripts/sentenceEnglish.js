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
  'be based on': 'base it on the facts',
  'be blessed with': 'have good conditions',
  'be enthusiastic about': 'feel enthusiastic about it',
  'be furnished with': 'have the right equipment',
  'be grounded on': 'base it on the facts',
  'be in time for': 'arrive in time',
  'be inconsistent with': 'contradict it',
  'be intimate with': 'become friendly with someone',
  'be kind to': 'treat someone kindly',
  'be looking forward to': 'look forward to it',
  'be on good terms with': 'get along with someone',
  'be rich in': 'have plenty',
  'act as an agent for': 'represent someone',
  'ask after': 'ask about it',
  'boast of': 'boast about it',
  'call out to': 'call out to someone',
  'carry on': 'continue',
  'come from': 'come from there',
  'come near to': 'approach it',
  'conform to': 'conform to it',
  'consult with': 'consult someone',
  'consist of': 'include it',
  congradulations: 'celebrate',
  'devote oneself to': 'focus on it',
  'do shopping': 'shop',
  'drift about': 'drift',
  driving: 'drive',
  'escape from': 'escape from it',
  'entry to school': 'enter school',
  exercise: 'exercise',
  'face on': 'face it',
  'fall in love with': 'fall in love with someone',
  'extra-modest expression for': 'do',
  'extra-modest expression for する': 'do',
  'honorific expression for': 'do',
  'incline toward': 'lean toward',
  'close the eyes': 'close my eyes',
  'fuss over': 'focus on details',
  'get into': 'get involved',
  'give a treat': 'treat someone',
  'give board to': 'provide meals for someone',
  'look after': 'look after someone',
  'look anxiously for': 'look for it',
  'look out on': 'look out at it',
  'look out over': 'look out over it',
  'looking after': 'look after someone',
  moving: 'move',
  phone: 'call',
  'push into': 'push it inside',
  practice: 'practice',
  request: 'ask',
  'report to': 'report to someone',
  'run counter to': 'oppose it',
  'settle into': 'settle into it',
  'speak ill of': 'criticize someone',
  'sympathize with': 'sympathize with someone',
  study: 'study',
  'take a walk': 'take a walk',
  'take the name of': 'use its name',
  'turn over': 'flip it',
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
  burly: 'strong',
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
  'have a headache': 'sore',
  'here and there': 'scattered',
  how: 'appropriate',
  immediately: 'immediate',
  injustice: 'unfair',
  'it is not worth ~': 'unavoidable',
  "it can't be helped": 'unavoidable',
  kindness: 'kind',
  'looking forward to': 'eager',
  'quick tempered': 'quick-tempered',
  'looks like ~': 'similar',
  manner: 'presentable',
  mystery: 'mysterious',
  neglect: 'careless',
  normalcy: 'normal',
  normality: 'normal',
  overcoat: 'excessive',
  poverty: 'poor',
  reality: 'real',
  safety: 'safe',
  simplicity: 'simple',
  seriousness: 'serious',
  suitability: 'appropriate',
  'too much': 'excessive',
  trick: 'mischievous',
  truth: 'true',
  very: 'intense',
  'very hard': 'diligent',
  'very like-able': 'likable',
  'very much': 'excessive',
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
  disadvantage: 'disadvantageous',
  ease: 'easy',
  egoism: 'selfish',
  'filial piety': 'devoted to family',
  fragment: 'incomplete',
  harmony: 'harmonious',
  'high class': 'first-rate',
  'high price': 'expensive',
  fat: 'thick',
  hey: 'many',
  'idle complaint': 'grumbly',
  'must not do': 'unacceptable',
  order: 'orderly',
  season: 'cheerful',
  'shut mouth': 'at a loss',
  sorry: 'apologetic',
  "there isn't": 'missing',
  bone: 'difficult',
  competetive: 'competitive',
  fawn: 'hungry',
  'slow tempered': 'patient',
  'strong willed': 'strong-willed',
  unpleasent: 'unpleasant',
};

const ADJECTIVE_SUBJECT_OVERRIDES = {
  apologetic: 'the student',
  careful: 'the student',
  clever: 'the student',
  competitive: 'the student',
  diligent: 'the student',
  eager: 'the student',
  envious: 'the student',
  familiar: 'the student',
  grateful: 'the student',
  greedy: 'the student',
  happy: 'the student',
  hungry: 'the student',
  impolite: 'the student',
  impudent: 'the student',
  'in bad shape': 'the equipment',
  intimate: 'the student',
  kind: 'the student',
  likable: 'the student',
  lonely: 'the student',
  mischievous: 'the student',
  miserable: 'the student',
  missing: 'the item',
  nervous: 'the student',
  obedient: 'the student',
  overwhelming: 'the task',
  patient: 'the student',
  polite: 'the student',
  'quick-tempered': 'the student',
  sad: 'the student',
  serious: 'the student',
  skillful: 'the student',
  sleepy: 'the student',
  smart: 'the student',
  sore: 'the student',
  'strong-willed': 'the student',
  'tender-hearted': 'the student',
  timid: 'the student',
  unavoidable: 'the situation',
  unfair: 'the situation',
  young: 'the student',
  youthful: 'the student',
};

const ADJECTIVE_ATTRIBUTIVE_NOUNS = {
  apologetic: 'student',
  careful: 'student',
  clever: 'student',
  competitive: 'student',
  diligent: 'student',
  eager: 'student',
  envious: 'student',
  familiar: 'student',
  grateful: 'student',
  greedy: 'student',
  happy: 'student',
  hungry: 'student',
  impolite: 'student',
  impudent: 'student',
  intimate: 'student',
  kind: 'student',
  likable: 'student',
  lonely: 'student',
  mischievous: 'student',
  miserable: 'student',
  nervous: 'student',
  obedient: 'student',
  patient: 'student',
  polite: 'student',
  'quick-tempered': 'student',
  sad: 'student',
  serious: 'student',
  skillful: 'student',
  sleepy: 'student',
  smart: 'student',
  sore: 'student',
  'strong-willed': 'student',
  'tender-hearted': 'student',
  timid: 'student',
  young: 'student',
  youthful: 'student',
};

const STATIVE_ACTIONS = new Set(['be', 'exist', 'live', 'remain', 'stay']);
const OBJECT_NEEDING_PREPOSITION_RE = /\b(?:with|to|for|from|over|into|at|on|in|about|of|after)$/;
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
  if (JP_RE.test(cleaned) || /expression for/.test(cleaned)) return 'do it';
  if (cleaned === 'do' || cleaned === 'be able to') return 'do it';
  if (cleaned === 'to') return 'notice it';
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

function completeActiveAction(action) {
  if (isBePhrase(action)) return action;
  if (OBJECT_NEEDING_PREPOSITION_RE.test(action)) return `${action} it`;
  return action;
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
  const activeAction = completeActiveAction(action);
  if (type.includes('potential')) {
    if (type.includes('past-negative')) return `was not able to ${activeAction}`;
    if (type.includes('negative')) return `cannot ${activeAction}`;
    if (type.includes('past')) return `was able to ${activeAction}`;
    return `can ${activeAction}`;
  }
  if (type.includes('desiderative')) {
    if (type.includes('past-negative')) return `did not want to ${activeAction}`;
    if (type.includes('negative')) return `do not want to ${activeAction}`;
    if (type.includes('past')) return `wanted to ${activeAction}`;
    return `want to ${activeAction}`;
  }
  if (type.includes('progressive')) {
    if (type.includes('past-negative')) return `had not been ${gerundPhrase(activeAction)}`;
    if (type.includes('negative')) return `am not ${gerundPhrase(activeAction)}`;
    if (type.includes('past')) return `was ${gerundPhrase(activeAction)}`;
    return `am ${gerundPhrase(activeAction)}`;
  }
  if (type.includes('causative-passive')) {
    if (type.includes('past-negative')) return `was not made to ${activeAction}`;
    if (type.includes('negative')) return `am not made to ${activeAction}`;
    if (type.includes('past')) return `was made to ${activeAction}`;
    return `am made to ${activeAction}`;
  }
  if (type.includes('passive')) {
    if (type.includes('past-negative')) return passivePhrase(action, 'past-negative');
    if (type.includes('negative')) return passivePhrase(action, 'negative');
    if (type.includes('past')) return passivePhrase(action, 'past');
    return passivePhrase(action);
  }
  if (type.includes('causative')) {
    const caused = isBePhrase(action) ? beComplement(action) : activeAction;
    if (type.includes('past-negative')) return `did not make me ${caused}`;
    if (type.includes('negative')) return `does not make me ${caused}`;
    if (type.includes('past')) return `made me ${caused}`;
    return `makes me ${caused}`;
  }
  switch (type) {
    case 'plain-past':
    case 'polite-past':
      return simplePastPhrase(activeAction);
    case 'plain-negative':
    case 'polite-negative':
      return negativePresent(activeAction);
    case 'plain-past-negative':
    case 'polite-past-negative':
      return negativePast(activeAction);
    default:
      return present(activeAction);
  }
}

function conditionalAction(action, type) {
  const activeAction = completeActiveAction(action);
  if (type.includes('potential')) {
    return type.includes('negative') ? `I cannot ${activeAction}` : `I can ${activeAction}`;
  }
  if (type.includes('causative-passive')) {
    return type.includes('negative')
      ? `I am not made to ${activeAction}`
      : `I am made to ${activeAction}`;
  }
  if (type.includes('passive')) {
    const phrase = passivePhrase(action, type.includes('negative') ? 'negative' : 'present');
    if (phrase.startsWith('am not ')) return `I am not ${phrase.slice(7)}`;
    if (phrase.startsWith('am ')) return `I am ${phrase.slice(3)}`;
    return `I ${phrase}`;
  }
  if (type.includes('causative')) {
    return type.includes('negative')
      ? `the teacher does not make me ${activeAction}`
      : `the teacher makes me ${activeAction}`;
  }
  if (type.includes('negative')) return `I ${negativePresent(activeAction)}`;
  return `I ${present(activeAction)}`;
}

function conditionalOutcome(type) {
  if (type.includes('negative')) return 'I will adjust the plan';
  if (type.includes('potential')) return 'we can move forward';
  if (type.includes('causative') || type.includes('passive')) return 'it will be easier to check';
  return 'I can plan around it';
}

function verbEnglish(word, type) {
  const action = actionPhrase(word);
  const activeAction = completeActiveAction(action);
  if (type === 'te-form') return `Today, I ${present(activeAction)} with a friend and talk.`;
  if (type === 'negative-te' || type === 'negative-te-connective' || type === 'negative-zuni') {
    return `Today, I went home without ${gerundPhrase(activeAction)}.`;
  }
  if (type === 'request-kudasai') return `Please ${activeAction} here.`;
  if (type === 'negative-request') return `Please do not ${activeAction} here.`;
  if (type === 'permission') return `I may ${activeAction} today.`;
  if (type === 'obligation') return `I have to ${activeAction} today.`;
  if (type === 'prohibition') return `Do not ${activeAction} here.`;
  if (type === 'imperative' || type === 'command-nasai') return `${capitalize(activeAction)} now.`;
  if (type === 'polite-volitional' || type === 'volitional') {
    return `Let's ${activeAction} together tomorrow.`;
  }
  if (type.includes('conditional') || type.endsWith('-ba')) {
    return `If ${conditionalAction(action, type)} tomorrow, ${conditionalOutcome(type)}.`;
  }
  if (type === 'conjectural') return `I am sure I will ${activeAction} tomorrow.`;
  if (type.startsWith('honorific')) return `The teacher ${thirdPersonPhrase(activeAction)} today.`;
  if (type.startsWith('humble')) return `I ${present(activeAction)} today.`;
  if (type.includes('progressive')) {
    const phrase = actionForType(action, type).replace(/^am /, 'is ').replace(/^was /, 'was ');
    return `A friend ${phrase} now.`;
  }
  if (type.includes('causative-passive')) return `I ${actionForType(action, type)} today.`;
  if (type.includes('passive')) return passiveSentence(action, type);
  if (type.includes('causative')) return `The teacher ${actionForType(action, type)} today.`;
  if (type.includes('potential')) {
    if (type.includes('past-negative')) return `I was not able to ${activeAction} today either.`;
    if (type.includes('negative')) return `I cannot ${activeAction} today either.`;
    if (type.includes('past')) return `I was also able to ${activeAction} today.`;
    return `I can also ${activeAction} today.`;
  }
  return `I also ${actionForType(action, type)} today.`;
}

function adjectiveEnglish(word, type) {
  const adj = adjectivePhrase(word);
  const presentSubject = adjectiveSubject(adj, 'today');
  const conditionalSubject = adjectiveSubject(adj, 'tomorrow');
  const roomSubject = adjectiveSubject(adj, 'the room');
  const skySubject = adjectiveSubject(adj, 'the sky');
  if (type === 'adj-te-form') {
    return ADJECTIVE_SUBJECT_OVERRIDES[adj]
      ? `${adjectiveClause(presentSubject, 'is', adj)}, so I feel good.`
      : `Today it is ${adj}, so I feel good.`;
  }
  if (type === 'adj-negative-te-form') {
    return ADJECTIVE_SUBJECT_OVERRIDES[adj]
      ? `${adjectiveClause(presentSubject, 'is not', adj)}, so I am having trouble.`
      : `Today it is not ${adj}, so I am having trouble.`;
  }
  if (type === 'adj-adverb') return `The teacher speaks in a ${adj} way.`;
  if (type === 'adj-attributive') {
    const noun = ADJECTIVE_ATTRIBUTIVE_NOUNS[adj];
    return noun ? `I met a ${adj} ${noun} today.` : `Today is a ${adj} day.`;
  }
  if (type === 'adj-conditional') {
    return `If ${conditionalSubject} is ${adj}, I want to go.`;
  }
  if (type === 'adj-negative-conditional') {
    return `If ${conditionalSubject} is not ${adj}, I want to go.`;
  }
  if (type === 'adj-tara') return `If ${conditionalSubject} is ${adj}, I will stay home.`;
  if (type === 'adj-negative-tara') {
    return `If ${conditionalSubject} is not ${adj}, I will stay home.`;
  }
  if (type === 'adj-sou') return `${adjectiveClause(skySubject, 'looks', adj)}.`;
  if (type === 'adj-sugiru') return `${adjectiveClause(roomSubject, 'is too', adj)}.`;
  if (type === 'adj-naru') return `${adjectiveClause(roomSubject, 'gets', adj)}.`;
  if (type.includes('past-negative')) return `${adjectiveClause(presentSubject, 'was not', adj)}.`;
  if (type.includes('negative')) return `${adjectiveClause(presentSubject, 'is not', adj)}.`;
  if (type.includes('past')) return `${adjectiveClause(presentSubject, 'was', adj)}.`;
  return `${adjectiveClause(presentSubject, 'is', adj)}.`;
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function adjectiveSubject(adj, fallback) {
  return ADJECTIVE_SUBJECT_OVERRIDES[adj] || fallback;
}

function adjectiveClause(subject, verb, adj) {
  return `${capitalize(subject)} ${verb} ${adj}`;
}

export function sentenceEnglish(word, type) {
  return isAdjective(word) || type.startsWith('adj-')
    ? adjectiveEnglish(word, type)
    : verbEnglish(word, type);
}
