import {
  REVIEWED_SENTENCE_PROFILE_VERSION,
  reviewedSentenceProfile,
} from '../data/reviewedSentenceProfiles.js';
import { conjugateItem, surfaceFormFor } from './conjugator.js';
import { gerund, pastParticiple, simplePast, thirdPerson } from './display.js';

// Reviewed grammar frames share one lexical context on both language sides.
// They do not certify the old corpus or invent a context for an unknown word.
export const REVIEWED_SENTENCE_FRAME_VERSION = '2026-10-07.1';

const PLURAL_SUBJECTS = new Set([
  'we',
  'they',
  'these shoes',
  'the students',
  'the flowers',
  'the leaves',
  'the clothes',
  'the stars',
  'the types',
  'the people here',
  'these vegetables',
]);
const cap = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const lowerSubject = (value) =>
  value === 'I' ? value : value.charAt(0).toLowerCase() + value.slice(1);
const plural = (subject) => PLURAL_SUBJECTS.has(subject.toLowerCase());

function be(subject, past = false) {
  if (subject === 'I') return past ? 'was' : 'am';
  return plural(subject) ? (past ? 'were' : 'are') : past ? 'was' : 'is';
}

function inflect(action, kind) {
  const [head, ...rest] = action.split(' ');
  const overrides = {
    past: {
      admit: 'admitted',
      blow: 'blew',
      drop: 'dropped',
      fit: 'fit',
      plan: 'planned',
      ring: 'rang',
      slide: 'slid',
      stick: 'stuck',
      wrap: 'wrapped',
    },
    gerund: {
      begin: 'beginning',
      cut: 'cutting',
      drop: 'dropping',
      fit: 'fitting',
      forget: 'forgetting',
      hit: 'hitting',
      put: 'putting',
      stop: 'stopping',
      swim: 'swimming',
      sit: 'sitting',
      get: 'getting',
      admit: 'admitting',
      plan: 'planning',
      shop: 'shopping',
      win: 'winning',
      wrap: 'wrapping',
    },
    present: { have: 'has' },
  };
  const transform = { past: simplePast, participle: pastParticiple, gerund, present: thirdPerson }[
    kind
  ];
  const first = overrides[kind]?.[head] || transform(head);
  return [first, ...rest].join(' ');
}

function finite(subject, action, { past = false, negative = false } = {}) {
  if (action.startsWith('be ')) {
    return `${subject} ${be(subject, past)}${negative ? ' not' : ''} ${action.slice(3)}`;
  }
  if (negative) {
    return `${subject} ${past ? 'did' : subject === 'I' || plural(subject) ? 'do' : 'does'} not ${action}`;
  }
  return `${subject} ${past ? inflect(action, 'past') : subject === 'I' || plural(subject) ? action : inflect(action, 'present')}`;
}

const CORE_TYPES = new Set([
  'plain-present',
  'polite-present',
  'plain-past',
  'polite-past',
  'plain-negative',
  'polite-negative',
  'plain-past-negative',
  'polite-past-negative',
]);
const flagsFor = (type) => ({ past: type.includes('past'), negative: type.includes('negative') });

