import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  module: 'readonly',
  require: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
};

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-side JS: api/ serverless functions, scripts/, api/__tests__/, and
    // the root dev harnesses. The app itself is TS (src/**) — every tracked
    // .js/.mjs file in this repo executes under Node, where console, process,
    // etc. are real globals rather than the browser's.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: nodeGlobals },
    rules: { 'no-undef': 'off' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.expo/',
      'android/',
      'ios/',
      '*.config.js',
    ],
  },
];
