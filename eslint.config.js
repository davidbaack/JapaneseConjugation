import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

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
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...commonGlobals,
        ...browserGlobals,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...sharedRules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
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
