import { DEFAULT_PREFS } from '../../data/defaults.js';
import { wordKey } from '../../utils/conjugator.js';
import { mergePracticePrefs } from '../../utils/display.js';
import { recordGuideAttempt } from '../../utils/guidePractice.js';
import { bumpSessionMistakePattern, diagnoseMistake } from '../../utils/mistakeDiagnosis.js';
import { practiceSelectionForTypeIds } from '../../utils/practiceSelection.js';
import { recordPracticeAnswer } from '../../utils/practiceStats.js';
import { recordReadinessAttempt } from '../../utils/readiness.js';
import { formFamilyForType } from '../../utils/reviewScope.js';
import { cardIdFor, defaultState, gradeCard } from '../../utils/storage.js';
import { recordWeaknessAttempt } from '../../utils/subcategoryWeakness.js';

export const SNAPSHOT_AT = Date.parse('2026-10-07T12:00:00.000Z');
export const SNAPSHOT_WORD = {
  dict: '食べる',
  reading: 'たべる',
  meaning: 'to eat',
  group: 'ichidan',
};
export const SNAPSHOT_OTHER_WORD = {
  dict: '書く',
  reading: 'かく',
  meaning: 'to write',
  group: 'godan',
};

// A learner with real word/form identifiers and coherent diagnostic evidence.
// This covers every persisted state bucket, rather than exporting empty defaults
// that could survive a destructive reset unnoticed.
export function makeLearnerSnapshot() {
  const state = defaultState();
  const cardId = cardIdFor(SNAPSHOT_WORD, 'plain-past');
  state.practiceSelection = practiceSelectionForTypeIds(['plain-past', 'te-form']);
  state.enabledTypes = ['plain-past', 'te-form'];

  for (let index = 0; index < 7; index += 1) {
    const at = SNAPSHOT_AT + index * 1000;
    const correct = index % 3 !== 0;
    const responseMs = 1500 + index * 100;
    const assisted = index === 2;
    const mode = assisted ? 'self-check' : 'input';
    state.cards[cardId] = gradeCard(state.cards[cardId], correct, at);
    state.practiceStats = recordPracticeAnswer(state.practiceStats, {
      typeId: 'plain-past',
      correct,
      responseMs,
      mode,
      at,
    });
    state.readiness = recordReadinessAttempt(state.readiness, cardId, {
      correct,
      responseMs,
      answerMode: mode,
      now: at,
    });
    state.weakness = recordWeaknessAttempt(state.weakness, {
      word: SNAPSHOT_WORD,
      typeId: 'plain-past',
      correct,
      responseMs,
      now: at,
    });
    state.guide = recordGuideAttempt(
      state.guide,
      {
        word: SNAPSHOT_WORD,
        typeId: 'plain-past',
        sourceTypeId: 'polite-present',
        expectedGroup: 'ichidan',
      },
      {
        correct,
        assisted,
        steps: {
          base: { correct: true, assisted: false },
          group: { correct: true, assisted: false },
          answer: { correct, assisted },
        },
      },
      { now: at, eventId: `snapshot-guide-${index}` },
    );
  }

  const reverseId = cardIdFor(SNAPSHOT_OTHER_WORD, 'dictionary');
  state.cards[reverseId] = {
    ...gradeCard(null, true, SNAPSHOT_AT + 8000),
    sourceType: 'te-form',
    sourceTypeStats: { 'te-form': { correct: 1, incorrect: 0, lastSeen: SNAPSHOT_AT + 8000 } },
  };
  state.practiceStats = recordPracticeAnswer(state.practiceStats, {
    typeId: 'te-form',
    correct: true,
    responseMs: 2100,
    mode: 'choice',
    at: SNAPSHOT_AT + 8000,
  });
  state.readiness = recordReadinessAttempt(
    state.readiness,
    cardIdFor(SNAPSHOT_OTHER_WORD, 'te-form'),
    {
      correct: true,
      responseMs: 2100,
      answerMode: 'choice',
      now: SNAPSHOT_AT + 8000,
    },
  );
  state.weakness = recordWeaknessAttempt(state.weakness, {
    word: SNAPSHOT_OTHER_WORD,
    typeId: 'te-form',
    correct: true,
    responseMs: 2100,
    now: SNAPSHOT_AT + 8000,
  });

  state.verbStats = { 食べる: { [cardId]: { seen: 7, incorrect: 3 } } };
  state.retryQueue = [cardId];
  state.mistakes = [
    {
      key: 'ichidan|食べる|plain-past|dictionary',
      ...SNAPSHOT_WORD,
      type: 'plain-past',
      promptType: null,
      userAnswer: 'たべたない',
      expected: 'たべた',
      at: SNAPSHOT_AT,
      count: 3,
      resolved: false,
    },
  ];
  state.shadow = {
    attempted: 3,
    totalRating: 7,
    byScenario: { greeting: { attempted: 3, totalRating: 7 } },
  };
  state.ambient = { sessions: 2, played: 4, lastAt: SNAPSHOT_AT };
  state.game = {
    played: 2,
    bestScore: 30,
    bestCombo: 3,
    byType: { 'plain-past': { attempted: 4, correct: 3, lastAt: SNAPSHOT_AT } },
    byWord: { [wordKey(SNAPSHOT_WORD)]: { attempted: 4, correct: 3, lastAt: SNAPSHOT_AT } },
  };
  state.onbin = {
    attempted: 3,
    correct: 2,
    hints: 1,
    streak: 1,
    bestStreak: 2,
    byPattern: { ku: { attempted: 3, correct: 2 } },
  };
  state.register = {
    attempted: 3,
    correct: 2,
    streak: 1,
    bestStreak: 2,
    byPattern: { humble: { attempted: 3, correct: 2 } },
    byVerb: { 食べる: { attempted: 3, correct: 2 } },
  };
  state.meaning = {
    attempted: 3,
    correct: 2,
    byWord: { [wordKey(SNAPSHOT_WORD)]: { attempted: 3, correct: 2 } },
  };
  state.mock = {
    taken: 2,
    bestPct: 80,
    lastPct: 80,
    lastScore: 4,
    lastTotal: 5,
    lastAt: SNAPSHOT_AT,
    bySkill: { production: { attempted: 5, correct: 4 } },
  };
  state.reader = {
    sessions: 2,
    chars: 30,
    encounters: 3,
    wordSeen: { [wordKey(SNAPSHOT_WORD)]: 3 },
    lastAt: SNAPSHOT_AT,
  };
  state.production = { attempted: 3, correct: 2, lastScore: 80, lastAt: SNAPSHOT_AT };
  const transformationBucket = { attempted: 3, correct: 2, lastAt: SNAPSHOT_AT };
  state.transformation = {
    ...transformationBucket,
    bySource: { 'polite-present': { ...transformationBucket } },
    byTarget: { 'plain-past': { ...transformationBucket } },
    byPair: { 'polite-present->plain-past': { ...transformationBucket } },
    byDirection: { forward: { ...transformationBucket } },
  };
  state.minimalPairs = {
    bySet: {
      'ichidan-godan-ru': {
        attempted: 3,
        correct: 2,
        incorrect: 1,
        streak: 1,
        bestStreak: 2,
        lastAt: SNAPSHOT_AT,
        byContrast: { 'ichidan-ru': { attempted: 3, correct: 2, incorrect: 1 } },
      },
    },
  };
  state.reference = {
    recentSearches: ['食べる'],
    history: [{ ...SNAPSHOT_WORD, lastAt: SNAPSHOT_AT, count: 2 }],
    selected: { ...SNAPSHOT_WORD, selectedAt: SNAPSHOT_AT },
    weakRules: [
      {
        key: 'ichidan|plain-past',
        group: 'ichidan',
        typeId: 'plain-past',
        kind: 'verb',
        label: 'Plain past',
        hint: 'Drop る and add た.',
        addedAt: SNAPSHOT_AT,
      },
    ],
  };
  state.reviewScope = {
    excludedWordKeys: [wordKey(SNAPSHOT_OTHER_WORD)],
    excludedFormFamilyIds: [formFamilyForType('potential').id],
    recommendations: [
      {
        id: 'snapshot-recommendation',
        source: 'lab',
        label: 'Past Practice',
        detail: 'Practice a familiar past form.',
        wordKeys: [wordKey(SNAPSHOT_WORD)],
        typeIds: ['plain-past'],
        suggestedCount: 4,
        createdAt: SNAPSHOT_AT,
      },
    ],
  };
  state.session = {
    reviewed: 8,
    correct: 5,
    skipped: 1,
    currentStreak: 2,
    bestStreak: 3,
    recentOutcomes: [
      {
        at: SNAPSHOT_AT + 8000,
        cardId: reverseId,
        kind: 'correct',
        label: '書く · Dictionary form',
      },
      { at: SNAPSHOT_AT + 7000, cardId, kind: 'missed', label: '食べる · Plain past' },
    ],
    mistakePatterns: {},
  };
  state.session = bumpSessionMistakePattern(
    state.session,
    diagnoseMistake({
      item: SNAPSHOT_WORD,
      type: 'plain-past',
      userAnswer: 'たべます',
      expected: 'たべた',
    }),
  );
  for (const pattern of Object.values(state.session.mistakePatterns))
    pattern.latestAt = SNAPSHOT_AT;
  state.classify = { attempted: 3, correct: 2, byGroup: { ichidan: { attempted: 3, correct: 2 } } };

  return {
    state,
    customVerbs: [
      {
        dict: '微笑む',
        reading: 'ほほえむ',
        meaning: 'to smile',
        group: 'godan',
        kind: 'verb',
        source: 'custom',
      },
    ],
    customAdjectives: [
      {
        dict: '眩しい',
        reading: 'まぶしい',
        meaning: 'dazzling',
        group: 'i-adjective',
        kind: 'i-adjective',
        source: 'custom',
      },
    ],
    wordLists: [
      {
        id: 'snapshot-list',
        name: 'My saved vocabulary',
        wordKeys: ['godan:微笑む', 'i-adjective:眩しい'],
        enabled: true,
      },
    ],
    practicePrefs: mergePracticePrefs({
      ...DEFAULT_PREFS,
      theme: 'dark',
      autoSpeak: true,
      sentenceMode: true,
      englishHints: 'show',
      answerMode: 'choice',
      wordListIds: ['snapshot-list'],
      jlptLevels: ['N5', 'N4'],
      displayScripts: { kanji: true, kana: true, romaji: true },
    }),
    syncConfig: { enabled: false, userId: '' },
    lastSyncedAt: 0,
    syncMeta: null,
  };
}

// Mirrors the actual v42 export whitelist, including its missing schemaVersion.
export function makeLegacyV42Backup(parts = makeLearnerSnapshot()) {
  const exportedFields = [
    'cards',
    'enabledTypes',
    'practiceSelection',
    'practiceStats',
    'verbStats',
    'mistakes',
    'shadow',
    'ambient',
    'game',
    'onbin',
    'meaning',
    'mock',
    'reader',
    'production',
    'guide',
    'reference',
    'classify',
  ];
  return {
    format: 'jp-verb-srs',
    version: 42,
    exportedAt: new Date(SNAPSHOT_AT).toISOString(),
    state: Object.fromEntries(exportedFields.map((key) => [key, parts.state[key]])),
    customVerbs: parts.customVerbs,
    customAdjectives: parts.customAdjectives,
    wordLists: parts.wordLists,
    practicePrefs: parts.practicePrefs,
  };
}
