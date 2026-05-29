import * as assert from 'assert';

import { resolveRules, validateMessage } from '../validate';

suite('validateMessage', () => {
  test('valid conventional message passes against default rules', async () => {
    const rules = await resolveRules({});
    const result = await validateMessage(
      'feat: add a clean short subject',
      rules,
    );
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.problems, []);
  });

  test('over-long header fails with a readable problem', async () => {
    const rules = await resolveRules({ subjectLength: 50 });
    const longHeader = 'feat: ' + 'x'.repeat(80);
    const result = await validateMessage(longHeader, rules);
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.problems.some((p) => /header must not be longer than 50/.test(p)),
      `expected a header-length problem, got: ${JSON.stringify(result.problems)}`,
    );
  });

  test('degrades to valid when a rule has no implementation', async () => {
    // Repo configs that reference plugin rules resolve to raw configs the
    // bundled @commitlint/lint cannot run; it throws "Found rules without
    // implementation". Validation must pass through, never lose the message.
    const result = await validateMessage('feat: ok', {
      'some-nonexistent-plugin-rule': [2, 'always'],
    });
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.problems, []);
    assert.strictEqual(result.degraded, true);
  });
});

suite('resolveRules', () => {
  test('uses repo raw rules when provided', async () => {
    const rules = await resolveRules({
      rawRules: { 'type-enum': [2, 'always', ['feat', 'fix']] },
    });
    const result = await validateMessage('chore: tweak config', rules);
    assert.strictEqual(result.valid, false);
    assert.ok(result.problems.some((p) => /type must be one of/.test(p)));
  });

  test('repo raw rules take precedence over VSCode length settings', async () => {
    const rules = await resolveRules({
      rawRules: { 'header-max-length': [2, 'always', 100] },
      subjectLength: 10,
    });
    const result = await validateMessage(
      'feat: a forty character header here okay',
      rules,
    );
    assert.strictEqual(result.valid, true);
  });

  test('no config: subjectLength overrides conventional header-max-length', async () => {
    const rules = await resolveRules({ subjectLength: 20 });
    const result = await validateMessage(
      'feat: this header is way past twenty chars',
      rules,
    );
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.problems.some((p) => /header must not be longer than 20/.test(p)),
    );
  });

  test('no config: lineLength overrides conventional body-max-line-length', async () => {
    const rules = await resolveRules({ lineLength: 30 });
    const message =
      'feat: ok\n\n' +
      'this body line is definitely longer than thirty characters';
    const result = await validateMessage(message, rules);
    assert.strictEqual(result.valid, false);
    assert.ok(result.problems.some((p) => /body.*line.*30/i.test(p)));
  });
});
