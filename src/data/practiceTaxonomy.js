import { ALL_CARD_TYPES, FORM_GROUPS } from './conjugationTypes.js';

const TYPE_ID_SET = new Set(ALL_CARD_TYPES.map((type) => type.id));
const FORM_GROUP_BY_ID = new Map(FORM_GROUPS.map((group) => [group.id, group]));

function uniqueTypeIds(typeIds = []) {
  return [...new Set(typeIds)].filter((typeId) => TYPE_ID_SET.has(typeId));
}

function typeIdsForGroups(...groupIds) {
  return uniqueTypeIds(groupIds.flatMap((groupId) => FORM_GROUP_BY_ID.get(groupId)?.typeIds || []));
}

export const PRACTICE_CATEGORIES = [
  {
    id: 'core-forms',
    label: 'Core forms',
    description: 'Everyday present, past, negative, and polite verb forms.',
    previewParts: [
      { pattern: '〜ない', meaning: 'not' },
      { pattern: '〜た', meaning: 'past' },
      { pattern: '〜ます', meaning: 'polite' },
    ],
    typeIds: uniqueTypeIds([...typeIdsForGroups('basic-tenses'), 'plain-past']),
  },
  {
    id: 'te-form',
    label: 'Te-form',
    description: 'Connect actions and build many common sentence patterns.',
    previewParts: [{ pattern: '〜て / 〜で', meaning: 'connect' }],
    typeIds: ['te-form'],
  },
  {
    id: 'wants-intentions',
    label: 'Wants & intentions',
    description: 'Say what someone wants or intends to do.',
    previewParts: [
      { pattern: '〜たい', meaning: 'want' },
      { pattern: '〜おう / 〜よう', meaning: 'intend' },
      { pattern: '〜ましょう', meaning: "let's" },
    ],
    typeIds: typeIdsForGroups('volitional', 'wanting'),
  },
  {
    id: 'ability-ongoing',
    label: 'Ability & ongoing',
    description: 'Practice can-do forms and actions or states in progress.',
    previewParts: [
      { pattern: 'e-row＋る / 〜られる', meaning: 'can' },
      { pattern: '〜ている', meaning: 'ongoing' },
    ],
    typeIds: typeIdsForGroups('potential', 'progressive'),
  },
  {
    id: 'conditions-guesses',
    label: 'Conditions & guesses',
    description: 'Build if, when, and probable statements.',
    previewParts: [
      { pattern: '〜たら / 〜ば / 〜なら', meaning: 'if' },
      { pattern: '〜だろう', meaning: 'probably' },
    ],
    typeIds: typeIdsForGroups('conditional', 'conjecture'),
  },
  {
    id: 'requests-permission-obligation',
    label: 'Requests & rules',
    description: 'Ask, allow, and express what must be done.',
    previewParts: [
      { pattern: '〜てください', meaning: 'please' },
      { pattern: '〜てもいい', meaning: 'may' },
      { pattern: '〜なければならない', meaning: 'must' },
    ],
    typeIds: typeIdsForGroups('requests', 'permission', 'obligation'),
  },
  {
    id: 'commands-prohibitions',
    label: 'Commands & prohibitions',
    description: 'Tell someone what to do or not do.',
    previewParts: [
      { pattern: '命令形', meaning: 'do!' },
      { pattern: '〜なさい', meaning: 'command' },
      { pattern: '辞書形＋な', meaning: "don't" },
    ],
    typeIds: typeIdsForGroups('commands'),
  },
  {
    id: 'passive-causative',
    label: 'Passive & causative',
    description: 'Shift viewpoint or express making and allowing actions.',
    previewParts: [
      { pattern: '〜(ら)れる', meaning: 'passive' },
      { pattern: '〜(さ)せる', meaning: 'make/let' },
      { pattern: '〜(さ)せられる', meaning: 'made to' },
    ],
    typeIds: typeIdsForGroups('passive', 'causative', 'causative-passive'),
  },
  {
    id: 'keigo',
    label: 'Keigo',
    description: 'Practice honorific and humble language.',
    previewParts: [
      { pattern: 'お/ご〜になる', meaning: 'honorific' },
      { pattern: 'お/ご〜する', meaning: 'humble' },
    ],
    typeIds: typeIdsForGroups('honorific', 'humble'),
  },
  {
    id: 'connecting-forms',
    label: 'Connecting forms',
    description: 'Connect actions with negative and formal linking forms.',
    previewParts: [
      { pattern: '〜ないで', meaning: 'without' },
      { pattern: '〜なくて', meaning: 'and/because' },
      { pattern: '〜ずに', meaning: 'formal without' },
    ],
    typeIds: typeIdsForGroups('negative-connectors'),
  },
  {
    id: 'adjectives',
    label: 'Adjectives',
    description: 'Conjugate, connect, and reshape adjective forms.',
    previewParts: [
      { pattern: '〜くない / ではない', meaning: 'not' },
      { pattern: '〜くて / で', meaning: 'connect' },
      { pattern: '〜そう', meaning: 'looks' },
    ],
    typeIds: typeIdsForGroups(
      'adjective-core',
      'adjective-connectors',
      'adjective-conditionals',
      'adjective-patterns',
    ),
  },
];

