import { describe, it, expect } from 'vitest';
import {
  clearMinimalPairPrefs,
  getMinimalPairSet,
  minimalPairEligibleWords,
  minimalPairFeedbackForCard,
  minimalPairReturnEnabledTypes,
  practicePrefsForMinimalPairSet,
  recommendMinimalPairSets,
  recordMinimalPairResult,
} from '../utils/minimalPairs.js';
import { defaultState, selectNext } from '../utils/storage.js';

const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const HASHIRU = { dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' };
const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const TAKAI = { dict: '高い', reading: 'たかい', meaning: 'expensive', group: 'i-adjective' };
const SHIZUKA = { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' };

describe('minimal-pair drill library', () => {
  it('defines eligible words for manual contrast sets', () => {
    const ruSet = getMinimalPairSet('ichidan-godan-ru');
    const adjSet = getMinimalPairSet('i-adj-na-adj');

    expect(minimalPairEligibleWords([TABERU, HASHIRU, KAKU], ruSet).map((w) => w.dict)).toEqual([
      '食べる',
      '走る',
    ]);
    expect(minimalPairEligibleWords([TAKAI, SHIZUKA, KAKU], adjSet).map((w) => w.dict)).toEqual([
      '高い',
      '静か',
    ]);
  });

  it('selects only cards inside the active minimal-pair set', () => {
    const set = getMinimalPairSet('ichidan-godan-ru');
    const prefs = practicePrefsForMinimalPairSet(set, {});
    const card = selectNext(defaultState(), [TABERU, HASHIRU, KAKU], [], null, prefs);

    expect(set.description).toContain('ます form');
    expect(set.contrasts.find((c) => c.id === 'godan-ru')?.cue).toContain('hashirimasu');
    expect(set.typeIds).toContain(card.type);
    expect([TABERU.dict, HASHIRU.dict]).toContain(card.verb.dict);
  });

  it('restores the prior list, filters, mode, and types after a drill', () => {
    const set = getMinimalPairSet('ichidan-godan-ru');
    const original = {
      drillMode: 'transformation',
      wordListIds: ['favorites'],
      wordTypes: ['verb', 'i-adjective'],
      wordGroups: ['ichidan', 'godan', 'i-adjective'],
    };
    const prefs = practicePrefsForMinimalPairSet(set, original, {
      enabledTypes: ['plain-past', 'te-form'],
    });

    expect(prefs).toMatchObject({
      minimalPairSetId: set.id,
      drillMode: 'word',
      wordListIds: [],
      wordTypes: set.wordTypes,
      wordGroups: set.wordGroups,
    });
    expect(minimalPairReturnEnabledTypes(prefs)).toEqual(['plain-past', 'te-form']);

    const restored = clearMinimalPairPrefs(prefs);
    expect(restored).toMatchObject({
      minimalPairSetId: '',
      minimalPairReturn: null,
      drillMode: 'transformation',
      wordListIds: ['favorites'],
      wordTypes: ['verb', 'i-adjective'],
      wordGroups: ['ichidan', 'godan', 'i-adjective'],
    });
  });

  it('keeps the original return snapshot when switching contrast sets', () => {
    const first = getMinimalPairSet('ichidan-godan-ru');
    const second = getMinimalPairSet('i-adj-na-adj');
    const prefs = practicePrefsForMinimalPairSet(
      second,
      practicePrefsForMinimalPairSet(
        first,
        { wordListIds: ['custom-list'], wordTypes: ['verb'], wordGroups: ['godan'] },
        { enabledTypes: ['plain-negative'] },
      ),
      { enabledTypes: first.typeIds },
    );

    expect(prefs.minimalPairSetId).toBe(second.id);
    expect(prefs.minimalPairReturn.wordListIds).toEqual(['custom-list']);
    expect(minimalPairReturnEnabledTypes(prefs)).toEqual(['plain-negative']);
  });

  it('recommends a contrast set after repeated related mistakes', () => {
    const state = {
      ...defaultState(),
      mistakes: [
        {
          key: 'godan|走る|plain-past|dictionary',
          dict: '走る',
          reading: 'はしる',
          meaning: 'to run',
          group: 'godan',
          type: 'plain-past',
          count: 2,
          resolved: false,
        },
      ],
    };

    const recommendations = recommendMinimalPairSets(state, [TABERU, HASHIRU], 3);
    expect(recommendations.map((r) => r.set.id)).toContain('ichidan-godan-ru');
  });

  it('tracks results under the active contrast set and branch', () => {
    const progress = recordMinimalPairResult(
      { bySet: {} },
      'ichidan-godan-ru',
      HASHIRU,
      'plain-past',
      false,
    );

    const stats = progress.bySet['ichidan-godan-ru'];
    expect(stats.attempted).toBe(1);
    expect(stats.incorrect).toBe(1);
    expect(stats.byContrast['godan-ru'].incorrect).toBe(1);
  });

  it('builds feedback that explains both sides of the contrast', () => {
    const set = getMinimalPairSet('i-adj-na-adj');
    const feedback = minimalPairFeedbackForCard(set, TAKAI, 'adj-plain-negative');

    expect(feedback.active.id).toBe('i-adjective');
    expect(feedback.contrasts.map((c) => c.id)).toEqual(['i-adjective', 'na-adjective']);
  });

  it('adds the masu diagnostic to ichidan/godan ru feedback', () => {
    const set = getMinimalPairSet('ichidan-godan-ru');
    const feedback = minimalPairFeedbackForCard(set, HASHIRU, 'plain-past');

    expect(feedback.masuDiagnostic).toMatchObject({
      politeSurface: '走ります',
      kind: 'ri-shift',
    });
  });
});
