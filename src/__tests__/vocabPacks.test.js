import { describe, expect, it } from 'vitest';
import { VOCAB_PACKS } from '../data/vocabPacks.js';

describe('vocab packs', () => {
  it('includes an opt-in pack for godan ru traps with true ichidan contrasts', () => {
    const pack = VOCAB_PACKS.find((candidate) => candidate.id === 'ru-trap-verbs');

    expect(pack).toBeTruthy();
    expect(pack.name).toBe('る-Trap Verbs');
    expect(pack.words.find((word) => word.dict === '切る')).toMatchObject({
      reading: 'きる',
      group: 'godan',
    });
    expect(pack.words.find((word) => word.dict === '着る')).toMatchObject({
      reading: 'きる',
      group: 'ichidan',
    });
    expect(pack.words.filter((word) => word.group === 'godan')).toHaveLength(10);
    expect(pack.words.filter((word) => word.group === 'ichidan')).toHaveLength(4);
  });
});
