import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

/**
 * Proves the quality gates (TRD §3.1, Phase 01 DoD #7) actually FAIL on
 * violations. Loads the SAME rule definitions the ESLint config uses
 * (lint-rules.json) and verifies fixtures with the real core rules.
 */
const allRules = JSON.parse(
  readFileSync(join(__dirname, '../../../lint-rules.json'), 'utf8'),
) as Record<string, Linter.RuleEntry>;

const rules: Linter.RulesRecord = {
  'max-lines': allRules['max-lines'],
  'max-lines-per-function': allRules['max-lines-per-function'],
  'no-restricted-syntax': allRules['no-restricted-syntax'],
  'no-restricted-imports': allRules['no-restricted-imports'],
};

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, {
    languageOptions: { parser: tseslint.parser as Linter.Parser },
    rules,
  });
}

function ruleIds(messages: Linter.LintMessage[]): (string | null)[] {
  return messages.map((m) => m.ruleId);
}

describe('lint quality gates', () => {
  it('flags `new DataSource()` (banned construct)', () => {
    const messages = lint('const ds = new DataSource({});');
    expect(ruleIds(messages)).toContain('no-restricted-syntax');
  });

  it('flags direct process.env access', () => {
    const messages = lint('const url = process.env.DATABASE_URL;');
    expect(ruleIds(messages)).toContain('no-restricted-syntax');
  });

  it('flags importing node:crypto', () => {
    const messages = lint("import { randomBytes } from 'node:crypto';");
    expect(ruleIds(messages)).toContain('no-restricted-imports');
  });

  it('flags an oversized file (> max lines)', () => {
    const oversized = Array.from({ length: 320 }, (_v, i) => `const a${i} = ${i};`).join('\n');
    const messages = lint(oversized);
    expect(ruleIds(messages)).toContain('max-lines');
  });

  it('passes clean code', () => {
    const messages = lint('export const ok = 1;\n');
    expect(messages).toHaveLength(0);
  });
});