// Explicitly reviewed direct passives. The receiver and agent are present on
// both sides; intransitive suffering passives need individual examples instead.
const PASSIVES = {
  'godan:読む': ['この本は学生に', 'this book', 'read by a student'],
  'godan:書く': ['この手紙は先生に', 'this letter', 'written by the teacher'],
  'godan:買う': ['この本は学生に', 'this book', 'bought by a student'],
  'godan:売る': ['この本は店員に', 'this book', 'sold by a shop assistant'],
  'godan:作る': ['この料理は母に', 'this dish', 'made by my mother'],
  'godan:洗う': ['この皿は父に', 'this plate', 'washed by my father'],
  'godan:使う': ['この道具は先生に', 'this tool', 'used by the teacher'],
  'godan:運ぶ': ['この箱は学生に', 'this box', 'carried by a student'],
  'godan:呼ぶ': ['私は先生に', 'I', 'called by the teacher'],
  'godan:叱る': ['私は先生に', 'I', 'scolded by the teacher'],
  'ichidan:食べる': ['このパンは子どもに', 'this bread', 'eaten by a child'],
  'ichidan:見る': ['この映画は学生に', 'this film', 'watched by a student'],
  'ichidan:教える': ['日本語は先生に', 'Japanese', 'taught by the teacher'],
  'ichidan:開ける': ['この窓は先生に', 'this window', 'opened by the teacher'],
  'ichidan:閉める': ['この窓は先生に', 'this window', 'closed by the teacher'],
  'ichidan:褒める': ['私は先生に', 'I', 'praised by the teacher'],
  'suru:説明する': ['この問題は先生に', 'this problem', 'explained by the teacher'],
  'suru:翻訳する': ['この手紙は先生に', 'this letter', 'translated by the teacher'],
};

// Keigo needs a social relationship. Humble clauses name the respected recipient
// rather than applying お〜する to arbitrary self-directed actions.
const KEIGO = {
  'godan:読む': [
    '先生は本を',
    'The teacher reads a book.',
    '私は先生に手紙を',
    'I read a letter to the teacher.',
  ],
  'godan:書く': [
    '先生は手紙を',
    'The teacher writes a letter.',
    '私は先生に手紙を',
    'I write a letter to the teacher.',
  ],
  'godan:話す': [
    '先生は日本語を',
    'The teacher speaks Japanese.',
    '私は先生に予定を',
    'I tell the teacher my plans.',
  ],
  'godan:待つ': [
    '先生は友だちを',
    'The teacher waits for a friend.',
    '私は先生を',
    'I wait for the teacher.',
  ],
  'godan:持つ': [
    '先生はかばんを',
    'The teacher holds a bag.',
    '私は先生のかばんを',
    "I carry the teacher's bag.",
  ],
  'godan:会う': [
    '先生は友だちに',
    'The teacher meets a friend.',
    '私は先生に',
    'I meet the teacher.',
  ],
  'godan:行く': [
    '先生は学校へ',
    'The teacher goes to school.',
    '私は先生の家へ',
    "I go to the teacher's house.",
  ],
  'godan:飲む': [
    '先生はお茶を',
    'The teacher drinks tea.',
    '私は先生にいただいたお茶を',
    'I drink the tea I received from the teacher.',
  ],
  'ichidan:食べる': [
    '先生は昼食を',
    'The teacher eats lunch.',
    '私は先生にいただいたパンを',
    'I eat the bread I received from the teacher.',
  ],
  'ichidan:見る': [
    '先生は写真を',
    'The teacher looks at a photo.',
    '私は先生の写真を',
    "I look at the teacher's photo.",
  ],
  'ichidan:見せる': [
    '先生は写真を',
    'The teacher shows a photo.',
    '私は先生に写真を',
    'I show a photo to the teacher.',
  ],
  'ichidan:教える': [
    '先生は日本語を',
    'The teacher teaches Japanese.',
    '私は先生に使い方を',
    'I explain how to use it to the teacher.',
  ],
  'kuru:来る': [
    '先生は学校に',
    'The teacher comes to school.',
    '私は先生の家に',
    "I come to the teacher's house.",
  ],
};

