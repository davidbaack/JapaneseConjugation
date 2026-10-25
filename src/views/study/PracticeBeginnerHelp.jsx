import React from 'react';
import { BEGINNER_TERMS } from '../../data/lessonContent.js';

const PRACTICE_TERMS = [
  {
    term: 'Dictionary form',
    definition: 'The form used to look up a word. For verbs, it is also the plain non-past form.',
  },
  {
    term: 'Plain form',
    definition:
      'A form without a polite ending. Plain forms are used in casual speech and inside many sentence patterns. Plain Past asks for the past form, not the dictionary form.',
  },
  {
    term: 'Ichidan',
    definition: 'A verb group that drops its final ru before adding endings.',
  },
  {
    term: 'Godan',
    definition:
      'A verb group whose final kana changes with the ending. Some verbs ending in ru are godan; check the word’s group.',
  },
];

const EAT_EXAMPLE = {
  base: '食べる (たべる)',
  stem: '食べ (たべ)',
  negative: '食べない (たべない)',
  meaning: 'eat',
};

const SLEEP_EXAMPLE = {
  base: '寝る (ねる)',
  stem: '寝 (ね)',
  negative: '寝ない (ねない)',
  meaning: 'sleep',
};

export function BeginnerTerms({ practice = false }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {(practice ? PRACTICE_TERMS : BEGINNER_TERMS).map(({ term, definition }) => (
        <div key={term}>
          <dt className="font-semibold text-stone-900 dark:text-stone-100">{term}</dt>
          <dd className="mt-1 leading-relaxed text-stone-600 dark:text-stone-300">{definition}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function PracticeBeginnerHelp({ onLearnBasics, activeWord = null }) {
  const isEatCard = [activeWord?.dict, activeWord?.reading].some(
    (text) => text === '食べる' || text === 'たべる',
  );
  const example = isEatCard ? SLEEP_EXAMPLE : EAT_EXAMPLE;
  return (
    <details className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-stone-600 dark:text-stone-300">
        New to conjugation?
      </summary>
      <div className="space-y-4 border-t border-stone-100 p-3 dark:border-stone-800">
        <BeginnerTerms practice />
        <section
          aria-label="Worked example: Plain Negative"
          className="rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-950"
        >
          <h3 className="font-semibold text-stone-900 dark:text-stone-100">
            Worked example: Plain Negative
          </h3>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            A sample to follow before trying your current card.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-stone-700 dark:text-stone-300">
            <li>
              Start with <span lang="ja">{example.base}</span>, “to {example.meaning}.”
            </li>
            <li>
              This is ichidan: remove final <span lang="ja">る</span>, leaving{' '}
              <span lang="ja">{example.stem}</span>.
            </li>
            <li>
              Add <span lang="ja">ない</span>: <span lang="ja">{example.negative}</span>, “do not{' '}
              {example.meaning} / will not {example.meaning}.”
            </li>
          </ol>
        </section>
        <button
          type="button"
          onClick={onLearnBasics}
          className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
        >
          Learn Basics and Politeness
        </button>
      </div>
    </details>
  );
}
