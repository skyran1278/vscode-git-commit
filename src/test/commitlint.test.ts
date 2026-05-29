import * as assert from 'assert';

import { loadCommitlintRules, parseRules } from '../commitlint';

suite('parseRules', () => {
  test('extracts type-enum', () => {
    const result = parseRules({
      'type-enum': [2, 'always', ['feat', 'fix', 'chore']],
    });
    assert.deepStrictEqual(result?.types, ['feat', 'fix', 'chore']);
  });

  test('extracts scope-enum', () => {
    const result = parseRules({
      'scope-enum': [2, 'always', ['core', 'ui', 'api']],
    });
    assert.deepStrictEqual(result?.scopes, ['core', 'ui', 'api']);
  });

  test('extracts header-max-length', () => {
    const result = parseRules({
      'header-max-length': [2, 'always', 72],
    });
    assert.strictEqual(result?.headerMaxLength, 72);
  });

  test('extracts body-max-line-length', () => {
    const result = parseRules({
      'body-max-line-length': [2, 'always', 100],
    });
    assert.strictEqual(result?.bodyMaxLineLength, 100);
  });

  test('extracts footer-max-line-length', () => {
    const result = parseRules({
      'footer-max-line-length': [2, 'always', 100],
    });
    assert.strictEqual(result?.footerMaxLineLength, 100);
  });

  test('extracts subject-case', () => {
    const result = parseRules({
      'subject-case': [2, 'never', ['sentence-case', 'start-case']],
    });
    assert.deepStrictEqual(result?.subjectCase, {
      condition: 'never',
      cases: ['sentence-case', 'start-case'],
    });
  });

  test('handles subject-case with single string value', () => {
    const result = parseRules({
      'subject-case': [2, 'always', 'lower-case'],
    });
    assert.deepStrictEqual(result?.subjectCase, {
      condition: 'always',
      cases: ['lower-case'],
    });
  });

  test('extracts subject-full-stop', () => {
    const result = parseRules({
      'subject-full-stop': [2, 'never', '.'],
    });
    assert.deepStrictEqual(result?.subjectFullStop, {
      condition: 'never',
      char: '.',
    });
  });

  test('ignores disabled rules (severity 0)', () => {
    const result = parseRules({
      'type-enum': [0, 'always', ['feat', 'fix']],
    });
    assert.strictEqual(result, undefined);
  });

  test('ignores type-enum with never condition', () => {
    const result = parseRules({
      'type-enum': [2, 'never', ['feat', 'fix']],
    });
    assert.strictEqual(result, undefined);
  });

  test('returns undefined when no recognized rules', () => {
    const result = parseRules({
      'some-unknown-rule': [2, 'always', 'value'],
    } as any);
    assert.strictEqual(result, undefined);
  });
});

suite('loadCommitlintRules', () => {
  test('returns raw rules and parsed subset from the repo config', async () => {
    const result = await loadCommitlintRules(process.cwd());
    assert.ok(result, 'expected commitlint rules to load');
    assert.ok(
      result.raw && Object.keys(result.raw).length > 0,
      'expected non-empty raw rules',
    );
    assert.ok(
      result.parsed?.types && result.parsed.types.length > 0,
      'expected parsed types from config-conventional',
    );
  });

  test('returns undefined when the directory has no commitlint config', async () => {
    const result = await loadCommitlintRules('/');
    assert.strictEqual(result, undefined);
  });
});

suite('parseRules extra', () => {
  test('extracts multiple rules together', () => {
    const result = parseRules({
      'type-enum': [2, 'always', ['feat', 'fix']],
      'header-max-length': [2, 'always', 72],
      'body-max-line-length': [1, 'always', 100],
      'subject-full-stop': [2, 'never', '.'],
    });
    assert.deepStrictEqual(result?.types, ['feat', 'fix']);
    assert.strictEqual(result?.headerMaxLength, 72);
    assert.strictEqual(result?.bodyMaxLineLength, 100);
    assert.deepStrictEqual(result?.subjectFullStop, {
      condition: 'never',
      char: '.',
    });
  });
});
