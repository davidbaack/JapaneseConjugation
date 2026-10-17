import { describe, expect, it } from 'vitest';
import {
  bindTeachingPublication,
  validateTeachingPublicationPackage,
} from '../../scripts/publish-teaching-repair.js';
import { sourceRowSignature } from '../../scripts/review-sentence-corpus.js';

const id = 'godan:弾く|causative';
const segments = [{ t: 'ピアノを', r: '' }, { w: true }];
const oldReview = {
  status: 'accepted',
  version: 1,
  hash: 'old-hash',
  sense: 'play piano',
  basis: 'old-review',
};
const live = {
  word_key: 'godan:弾く',
  type: 'causative',
  dict: '弾く',
  reading: 'はじく',
  group: 'godan',
  surface: '弾かせる',
  ja_template: 'ピアノを{w}',
  en: 'Make someone play the piano.',
  segments,
  review: oldReview,
  model: JSON.stringify({ review: oldReview }),
  updated_at: 'server-time',
};
const record = {
  id,
  disposition: 'repaired',
  sourceReview: oldReview,
  baseline: {
    word: { dict: '弾く', reading: 'はじく', group: 'godan' },
    surface: '弾かせる',
    jaTemplate: live.ja_template,
    en: live.en,
    segments,
  },
  target: { word: { dict: '弾く', reading: 'ひく', group: 'godan' }, surface: '弾かせる' },
};
const tuple = [
  'godan:弾く',
  live.ja_template,
  live.en,
  segments,
  { ...oldReview, hash: 'new-hash' },
];
const bind = (rows = new Map([[id, live]]), entry = record) =>
  bindTeachingPublication([entry], rows, new Map([[id, tuple]]));

describe('exact teaching publication CAS', () => {
  it('derives CAS expectations from the actual row and writes only reviewed sentence fields', () => {
    const [bound] = bind();
    expect(bound.expected).toEqual(sourceRowSignature(live));
    expect(bound.row.reading).toBe('ひく');
    expect(bound.row.updated_at).toBeUndefined();
    expect(bound.target).toEqual(sourceRowSignature(bound.row));
  });
  it('refuses changed content, changed lexical identity, and deleted rows', () => {
    expect(() => bind(new Map())).toThrow(/deletion/i);
    expect(() => bind(new Map([[id, { ...live, en: 'Someone edited this sentence.' }]]))).toThrow(
      /edit/i,
    );
    expect(() => bind(new Map([[id, { ...live, reading: 'different' }]]))).toThrow(/edit/i);
    for (const change of [
      { status: 'quarantined' },
      { sense: 'different meaning' },
      { basis: 'later independent decision' },
      { version: 2 },
    ]) {
      const review = { ...oldReview, ...change };
      expect(() =>
        bind(new Map([[id, { ...live, review, model: JSON.stringify({ review }) }]])),
      ).toThrow(/edit/i);
      expect(() =>
        bind(new Map([[id, { ...live, review, model: JSON.stringify({ review }) }]]), {
          ...record,
          disposition: 'withheld',
        }),
      ).toThrow(/edit/i);
    }
  });
  it('keeps withheld content unavailable without deleting it and allows exact retry targets', () => {
    const [quarantined] = bind(undefined, { ...record, disposition: 'withheld' });
    expect(quarantined.row.review.status).toBe('quarantined');
    expect(quarantined.row.ja_template).toBe(live.ja_template);
    const [target] = bind();
    expect(bind(new Map([[id, target.row]]))[0].row).toEqual(target.row);
  });
  it('reconstructs package targets and exact ID coverage instead of trusting package contents', () => {
    const items = bind();
    const source = new Map([[id, live]]);
    const corpus = new Map([[id, tuple]]);
    expect(validateTeachingPublicationPackage([record], source, corpus, items)).toBe(true);
    expect(() => validateTeachingPublicationPackage([record], source, corpus, [])).toThrow(
      /exact reviewed IDs/i,
    );
    expect(() =>
      validateTeachingPublicationPackage([record], source, corpus, [...items, ...items]),
    ).toThrow(/exact reviewed IDs/i);
    const edited = globalThis.structuredClone(items);
    edited[0].row.en = 'Unreviewed replacement.';
    edited[0].target = sourceRowSignature(edited[0].row);
    expect(() => validateTeachingPublicationPackage([record], source, corpus, edited)).toThrow(
      /editorial target/i,
    );
  });
  it('allows a complete separately verified historical source signature without permitting later quarantine', () => {
    const olderReview = { ...oldReview, hash: 'archived-hash' };
    const older = {
      ...live,
      surface: 'old-rendering',
      review: olderReview,
      model: JSON.stringify({ review: olderReview }),
    };
    const history = new Map([[id, older]]);
    expect(
      bindTeachingPublication([record], new Map([[id, older]]), new Map([[id, tuple]]), history)[0]
        .row.reading,
    ).toBe('ひく');
    const quarantined = { ...older, review: { ...olderReview, status: 'quarantined' } };
    expect(() =>
      bindTeachingPublication(
        [record],
        new Map([[id, quarantined]]),
        new Map([[id, tuple]]),
        history,
      ),
    ).toThrow(/edit/i);
    const annotated = { ...older, review: { ...olderReview, extra: 'later editorial note' } };
    expect(() =>
      bindTeachingPublication(
        [record],
        new Map([[id, annotated]]),
        new Map([[id, tuple]]),
        history,
      ),
    ).toThrow(/edit/i);
  });
});