const ADVERBS = {
  'i-adjective:大きい': [
    '名前を{w}書く。',
    'I write my name in large letters.',
    'large (letter size)',
  ],
  'i-adjective:小さい': ['名前を{w}書く。', 'I write my name in small letters.'],
  'i-adjective:早い': ['朝{w}起きる。', 'I get up early in the morning.'],
  'i-adjective:速い': ['公園を{w}走る。', 'I run quickly through the park.'],
  'i-adjective:明るい': ['部屋を{w}する。', 'I make the room bright.'],
  'i-adjective:暗い': ['部屋を{w}する。', 'I make the room dark.'],
  'i-adjective:強い': ['ロープを{w}引く。', 'I pull the rope strongly.'],
  'i-adjective:弱い': ['ロープを{w}引く。', 'I pull the rope weakly.'],
  'i-adjective:高い': ['ボールを{w}投げる。', 'I throw the ball high.', 'high (height)'],
  'i-adjective:安い': ['本を{w}買う。', 'I buy a book cheaply.'],
  'i-adjective:長い': ['ロープを{w}切る。', 'I cut the rope into a long piece.'],
  'i-adjective:短い': ['髪を{w}切る。', 'I cut my hair short.'],
  'i-adjective:新しい': ['かばんを{w}する。', 'I replace my bag with a new one.'],
  'i-adjective:赤い': ['壁を{w}塗る。', 'I paint the wall red.'],
  'i-adjective:青い': ['壁を{w}塗る。', 'I paint the wall blue.'],
  'i-adjective:白い': ['壁を{w}塗る。', 'I paint the wall white.'],
  'i-adjective:黒い': ['壁を{w}塗る。', 'I paint the wall black.'],
  'i-adjective:黄色い': ['壁を{w}塗る。', 'I paint the wall yellow.'],
  'i-adjective:正しい': ['名前を{w}書く。', 'I write my name correctly.'],
  'i-adjective:詳しい': [
    '先生は使い方を{w}説明する。',
    'The teacher explains how to use it in detail.',
  ],
  'i-adjective:優しい': ['子どもに{w}話す。', 'I speak gently to a child.', 'gentle'],
  'na-adjective:静か': ['図書館で{w}話す。', 'I speak quietly in the library.'],
  'na-adjective:元気': ['子どもは{w}遊ぶ。', 'The child plays energetically.'],
  'na-adjective:丁寧': ['名前を{w}書く。', 'I write my name carefully.', 'careful'],
  'na-adjective:きれい': ['部屋を{w}する。', 'I make the room clean.'],
  'na-adjective:綺麗': ['部屋を{w}する。', 'I make the room clean.'],
  'na-adjective:簡単': [
    '先生は使い方を{w}説明する。',
    'The teacher explains how to use it simply.',
  ],
  'na-adjective:親切': ['先生は道を{w}教える。', 'The teacher kindly gives directions.'],
  'na-adjective:熱心': ['日本語を{w}勉強する。', 'I study Japanese enthusiastically.'],
  'na-adjective:まじめ': ['日本語を{w}勉強する。', 'I study Japanese seriously.'],
  'na-adjective:真面目': ['日本語を{w}勉強する。', 'I study Japanese seriously.'],
};

const VOLITIONAL_ACTIONS = {
  'godan:言う': 'say our names',
  'ichidan:上げる': 'raise our hands',
  'ichidan:着る': 'put on our jackets',
  'godan:脱ぐ': 'take off our jackets',
  'ichidan:締める': 'fasten our belts',
};

