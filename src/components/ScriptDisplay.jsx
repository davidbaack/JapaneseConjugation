import React from 'react';
import { getConjugationParts } from '../utils/conjugator.js';

export default function ScriptDisplay({
  view,
  word,
  type,
  className = '',
  subClassName = 'text-sm text-stone-500 mt-1',
  colorHighlight = true
}) {
  if (!view) return null;
  const isJpn = view.lang !== 'en';
  
  if (colorHighlight && isJpn && word && type) {
    const mainParts = getConjugationParts(word, type, view.main);
    const rubyParts = view.ruby ? getConjugationParts(word, type, view.ruby) : null;
    
    return (
      <>
        <div className={`${className} inline-flex flex-wrap items-center tracking-wide`} lang={view.lang}>
          {mainParts.stem && (
            rubyParts && rubyParts.stem ? (
              <ruby className="text-indigo-600 dark:text-indigo-400 font-semibold">
                {mainParts.stem}
                <rt className="text-indigo-500 dark:text-indigo-400 font-medium text-[10px]">{rubyParts.stem}</rt>
              </ruby>
            ) : (
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{mainParts.stem}</span>
            )
          )}
          {mainParts.change && (
            rubyParts && rubyParts.change ? (
              <ruby className="text-amber-600 dark:text-amber-400 font-semibold">
                {mainParts.change}
                <rt className="text-amber-500 dark:text-amber-400 font-medium text-[10px]">{rubyParts.change}</rt>
              </ruby>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{mainParts.change}</span>
            )
          )}
          {mainParts.suffix && (
            rubyParts && rubyParts.suffix ? (
              <ruby className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {mainParts.suffix}
                <rt className="text-emerald-500 dark:text-emerald-400 font-medium text-[10px]">{rubyParts.suffix}</rt>
              </ruby>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{mainParts.suffix}</span>
            )
          )}
        </div>
        {view.sub && <div className={subClassName}>{view.sub}</div>}
      </>
    );
  }

  return (
    <>
      <div className={className} lang={view.lang}>
        {view.ruby ? <ruby>{view.main}<rt>{view.ruby}</rt></ruby> : view.main}
      </div>
      {view.sub && <div className={subClassName}>{view.sub}</div>}
    </>
  );
}
