import { describe, expect, it } from 'vitest';
import {
  contextualStatsForType,
  defaultPracticeStats,
  practiceTrendDays,
  recordPracticeAnswer,
} from '../utils/practiceStats.js';

describe('practice stats', () => {
  it('records lifetime, exact-form, topic, mode, and dated evidence together', () => {
    const at = new Date(2026, 8, 20, 12).getTime();
    let stats = recordPracticeAnswer(defaultPracticeStats(), {
      typeId: 'volitional',
      correct: true,
      responseMs: 900,
      mode: 'input',
      at,
    });
    stats = recordPracticeAnswer(stats, {
      typeId: 'polite-volitional',
      correct: false,
      responseMs: 1500,
      mode: 'choice',
      at,
    });

    const context = contextualStatsForType(stats, 'volitional');
    expect(stats.lifetime).toMatchObject({ attempted: 2, correct: 1, responseMs: 2400 });
    expect(stats.lifetime.byMode.input).toMatchObject({ attempted: 1, correct: 1 });
    expect(context.exact).toMatchObject({ attempted: 1, correct: 1 });
    expect(context.topic?.id).toBe('volitional');
    expect(context.topicTotals).toMatchObject({ attempted: 2, correct: 1 });
    expect(practiceTrendDays(stats, 1, at)[0]).toMatchObject({ attempted: 2, correct: 1 });
  });
});