function adjectiveSentence(profile, type, key) {
  if (!type.startsWith('adj-') || profile.exclude?.includes(type)) return null;
  if (profile.kind === 'special-adjective') {
    const core = type.replace(/^adj-/, '');
    if (!CORE_TYPES.has(core)) return null;
    const { past, negative } = flagsFor(type);
    const form = past ? (negative ? 'pastNegative' : 'past') : negative ? 'negative' : 'positive';
    return [`${profile.ja}{w}。`, profile.forms[form]];
  }
  const { subjectJa, subjectEn, adjective } = profile;
  const core = type.replace(/^adj-/, '');
  if (CORE_TYPES.has(core)) {
    return [`${subjectJa}は{w}。`, `${cap(finite(subjectEn, `be ${adjective}`, flagsFor(type)))}.`];
  }
  if (type === 'adj-adverb') return ADVERBS[key] || null;
  if (type === 'adj-attributive') {
    if (!subjectJa.startsWith('この') || !subjectEn.startsWith('this ')) return null;
    return [
      `この{w}${subjectJa.slice(2)}について話した。`,
      `I talked about this ${adjective} ${subjectEn.slice(5)}.`,
    ];
  }
  if (['adj-te-form', 'adj-negative-te-form'].includes(type)) {
    const state = finite(subjectEn, `be ${adjective}`, { negative: type.includes('negative') });
    return [`${subjectJa}は{w}、先生に伝える。`, `${cap(state)}, so I will tell the teacher.`];
  }
  if (
    ['adj-conditional', 'adj-tara', 'adj-negative-conditional', 'adj-negative-tara'].includes(type)
  ) {
    const state = finite(lowerSubject(subjectEn), `be ${adjective}`, {
      negative: type.includes('negative'),
    });
    return [`もし${subjectJa}が{w}、先生に伝える。`, `If ${state}, I will tell the teacher.`];
  }
  if (type === 'adj-sou') {
    const look = subjectEn === 'I' || plural(subjectEn) ? 'look' : 'looks';
    return [`${subjectJa}は{w}だ。`, `${cap(subjectEn)} ${look} ${adjective}.`];
  }
  if (type === 'adj-sugiru') {
    return [`${subjectJa}は{w}。`, `${cap(finite(subjectEn, `be too ${adjective}`))}.`];
  }
  if (type === 'adj-naru') {
    const become = subjectEn === 'I' || plural(subjectEn) ? 'become' : 'becomes';
    const result = key === 'i-adjective:早い' ? 'earlier' : adjective;
    return [`${subjectJa}が{w}。`, `${cap(subjectEn)} ${become} ${result}.`];
  }
  return null;
}

