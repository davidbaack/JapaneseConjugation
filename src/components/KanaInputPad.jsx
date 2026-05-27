import React from 'react';
import { IconPen, IconX } from './Icons.jsx';

const KANA_PAD_ROWS = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', 'ゆ', 'よ', 'わ', 'を'],
  ['ら', 'り', 'る', 'れ', 'ろ', 'ん'],
  ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
  ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
  ['だ', 'ぢ', 'づ', 'で', 'ど'],
  ['ば', 'び', 'ぶ', 'べ', 'ぼ'],
  ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'], // Wait, was it 'ぴ' or 'pi'? Let's keep it 'ぴ' as in line 494: ['ぱ','ぴ','ぷ','ぺ','ぽ']
  ['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ー']
];

// Let's verify line 494 in monolith. Yes, it was 'ぴ' ('\u3074')
// Let's write the React component

export default function KanaInputPad({ open, onToggle, onInsert, onBackspace, onClear, onSubmit, canSubmit, noToggle }) {
  return (
    <div>
      {!noToggle && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={onToggle}
            className={`px-3 py-1.5 rounded-lg border text-sm inline-flex items-center gap-1.5 transition ${
              open
                ? 'bg-stone-800 border-stone-800 text-white dark:bg-indigo-600 dark:border-indigo-600 dark:text-white'
                : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:hover:bg-stone-800 dark:text-stone-300'
            }`}
          >
            <IconPen className="w-4 h-4" />
            Kana pad
          </button>
        </div>
      )}
      {open && (
        <div className="mt-2 rounded-2xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
          <div className="space-y-1.5" lang="ja">
            {KANA_PAD_ROWS.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {row.map((kana) => (
                  <button
                    key={kana}
                    type="button"
                    onClick={() => onInsert(kana)}
                    className="h-10 rounded-lg border border-stone-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-lg font-medium text-stone-800 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-indigo-950 dark:hover:border-indigo-800 dark:text-stone-200 transition"
                  >
                    {kana}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              type="button"
              onClick={onBackspace}
              className="h-10 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-lg text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-300"
              aria-label="Backspace"
              title="Backspace"
            >
              ⌫
            </button>
            <button
              type="button"
              onClick={onClear}
              className="h-10 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-400 inline-flex items-center justify-center"
              aria-label="Clear answer"
              title="Clear"
            >
              <IconX className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              Enter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
