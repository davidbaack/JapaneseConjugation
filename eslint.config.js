import js from '@eslint/js';
import reactX from 'eslint-plugin-react-x';
import reactDom from 'eslint-plugin-react-dom';
import reactJsx from 'eslint-plugin-react-jsx';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

// The replacement plugins do not cover these two existing JSX safety checks.
const jsxSafety = {
  rules: {
    'valid-props': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          duplicate: 'Duplicate JSX prop {{name}}.',
          stringRef: 'String refs are unsupported; use a callback or object ref.',
        },
      },
      create(context) {
        return {
          JSXOpeningElement(node) {
            const seen = new Set();
            for (const attribute of node.attributes) {
              if (attribute.type !== 'JSXAttribute') continue;
              const name = context.sourceCode.getText(attribute.name);
              if (seen.has(name))
                context.report({ node: attribute, messageId: 'duplicate', data: { name } });
              seen.add(name);
              const value =
                attribute.value?.type === 'JSXExpressionContainer'
                  ? attribute.value.expression
                  : attribute.value;
              if (
                name === 'ref' &&
                ((value?.type === 'Literal' && typeof value.value === 'string') ||
                  value?.type === 'TemplateLiteral')
              )
                context.report({ node: attribute, messageId: 'stringRef' });
            }
          },
        };
      },
    },
  },
};

const commonGlobals = {
  AbortController: 'readonly',
  Array: 'readonly',
  Boolean: 'readonly',
  Date: 'readonly',
  Error: 'readonly',
  Event: 'readonly',
  JSON: 'readonly',
  Map: 'readonly',
  Math: 'readonly',
  Number: 'readonly',
  Object: 'readonly',
  Promise: 'readonly',
  RegExp: 'readonly',
  Set: 'readonly',
  String: 'readonly',
  Symbol: 'readonly',
  URL: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  decodeURIComponent: 'readonly',
  encodeURIComponent: 'readonly',
  fetch: 'readonly',
  isNaN: 'readonly',
  parseFloat: 'readonly',
  parseInt: 'readonly',
  performance: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
};

const browserGlobals = {
  Audio: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  SpeechSynthesis: 'readonly',
  SpeechSynthesisUtterance: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  sessionStorage: 'readonly',
  window: 'readonly',
};

const nodeGlobals = {
  Buffer: 'readonly',
  process: 'readonly',
};

const sharedRules = {
  'no-console': 'off',
  // Silent catch blocks are an established pattern in this codebase.
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
  // Produces false positives for common let x = ''; if (cond) { x = val; } patterns.
  'no-useless-assignment': 'off',
};

export default [
  {
    ignores: ['dist/', 'node_modules/', 'public/', 'temp-vite/', 'test-results/', 'tmp/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: commonGlobals,
    },
    rules: sharedRules,
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      'react-x': reactX,
      'react-dom': reactDom,
      'react-jsx': reactJsx,
      'jsx-safety': jsxSafety,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...commonGlobals,
        ...browserGlobals,
      },
    },
    settings: reactX.configs.recommended.settings,
    rules: {
      // Keep the existing correctness checks without adopting unrelated style
      // or React Compiler policies from the new plugin's recommended preset.
      // ESLint 10 handles JSX identifier references with its core rules.
      'react-x/no-missing-key': 'error',
      'react-x/no-missing-component-display-name': 'error',
      'react-x/no-direct-mutation-state': 'error',
      'react-x/no-component-will-mount': 'error',
      'react-x/no-component-will-receive-props': 'error',
      'react-x/no-component-will-update': 'error',
      'react-jsx/no-children-prop': 'error',
      'react-jsx/no-comment-textnodes': 'error',
      'react-dom/no-dangerously-set-innerhtml-with-children': 'error',
      'react-dom/no-find-dom-node': 'error',
      'react-dom/no-hydrate': 'error',
      'react-dom/no-render': 'error',
      'react-dom/no-render-return-value': 'error',
      'react-dom/no-unknown-property': 'error',
      'react-dom/no-unsafe-target-blank': 'error',
      'jsx-safety/valid-props': 'error',
      ...reactHooks.configs.recommended.rules,
      ...sharedRules,
      // Existing default imports are harmless with the automatic JSX runtime.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^(?:_|React$)', argsIgnorePattern: '^_' }],
      // Hydration patterns loading state from localStorage in useEffect are established here.
      'react-hooks/set-state-in-effect': 'off',
      // Components defined inside render are an established pattern in this codebase.
      'react-hooks/static-components': 'off',
      // Many intentional omissions remain in this codebase.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...commonGlobals,
        ...browserGlobals,
        ...nodeGlobals,
      },
    },
  },
  {
    files: ['*.config.js', 'eslint.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...commonGlobals,
        ...nodeGlobals,
      },
    },
  },
  // Disable ESLint rules that conflict with Prettier so formatting is owned
  // solely by Prettier. Keep this last so it wins.
  prettier,
];
