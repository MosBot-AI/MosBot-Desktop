import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.vite/**',
      'out/**',
      'test-results/**',
      'playwright-report/**',
      '.tmp/**',
      'docs/evidence/screens/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Playwright scripts embed browser-side `page.evaluate` bodies, so both
    // Node and browser globals are legitimate here.
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
