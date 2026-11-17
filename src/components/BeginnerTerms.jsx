import React from 'react';
import { BEGINNER_TERMS } from '../data/lessonContent.js';

export default function BeginnerTerms() {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {BEGINNER_TERMS.map(({ term, definition }) => (
        <div key={term}>
          <dt className="font-semibold text-stone-900 dark:text-stone-100">{term}</dt>
          <dd className="mt-1 leading-relaxed text-stone-600 dark:text-stone-300">{definition}</dd>
        </div>
      ))}
    </dl>
  );
}
