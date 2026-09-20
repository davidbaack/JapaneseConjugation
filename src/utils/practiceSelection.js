import { ALL_CARD_TYPES, EVERYDAY_TYPE_IDS, FORM_GROUPS } from '../data/conjugationTypes.js';

const TYPE_ID_SET = new Set(ALL_CARD_TYPES.map((type) => type.id));
const TOPIC_BY_ID = new Map(FORM_GROUPS.map((topic) => [topic.id, topic]));
const TOPIC_ID_BY_TYPE_ID = new Map(
  FORM_GROUPS.flatMap((topic) => topic.typeIds.map((typeId) => [typeId, topic.id])),
);

export const PRACTICE_TOPIC_SECTIONS = [
  {
    id: 'everyday',
    label: 'Everyday forms',
    topicIds: [
      'basic-tenses',
      'te-ta-sound-changes',
      'volitional',
      'wanting',
      'potential',
      'progressive',
    ],
  },
  {
    id: 'connecting',
    label: 'Conditions and direction',
    topicIds: ['conditional', 'commands', 'requests', 'permission', 'obligation'],
  },
  {
    id: 'voice',
    label: 'Voice and advanced forms',
    topicIds: [
      'passive',
      'causative',
      'causative-passive',
      'honorific',
      'humble',
      'negative-connectors',
      'conjecture',
    ],
  },
  {
    id: 'adjectives',
    label: 'Adjectives',
    topicIds: [
      'adjective-core',
      'adjective-connectors',
      'adjective-conditionals',
      'adjective-patterns',
    ],
  },
];

export const FEATURED_PRACTICE_TOPIC_IDS = [
  'volitional',
  'wanting',
  'potential',
  'conditional',
  'te-ta-sound-changes',
  'basic-tenses',
];

function validTypeIds(typeIds = []) {
  return [...new Set(typeIds)].filter((typeId) => TYPE_ID_SET.has(typeId));
}

function defaultCustomTypeIdsByTopic() {
  const everyday = new Set(EVERYDAY_TYPE_IDS);
  return Object.fromEntries(
    FORM_GROUPS.map((topic) => {
      const everydayTypes = topic.typeIds.filter((typeId) => everyday.has(typeId));
      return [topic.id, everydayTypes.length ? everydayTypes : [...topic.typeIds]];
    }),
  );
}

export function defaultPracticeSelection() {
  const selectedTypeIdsByTopic = defaultCustomTypeIdsByTopic();
  const selectedTopicIds = FORM_GROUPS.filter((topic) =>
    topic.typeIds.some((typeId) => EVERYDAY_TYPE_IDS.includes(typeId)),
  ).map((topic) => topic.id);
  return {
    mixed: true,
    selectedTopicIds,
    selectedTypeIdsByTopic,
  };
}

export function normalizePracticeSelection(selection) {
  const base = defaultPracticeSelection();
  if (!selection || typeof selection !== 'object') return base;
  const selectedTopicIds = [...new Set(selection.selectedTopicIds || [])].filter((topicId) =>
    TOPIC_BY_ID.has(topicId),
  );
  const selectedTypeIdsByTopic = Object.fromEntries(
    FORM_GROUPS.map((topic) => {
      const requested = validTypeIds(selection.selectedTypeIdsByTopic?.[topic.id] || []).filter(
        (typeId) => topic.typeIds.includes(typeId),
      );
      return [topic.id, requested.length ? requested : base.selectedTypeIdsByTopic[topic.id]];
    }),
  );
  return {
    mixed: selection.mixed !== false,
    selectedTopicIds: selectedTopicIds.length ? selectedTopicIds : base.selectedTopicIds,
    selectedTypeIdsByTopic,
  };
}

export function effectiveTypeIdsForPracticeSelection(selection) {
  const normalized = normalizePracticeSelection(selection);
  if (normalized.mixed) return [...EVERYDAY_TYPE_IDS];
  const selected = new Set(normalized.selectedTopicIds);
  return FORM_GROUPS.flatMap((topic) =>
    selected.has(topic.id) ? normalized.selectedTypeIdsByTopic[topic.id] || topic.typeIds : [],
  );
}

export function toggleMixedPracticeSelection(selection) {
  const normalized = normalizePracticeSelection(selection);
  return { ...normalized, mixed: !normalized.mixed };
}

