import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const lint = async (code) => {
  const [result] = await eslint.lintText(code, { filePath: 'src/lint-fixture.jsx' });
  return result.messages;
};

describe('ESLint 10 React checks', () => {
  it('accepts automatic-runtime JSX, spread props, and object refs', async () => {
    expect(
      await lint(`import React, { useRef } from 'react';
        export function Example(props) {
          const ref = useRef(null);
          return <input {...props} ref={ref} />;
        }`),
    ).toEqual([]);
  });

  it.each([
    ['undefined JSX component', 'export const Example = () => <Missing />;', 'no-undef'],
    [
      'missing list key',
      'export const Example = () => [1, 2].map(n => <div>{n}</div>);',
      'react-x/no-missing-key',
    ],
    [
      'duplicate prop',
      'export const Example = () => <input id="a" id="b" />;',
      'jsx-safety/valid-props',
    ],
    ['string ref', 'export const Example = () => <input ref="old" />;', 'jsx-safety/valid-props'],
    [
      'expression string ref',
      'export const Example = () => <input ref={"old"} />;',
      'jsx-safety/valid-props',
    ],
    [
      'template string ref',
      'export const Example = () => <input ref={`old`} />;',
      'jsx-safety/valid-props',
    ],
    [
      'unknown DOM prop',
      'export const Example = () => <div class="a" />;',
      'react-dom/no-unknown-property',
    ],
    [
      'unsafe link',
      'export const Example = () => <a href="https://example.com" target="_blank">link</a>;',
      'react-dom/no-unsafe-target-blank',
    ],
    [
      'conditional hook',
      "import { useState } from 'react'; export function Example({ enabled }) { if (enabled) useState(0); return <div />; }",
      'react-hooks/rules-of-hooks',
    ],
  ])('rejects %s', async (_label, code, ruleId) => {
    expect(await lint(code)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId, severity: 2 })]),
    );
  });
});
