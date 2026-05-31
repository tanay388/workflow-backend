// @ts-check
import { createRequire } from 'node:module';
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Quality caps + banned-import rules live in JSON so the lint-gate test can
// assert the exact same configuration (single source of truth, TRD §3.1).
const require = createRequire(import.meta.url);
/** @type {Record<string, unknown>} */
const qualityRules = require('./lint-rules.json');

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Code-quality caps + banned constructs (TRD §3.1) — see lint-rules.json.
      ...qualityRules,

      // ─── General TS — keep unsafe-* visible but non-blocking for infra ────
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // ─── Owning-module exemptions (the only places these are allowed) ────────
  { files: ['src/common/crypto/**/*.ts'], rules: { 'no-restricted-imports': 'off' } },
  { files: ['src/common/database/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },
  { files: ['src/common/config/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },
  { files: ['src/common/llm/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },
  { files: ['src/connections/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },

  // ─── Tests — relax size + type-safety caps ───────────────────────────────
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