export const DEFAULT_PRACTICE_CATEGORY_ID = 'core-forms';

export const PRACTICE_FILTERS = [
  {
    id: 'time',
    label: 'Time',
    options: [
      { id: 'all', label: 'All' },
      { id: 'nonpast', label: 'Non-past' },
      { id: 'past', label: 'Past' },
    ],
  },
  {
    id: 'polarity',
    label: 'Polarity',
    options: [
      { id: 'all', label: 'All' },
      { id: 'positive', label: 'Positive' },
      { id: 'negative', label: 'Negative' },
    ],
  },
  {
    id: 'style',
    label: 'Style',
    options: [
      { id: 'all', label: 'All' },
      { id: 'plain', label: 'Plain' },
      { id: 'polite', label: 'Polite' },
    ],
  },
];

export const DEFAULT_PRACTICE_FILTERS = Object.freeze({
  time: 'all',
  polarity: 'all',
  style: 'all',
});

const CATEGORY_BY_TYPE_ID = new Map(
  PRACTICE_CATEGORIES.flatMap((category) => category.typeIds.map((typeId) => [typeId, category])),
);

const PAST_TYPE_IDS = new Set(
  ALL_CARD_TYPES.map((type) => type.id).filter((typeId) => typeId.includes('-past')),
);
const NONPAST_TYPE_IDS = new Set();
for (const typeId of PAST_TYPE_IDS) {
  const counterpart = typeId.replace('-past', '');
  if (TYPE_ID_SET.has(counterpart)) NONPAST_TYPE_IDS.add(counterpart);
}
for (const typeId of [
  'plain-present',
  'polite-present',
  'adj-plain-present',
  'adj-polite-present',
]) {
  NONPAST_TYPE_IDS.add(typeId);
}

const NEGATIVE_TYPE_IDS = new Set(
  ALL_CARD_TYPES.map((type) => type.id).filter(
    (typeId) => typeId.includes('negative') || typeId === 'prohibition',
  ),
);
const POSITIVE_TYPE_IDS = new Set();
for (const typeId of NEGATIVE_TYPE_IDS) {
  const candidates = [
    typeId.replace(/^negative-/, ''),
    typeId.replace('-negative-', '-'),
    typeId.replace('-negative', ''),
  ];
  const counterpart = candidates.find((candidate) => TYPE_ID_SET.has(candidate));
  if (counterpart) POSITIVE_TYPE_IDS.add(counterpart);
}
for (const [negative, positive] of Object.entries({
  'plain-negative': 'plain-present',
  'polite-negative': 'polite-present',
  'adj-plain-negative': 'adj-plain-present',
  'adj-polite-negative': 'adj-polite-present',
  'negative-request': 'request-kudasai',
  prohibition: 'imperative',
})) {
  if (NEGATIVE_TYPE_IDS.has(negative)) POSITIVE_TYPE_IDS.add(positive);
}
POSITIVE_TYPE_IDS.add('command-nasai');

const POLITE_TYPE_IDS = new Set(
  ALL_CARD_TYPES.map((type) => type.id).filter(
    (typeId) =>
      typeId.includes('polite') ||
      typeId === 'command-nasai' ||
      typeId === 'request-kudasai' ||
      typeId === 'negative-request',
  ),
);
const PLAIN_TYPE_IDS = new Set();
for (const typeId of POLITE_TYPE_IDS) {
  const counterpart = typeId.replace('-polite', '');
  if (TYPE_ID_SET.has(counterpart)) PLAIN_TYPE_IDS.add(counterpart);
}
for (const [polite, plain] of Object.entries({
  'polite-present': 'plain-present',
  'polite-past': 'plain-past',
  'polite-negative': 'plain-negative',
  'polite-past-negative': 'plain-past-negative',
  'polite-volitional': 'volitional',
  'adj-polite-present': 'adj-plain-present',
  'adj-polite-past': 'adj-plain-past',
  'adj-polite-negative': 'adj-plain-negative',
  'adj-polite-past-negative': 'adj-plain-past-negative',
  'command-nasai': 'imperative',
})) {
  if (POLITE_TYPE_IDS.has(polite)) PLAIN_TYPE_IDS.add(plain);
}

export function practiceCategoryForType(typeId) {
  return CATEGORY_BY_TYPE_ID.get(typeId) || null;
}

export function practiceDimensionsForType(typeId) {
  return {
    time: PAST_TYPE_IDS.has(typeId) ? 'past' : NONPAST_TYPE_IDS.has(typeId) ? 'nonpast' : 'neutral',
    polarity: NEGATIVE_TYPE_IDS.has(typeId)
      ? 'negative'
      : POSITIVE_TYPE_IDS.has(typeId)
        ? 'positive'
        : 'neutral',
    style: POLITE_TYPE_IDS.has(typeId)
      ? 'polite'
      : PLAIN_TYPE_IDS.has(typeId)
        ? 'plain'
        : 'neutral',
  };
}
