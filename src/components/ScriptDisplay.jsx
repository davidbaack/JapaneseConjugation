import React from 'react';
import { getConjugationParts } from '../utils/conjugator.js';

const KANJI_RE = /[\u3400-\u9fff]/u;

function readableRuby(text, ruby) {
  const base = String(text || '');
  const reading = String(ruby || '');
  if (!base || !reading || base === reading || !KANJI_RE.test(base)) return '';
  return reading;
}

function RubySegment({ text, ruby, className = '', rtClassName = '' }) {
  const reading = readableRuby(text, ruby);
  if (!reading) return <span className={className}>{text}</span>;
  return (
    <ruby className={className}>
      {text}
      <rt className={rtClassName}>{reading}</rt>
    </ruby>
  );
}

export default function ScriptDisplay({
  view,
  word = null,
  type = null,
  className = '',
  subClassName = 'text-sm text-stone-500 mt-1',
  colorHighlight = true,
}) {
  if (!view) return null;
  const isJpn = view.lang !== 'en';

  if (Array.isArray(view.parts) && view.parts.length) {
    return (
      <>
        <div className={className} lang={view.lang}>
          {view.parts.map((part, index) => {
            const reading = readableRuby(part.text, part.ruby);
            return reading ? (
              <ruby key={`${part.text}:${index}`}>
                {part.text}
                <rt className="text-[10px] font-medium text-stone-500 dark:text-stone-300">
                  {reading}
                </rt>
              </ruby>
            ) : (
              <React.Fragment key={`${part.text}:${index}`}>{part.text}</React.Fragment>
            );
          })}
        </div>
        {view.sub && <div className={subClassName}>{view.sub}</div>}
      </>
    );
  }

  if (colorHighlight && isJpn && word && type) {
    const mainParts = getConjugationParts(word, type, view.main);
    const rubyParts = view.ruby ? getConjugationParts(word, type, view.ruby) : null;

    return (
      <>
        <div
          className={`${className} inline-flex flex-wrap items-center tracking-wide`}
          lang={view.lang}
        >
          {mainParts.stem &&
            (rubyParts && rubyParts.stem ? (
              <RubySegment
                text={mainParts.stem}
                ruby={rubyParts.stem}
                className="text-indigo-600 dark:text-indigo-400 font-semibold"
                rtClassName="text-indigo-500 dark:text-indigo-400 font-medium text-[10px]"
              />
            ) : (
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                {mainParts.stem}
              </span>
            ))}
          {mainParts.change &&
            (rubyParts && rubyParts.change ? (
              <RubySegment
                text={mainParts.change}
                ruby={rubyParts.change}
                className="text-amber-600 dark:text-amber-400 font-semibold"
                rtClassName="text-amber-500 dark:text-amber-400 font-medium text-[10px]"
              />
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                {mainParts.change}
              </span>
            ))}
          {mainParts.suffix &&
            (rubyParts && rubyParts.suffix ? (
              <RubySegment
                text={mainParts.suffix}
                ruby={rubyParts.suffix}
                className="text-emerald-600 dark:text-emerald-400 font-semibold"
                rtClassName="text-emerald-500 dark:text-emerald-400 font-medium text-[10px]"
              />
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {mainParts.suffix}
              </span>
            ))}
        </div>
        {view.sub && <div className={subClassName}>{view.sub}</div>}
      </>
    );
  }

  return (
    <>
      <div className={className} lang={view.lang}>
        {readableRuby(view.main, view.ruby) ? (
          <ruby>
            {view.main}
            <rt>{readableRuby(view.main, view.ruby)}</rt>
          </ruby>
        ) : (
          view.main
        )}
      </div>
      {view.sub && <div className={subClassName}>{view.sub}</div>}
    </>
  );
}