function verbSentence(profile, type, key) {
  if (type.startsWith('adj-')) return null;
  const { subjectJa, subjectEn, action, ja, flags, aspect } = profile;
  const { past, negative } = flagsFor(type);
  const prefix = `${subjectJa}${ja}`;
  if (CORE_TYPES.has(type)) {
    const form = past ? (negative ? 'pastNegative' : 'past') : negative ? 'negative' : 'positive';
    return [
      `${prefix}{w}。`,
      profile.coreEnglish?.[form] || `${cap(finite(subjectEn, action, { past, negative }))}.`,
    ];
  }
  if (type.startsWith('progressive')) {
    if (!aspect) return null;
    const state = aspect === 'ongoing' ? `be ${inflect(action, 'gerund')}` : aspect;
    return [`${prefix}{w}。`, `${cap(finite(subjectEn, state, { past, negative }))}.`];
  }
  if (type.startsWith('honorific') || type.startsWith('humble')) {
    const entry = KEIGO[key];
    if (!entry) return null;
    return type.startsWith('honorific')
      ? [`${entry[0]}{w}。`, entry[1]]
      : [`${entry[2]}{w}。`, entry[3]];
  }
  if (type.startsWith('passive')) {
    const entry = PASSIVES[key];
    if (!entry) return null;
    if (type.includes('conditional')) {
      const condition = finite(entry[1], `be ${entry[2]}`, { negative });
      return [`もし${entry[0]}{w}、どうなりますか。`, `What happens if ${condition}?`];
    }
    return [`${entry[0]}{w}。`, `${cap(finite(entry[1], `be ${entry[2]}`, { past, negative }))}.`];
  }
  if (!flags.includes('a') || subjectEn !== 'I') return null;
  const conditionSubject = subjectJa.replace(/は$/, 'が');
  if (type.includes('causative-passive')) {
    const condition = `I ${be('I', past)}${negative ? ' not' : ''} made to ${action} by the teacher`;
    return type.includes('conditional')
      ? [`もし私は先生に${ja}{w}、どうなりますか。`, `What happens if ${lowerSubject(condition)}?`]
      : [`私は先生に${ja}{w}。`, `${condition}.`];
  }
  if (type.includes('causative')) {
    const causee = flags.includes('t') || ja.includes('を') ? 'に' : 'を';
    const state = finite('the teacher', `make me ${action}`, { past, negative });
    return type.includes('conditional')
      ? [`もし先生が私${causee}${ja}{w}、どうなりますか。`, `What happens if ${state}?`]
      : [`先生は私${causee}${ja}{w}。`, `${cap(state)}.`];
  }
  if (type.includes('potential')) {
    const state = past
      ? `I was${negative ? ' not' : ''} able to ${action}`
      : `I ${negative ? 'cannot' : 'can'} ${action}`;
    return type.includes('conditional')
      ? [`もし${conditionSubject}${ja}{w}、どうなりますか。`, `What happens if ${state}?`]
      : [`${prefix}{w}。`, `${state}.`];
  }
  if (type.includes('desiderative')) {
    return [`${prefix}{w}。`, `${cap(finite('I', `want to ${action}`, { past, negative }))}.`];
  }
  if (type.includes('conditional')) {
    return [
      `もし${conditionSubject}${ja}{w}、どうなりますか。`,
      `What happens if ${finite('I', action, { negative })}?`,
    ];
  }
  if (type === 'conjectural') return [`${prefix}{w}。`, `I will probably ${action}.`];
  if (['volitional', 'polite-volitional'].includes(type))
    return [`${ja}{w}。`, `Let's ${VOLITIONAL_ACTIONS[key] || action.replace(/\bmy\b/g, 'our')}.`];
  if (type === 'te-form')
    return [
      `${prefix}{w}、日記を書いた。`,
      `I ${inflect(action, 'past')}, then wrote in my diary.`,
    ];
  if (['negative-te', 'negative-zuni'].includes(type)) {
    return [`${prefix}{w}、そのことを後悔した。`, `I regretted not ${inflect(action, 'gerund')}.`];
  }
  if (type === 'negative-te-connective') {
    return [`${prefix}{w}、困った。`, `I did not ${action}, which was a problem.`];
  }
  const addresseeAction = action.replace(/\bmy\b/g, 'your');
  if (type === 'request-kudasai') return [`${ja}{w}。`, `Please ${addresseeAction}.`];
  if (type === 'negative-request') return [`${ja}{w}。`, `Please do not ${addresseeAction}.`];
  if (type === 'prohibition') return [`${ja}{w}。`, `Do not ${addresseeAction}!`];
  if (['imperative', 'command-nasai'].includes(type))
    return [`${ja}{w}。`, `${cap(addresseeAction)}!`];
  if (type === 'permission') return [`${prefix}{w}。`, `I may ${action}.`];
  if (type === 'obligation') return [`${prefix}{w}。`, `I must ${action}.`];
  return null;
}

/**
 * Return only an explicitly reviewed lexical context and compatible grammar
 * frame. null is intentional when a form needs an individual example.
 */
export function buildReviewedSentence(word, type) {
  const profile = reviewedSentenceProfile(word);
  if (!profile) return null;
  const surface = surfaceFormFor(word, type);
  const kana = conjugateItem(word, type);
  if (!surface || !kana || !/^[\u3040-\u30ff\s]+$/u.test(kana)) return null;
  const key = `${word.group}:${word.dict}`;
  const sentence =
    profile.kind === 'verb'
      ? verbSentence(profile, type, key)
      : adjectiveSentence(profile, type, key);
  if (!sentence) return null;
  const [jaTemplate, en, frameSense] = sentence;
  if (jaTemplate.split('{w}').length !== 2) return null;
  return {
    jaTemplate,
    en,
    surface,
    kana,
    sense: frameSense || profile.sense,
    basis: 'explicit-bilingual-profile-and-compatible-frame',
    profileVersion: REVIEWED_SENTENCE_PROFILE_VERSION,
    frameVersion: REVIEWED_SENTENCE_FRAME_VERSION,
  };
}
