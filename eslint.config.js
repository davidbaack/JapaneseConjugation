import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        SpeechSynthesis: 'readonly',
        Audio: 'readonly',
        console: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        Promise: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        encodeURIComponent: 'readonly',
        decodeURIComponent: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        RegExp: 'readonly',
        Error: 'readonly',
        String: 'readonly',
        Boolean: 'readonly',
        Number: 'readonly',
        Symbol: 'readonly',
        Event: 'readonly',
        performance: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // Hydration patterns (loading state from localStorage in useEffect) are established here
      'react-hooks/set-state-in-effect': 'off',
      // Components defined inside render are an established pattern in this codebase
      'react-hooks/static-components': 'off',
      // Downgrade exhaustive-deps to warn — many intentional omissions in this codebase
      'react-hooks/exhaustive-deps': 'warn',
      // Silent catch blocks are an established pattern in this codebase
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Produces false positives for common let x = ''; if (cond) { x = val; } patterns
      'no-useless-assignment': 'off',
    },
  },
  // Disable ESLint rules that conflict with Prettier so formatting is owned
  // solely by Prettier (run `npm run format`); keep this last so it wins.
  prettier,
  {
    ignores: ['dist/', 'node_modules/', 'public/'],
  },
];