export function togglePracticeTopicSelection(selection, topicId) {
  const topic = TOPIC_BY_ID.get(topicId);
  if (!topic) return normalizePracticeSelection(selection);
  const normalized = normalizePracticeSelection(selection);
  if (normalized.mixed) {
    return {
      ...normalized,
      mixed: false,
      selectedTopicIds: [topic.id],
      selectedTypeIdsByTopic: {
        ...normalized.selectedTypeIdsByTopic,
        [topic.id]: [...topic.typeIds],
      },
    };
  }
  const selected = new Set(normalized.selectedTopicIds);
  if (selected.has(topic.id)) {
    if (selected.size === 1) return normalized;
    selected.delete(topic.id);
  } else {
    selected.add(topic.id);
  }
  return {
    ...normalized,
    selectedTopicIds: FORM_GROUPS.map((item) => item.id).filter((id) => selected.has(id)),
  };
}

export function togglePracticeTypeSelection(selection, typeId) {
  const topicId = TOPIC_ID_BY_TYPE_ID.get(typeId);
  const topic = TOPIC_BY_ID.get(topicId);
  if (!topic) return normalizePracticeSelection(selection);
  const normalized = normalizePracticeSelection(selection);
  const current = new Set(normalized.selectedTypeIdsByTopic[topicId] || topic.typeIds);
  if (current.has(typeId)) {
    if (current.size === 1) return normalized;
    current.delete(typeId);
  } else {
    current.add(typeId);
  }
  return {
    ...normalized,
    mixed: false,
    selectedTopicIds: normalized.selectedTopicIds.includes(topicId)
      ? normalized.selectedTopicIds
      : [...normalized.selectedTopicIds, topicId],
    selectedTypeIdsByTopic: {
      ...normalized.selectedTypeIdsByTopic,
      [topicId]: topic.typeIds.filter((id) => current.has(id)),
    },
  };
}

export function practiceSelectionForTopic(topicId, selection = null) {
  const topic = TOPIC_BY_ID.get(topicId);
  if (!topic) return normalizePracticeSelection(selection);
  const normalized = normalizePracticeSelection(selection);
  return {
    ...normalized,
    mixed: false,
    selectedTopicIds: [topic.id],
    selectedTypeIdsByTopic: {
      ...normalized.selectedTypeIdsByTopic,
      [topic.id]: [...topic.typeIds],
    },
  };
}

export function practiceSelectionForTypeIds(typeIds, selection = null) {
  const requested = validTypeIds(typeIds);
  if (!requested.length) return normalizePracticeSelection(selection);
  const normalized = normalizePracticeSelection(selection);
  const requestedSet = new Set(requested);
  const selectedTopicIds = FORM_GROUPS.filter((topic) =>
    topic.typeIds.some((typeId) => requestedSet.has(typeId)),
  ).map((topic) => topic.id);
  const selectedTypeIdsByTopic = { ...normalized.selectedTypeIdsByTopic };
  for (const topicId of selectedTopicIds) {
    const topic = TOPIC_BY_ID.get(topicId);
    selectedTypeIdsByTopic[topicId] = topic.typeIds.filter((typeId) => requestedSet.has(typeId));
  }
  return { mixed: false, selectedTopicIds, selectedTypeIdsByTopic };
}

export function updateStatePracticeSelection(state, nextSelection) {
  const practiceSelection = normalizePracticeSelection(nextSelection);
  return {
    ...state,
    practiceSelection,
    enabledTypes: effectiveTypeIdsForPracticeSelection(practiceSelection),
  };
}

export function mergePracticeSelections(local, cloud) {
  const left = normalizePracticeSelection(local);
  const right = normalizePracticeSelection(cloud);
  const selected = new Set([...left.selectedTopicIds, ...right.selectedTopicIds]);
  return normalizePracticeSelection({
    mixed: left.mixed && right.mixed,
    selectedTopicIds: FORM_GROUPS.map((topic) => topic.id).filter((topicId) =>
      selected.has(topicId),
    ),
    selectedTypeIdsByTopic: Object.fromEntries(
      FORM_GROUPS.map((topic) => [
        topic.id,
        topic.typeIds.filter(
          (typeId) =>
            left.selectedTypeIdsByTopic[topic.id]?.includes(typeId) ||
            right.selectedTypeIdsByTopic[topic.id]?.includes(typeId),
        ),
      ]),
    ),
  });
}

export function topicForPracticeType(typeId) {
  return TOPIC_BY_ID.get(TOPIC_ID_BY_TYPE_ID.get(typeId)) || null;
}

export function selectedPracticeTopics(selection) {
  const normalized = normalizePracticeSelection(selection);
  const selected = new Set(normalized.selectedTopicIds);
  return FORM_GROUPS.filter((topic) => selected.has(topic.id));
}
